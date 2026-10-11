/**
 * A deterministic harness for the Ask AI agent: a scripted model drives the real agent (the
 * registry tools, their limits, and the approval rules) against a seeded bookmark tree, and a
 * test checks the outcome on the final tree. Each script step sees what the model would see (the
 * offered tools and every tool result so far) and returns the next tool calls or the answer.
 * It proves what the tools and rules allow, not how a real model behaves.
 */
import { MockLanguageModelV4 } from 'ai/test';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ActionContext } from '@/services/action-kit';
import { buildAskAIAgent } from '@/services/ai-agent.lazy';
import type { AISettings } from '@/services/ai-client';
import type { BookmarkTreeNode } from '@/types';

type LanguageModelV4CallOptions = Parameters<MockLanguageModelV4['doGenerate']>[0];
type LanguageModelV4Content = Awaited<
  ReturnType<MockLanguageModelV4['doGenerate']>
>['content'][number];

export type SeenToolResult = { toolName: string; output: unknown };

/** What a script step can look at. */
export type ScriptView = {
  /** Names of the tools offered in this step. */
  tools: string[];
  /** Every tool result in the conversation so far, oldest first. */
  results: SeenToolResult[];
  /** The latest tool result of this name, as the tool returned it. */
  last: (toolName: string) => unknown;
};

export type ScriptStep = (
  view: ScriptView,
) => { calls: { tool: string; input: Record<string, unknown> }[] } | { text: string };

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function viewOf(options: LanguageModelV4CallOptions): ScriptView {
  const results: SeenToolResult[] = options.prompt.flatMap((message) =>
    message.role === 'tool'
      ? message.content.flatMap((part) =>
          part.type === 'tool-result'
            ? [
                {
                  toolName: part.toolName,
                  output: part.output.type === 'json' ? part.output.value : part.output,
                },
              ]
            : [],
        )
      : [],
  );
  return {
    tools: (options.tools ?? []).map((tool) => tool.name),
    results,
    last: (toolName) => results.findLast((result) => result.toolName === toolName)?.output,
  };
}

/** A model that plays `steps` in order, one per model call. */
export function scriptedModel(steps: ScriptStep[]) {
  const calls: LanguageModelV4CallOptions[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      calls.push(options);
      const step = steps[calls.length - 1];
      if (!step) throw new Error(`The script has no step ${calls.length}.`);
      const next = step(viewOf(options));
      const content: LanguageModelV4Content[] =
        'text' in next
          ? [{ type: 'text', text: next.text }]
          : next.calls.map((call, index) => ({
              type: 'tool-call',
              toolCallId: `call-${calls.length}-${index}`,
              toolName: call.tool,
              input: JSON.stringify(call.input),
            }));
      return {
        content,
        finishReason: {
          unified: 'text' in next ? 'stop' : 'tool-calls',
          raw: undefined,
        },
        usage,
        warnings: [],
      };
    },
  });
  return { model, calls };
}

const settings: AISettings = {
  enabled: true,
  provider: 'custom',
  model: 'scripted',
  apiKey: '',
  baseUrl: 'https://provider.invalid/v1',
};

/** Runs one user message through the Ask AI agent with a scripted model. */
export async function runScriptedAgent(
  message: string,
  steps: ScriptStep[],
  toolContext: ActionContext,
  { maxSteps = 8 }: { maxSteps?: number } = {},
) {
  const { model, calls } = scriptedModel(steps);
  const agent = await buildAskAIAgent({
    settings,
    instructions: 'Scripted test agent',
    toolContext,
    webSearch: false,
    maxSteps,
    webSearchMaxUses: 1,
    model,
  });
  const result = await agent.generate({ prompt: message });
  return { result, calls, views: calls.map(viewOf) };
}

/** The whole tree as titles, URLs, and nesting, to compare before and after a run. */
export async function snapshotTree(): Promise<unknown> {
  const strip = (node: BookmarkTreeNode): unknown => ({
    id: node.id,
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(node.children ? { children: node.children.map(strip) } : {}),
  });
  return ((await fakeBrowser.bookmarks.getTree()) as BookmarkTreeNode[]).map(strip);
}
