/**
 * The Ask AI agent itself: the AI SDK tool-calling loop over the agent tool registry. It loads
 * with the Ask AI chat through `createAskAIAgent` in ai-agent.ts; like every `*.lazy.ts` file it
 * is left out of auto-imports, so import it only with `import()` or from another lazy module.
 */
import { isStepCount, type LanguageModel, type ToolSet, ToolLoopAgent, tool } from 'ai';
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

/** The registry tools this context can run, as AI SDK tools that run through `runAgentTool`. */
export async function createAgentToolSet(context: AgentToolContext): Promise<ToolSet> {
  const names = await availableAgentToolNames(context);
  return Object.fromEntries(
    names.map((name) => {
      const definition = getAgentTool(name);
      return [
        name,
        tool({
          description: definition.description,
          inputSchema: definition.input,
          execute: (input) => runAgentTool(name, input, context),
        }),
      ];
    }),
  );
}

export type AskAIAgentOptions = {
  settings: AISettings;
  instructions: string;
  toolContext: AgentToolContext;
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
    stopWhen: isStepCount(options.maxSteps),
  });
}
