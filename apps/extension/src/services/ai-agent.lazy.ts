/**
 * The Ask AI agent itself: the AI SDK tool-calling loop over the bookmark action registry. It loads
 * with the Ask AI chat through `createAskAIAgent` in ai-agent.ts; like every `*.lazy.ts` file it
 * is left out of auto-imports, so import it only with `import()` or from another lazy module.
 */
import {
  isStepCount,
  type LanguageModel,
  type ModelMessage,
  type ToolApprovalStatus,
  ToolLoopAgent,
  type ToolSet,
  tool,
} from 'ai';
import { createAIModel } from './ai-client.lazy';

/**
 * Built-in web search per provider, run by the provider itself. Each package types its tool
 * differently, so they are held as plain objects and typed as a tool where they join the set.
 * Each loads only its own provider package.
 */
const WEB_SEARCH_TOOLS: Record<
  WebSearchProvider,
  (options: { maxUses: number }) => Promise<object>
> = {
  openai: async () => (await import('@ai-sdk/openai')).openai.tools.webSearch({}),
  anthropic: async ({ maxUses }) =>
    (await import('@ai-sdk/anthropic')).anthropic.tools.webSearch_20250305({ maxUses }),
  google: async () => (await import('@ai-sdk/google')).google.tools.googleSearch({}),
  xai: async () => (await import('@ai-sdk/xai')).xai.tools.webSearch({}),
};

/** The registry actions AI may call in this context, as AI SDK tools that run `runAction`. */
export async function createAgentToolSet(context: ActionContext): Promise<ToolSet> {
  const names = await agentActionIds(context);
  return Object.fromEntries(
    names.flatMap((name) => {
      const { agent, input } = getAction(name);
      if (!agent || !input) return [];
      return [
        [
          name,
          tool({
            description: agent.description,
            inputSchema: input,
            execute: (args: unknown) => runAction(name, args, context),
          }),
        ],
      ];
    }),
  );
}

/** Whether a tool that brings in unreviewed text (page text, a web search) ran in `messages`. */
export function hasUntrustedContent(messages: readonly ModelMessage[]): boolean {
  return messages.some(
    (message) =>
      (message.role === 'tool' || message.role === 'assistant') &&
      Array.isArray(message.content) &&
      message.content.some(
        (part) =>
          (part.type === 'tool-result' || part.type === 'tool-call') &&
          (UNTRUSTED_ACTION_IDS.has(part.toolName) ||
            ASK_AI_WEB_SEARCH_TOOL_NAMES.has(part.toolName)),
      ),
  );
}

/** The approval rule of `actionApproval`, as the AI SDK's approval status for one call. */
export function askAIToolApproval({
  toolCall,
  messages,
}: {
  toolCall?: { toolName: string };
  messages: ModelMessage[];
}): ToolApprovalStatus {
  if (!toolCall) return undefined;
  const need = actionApproval(toolCall.toolName, {
    untrustedContentSeen: hasUntrustedContent(messages),
  });
  if (need === 'none') return undefined;
  return { type: 'user-approval', reason: need };
}

export type AskAIAgentOptions = {
  settings: AISettings;
  instructions: string;
  toolContext: ActionContext;
  /** Add the provider's built-in web search, where it has one. */
  webSearch: boolean;
  maxSteps: number;
  webSearchMaxUses: number;
  /** A model to use instead of the service's; tests drive the agent with a scripted one. */
  model?: LanguageModel;
};

export async function buildAskAIAgent(options: AskAIAgentOptions) {
  const { settings } = options;
  // First, so settings that cannot make a call fail before anything else loads.
  const model = options.model ?? (await createAIModel(settings, 'askAI'));
  const webSearchTool =
    options.webSearch && supportsWebSearch(settings.provider)
      ? await WEB_SEARCH_TOOLS[settings.provider]({ maxUses: options.webSearchMaxUses })
      : undefined;

  return new ToolLoopAgent({
    model,
    instructions: options.instructions,
    tools: {
      ...(await createAgentToolSet(options.toolContext)),
      ...(webSearchTool ? { [ASK_AI_WEB_SEARCH_TOOL]: webSearchTool as ToolSet[string] } : {}),
    },
    toolApproval: askAIToolApproval,
    stopWhen: isStepCount(options.maxSteps),
  });
}
