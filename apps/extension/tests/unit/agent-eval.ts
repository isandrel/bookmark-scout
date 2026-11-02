/**
 * A deterministic harness for Ask AI on Pi Durable: a scripted model drives the real conversation
 * service (`ask-ai-durable.lazy.ts`: the registry tools, their limits, and the approval rules)
 * against a seeded bookmark tree, with every action run as the background runs it, and a test
 * checks the outcome on the final tree. Each script step sees what the model would see (the
 * offered tools and every tool result so far, an approved call's result included) and returns the
 * next tool calls or the answer. It proves what the tools and rules allow, not how a real model
 * behaves.
 */
import { MemoryStorage } from '@earendil-works/pi-durable';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ActionContext } from '@/services/action-kit';
import { agentActionIds, checkActionCall, runAction } from '@/services/actions';
import { AskAIDurable, pendingApprovals } from '@/services/ask-ai-durable.lazy';
import type { BookmarkTreeNode } from '@/types';
import {
  finishPart,
  type StreamCallOptions,
  scriptedStreamModel,
  textParts,
  toolCallPart,
} from './scripted-stream-model';

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

/** How the service tells the model an approved call's result (`AskAIDurable.decide`). */
const APPROVED_OUTCOME = /^The user approved the (\w+) call \S+\. Its result: ([\s\S]*)$/;

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function viewOf(options: StreamCallOptions): ScriptView {
  const results: SeenToolResult[] = options.prompt.flatMap((message): SeenToolResult[] => {
    if (message.role === 'user') {
      const text = message.content
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('');
      const outcome = APPROVED_OUTCOME.exec(text);
      return outcome ? [{ toolName: outcome[1], output: parse(outcome[2]) }] : [];
    }
    if (message.role !== 'tool') return [];
    return message.content.flatMap((part) => {
      if (part.type !== 'tool-result') return [];
      const { output } = part;
      const value =
        output.type === 'text' || output.type === 'error-text'
          ? parse(output.value)
          : output.type === 'json'
            ? output.value
            : output;
      return [{ toolName: part.toolName, output: value }];
    });
  });
  const offered = (options.tools ?? []).map((tool) => tool.name);
  return {
    tools: offered,
    results,
    last: (toolName) =>
      [...results].reverse().find((result) => result.toolName === toolName)?.output,
  };
}

/** A model that plays `steps` in order, one per model call. */
function scriptedModel(steps: ScriptStep[]) {
  const { model, calls } = scriptedStreamModel(
    steps.map((step, index) => (options: StreamCallOptions) => {
      const next = step(viewOf(options));
      return 'text' in next
        ? [...textParts(next.text), finishPart('stop')]
        : [
            ...next.calls.map((call, position) =>
              toolCallPart(call.tool, call.input, `call-${index + 1}-${position}`),
            ),
            finishPart('tool-calls'),
          ];
    }),
  );
  return { model, calls };
}

/** An approval the agent asked for, and what the scripted user answered. */
export type SeenApproval = { toolName: string; input: unknown; reason?: string; approved: boolean };

/**
 * Runs one user message through Ask AI with a scripted model. When a call waits for approval,
 * `approve` answers as the user would (decline when left out) and the conversation carries on,
 * as the chat does.
 */
export async function runScriptedAgent(
  message: string,
  steps: ScriptStep[],
  toolContext: ActionContext,
  {
    maxSteps = 8,
    approve,
  }: {
    maxSteps?: number;
    approve?: (request: { toolName: string; input: unknown; reason?: string }) => boolean;
  } = {},
) {
  const { model, calls } = scriptedModel(steps);
  const tools = await agentActionIds(toolContext);
  const service = await AskAIDurable.open({
    storage: new MemoryStorage(),
    setup: async () => ({ system: 'Scripted test agent', tools, maxSteps }),
    languageModel: async () => model,
    callAction: (name, args, conversation) =>
      runAction(name, args, { ...toolContext, conversation }),
    checkAction: (name, args, conversation) =>
      checkActionCall(name, args, { ...toolContext, conversation }),
  });
  const approvals: SeenApproval[] = [];
  try {
    const chat = await service.createChat();
    await (await service.send(chat, message, 'scripted')).wait(service.context);
    for (;;) {
      const [pending] = pendingApprovals(await chat.context(service.context));
      if (!pending) break;
      const seen = {
        toolName: pending.approval.tool,
        input: pending.approval.args,
        reason: pending.approval.reason,
      };
      const approved = approve?.(seen) ?? false;
      approvals.push({ ...seen, approved });
      const decided = await service.decide(chat, pending.callId, approved);
      if (!decided.ok) break;
      await decided.submission.wait(service.context);
    }
    const entries = (await chat.context(service.context)).entries;
    const lastAnswer = [...entries]
      .flatMap((entry) => entry.model ?? [])
      .reverse()
      .find((entry) => entry.role === 'assistant');
    const text =
      lastAnswer?.role === 'assistant'
        ? lastAnswer.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('')
        : '';
    return { result: { text }, calls, views: calls.map(viewOf), approvals };
  } finally {
    await service.close();
  }
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
