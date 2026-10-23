/**
 * The Ask AI chat agent: a tool-calling loop over the user's default AI service, with the
 * bookmark actions AI may call (`actions.ts`) and, when the user turns it on,
 * the provider's built-in web search. Page reading is offered only while Read page content is on
 * and allowed. The loop needs the AI SDK, so it lives in ai-agent.lazy.ts and loads with the
 * first message.
 */
/** Providers whose own built-in web search Ask AI can add (tools in ai-agent.lazy.ts). */
const WEB_SEARCH_PROVIDERS = ['openai', 'anthropic', 'google', 'xai'] as const;

export type WebSearchProvider = (typeof WEB_SEARCH_PROVIDERS)[number];

/** The name the provider's web search is registered under. */
export const ASK_AI_WEB_SEARCH_TOOL = 'webSearch';

/** Names providers report for their own web search call, besides the registered one. */
export const ASK_AI_WEB_SEARCH_TOOL_NAMES: ReadonlySet<string> = new Set([
  ASK_AI_WEB_SEARCH_TOOL,
  'web_search',
  'google_search',
]);

export function supportsWebSearch(provider: AIProvider): provider is WebSearchProvider {
  return (WEB_SEARCH_PROVIDERS as readonly string[]).includes(provider);
}

/** What Ask AI's tool calls may use: the active tab, and page reading when it is on and allowed. */
export async function createAskAIToolContext(settings: Settings): Promise<ActionContext> {
  const readPages = settings.aiReadPageContent && (await hasPermission('pageReading'));
  return {
    client: { kind: 'askAI' },
    settings,
    activeTab: activeTabPage,
    ...(readPages
      ? { readPage: (url: string) => readPageText(url, settings.readPageSkipPrivateHosts) }
      : {}),
  };
}

/**
 * A new agent for the current default service and settings; built per message, so switching
 * services or settings (such as Ask AI's web search) applies to the next message.
 */
export async function createAskAIAgent() {
  const appSettings = await getSettings();
  const settings = await getActiveAISettings(appSettings.aiEnabled, 'askAI');
  const { system } = await buildPrompt('ask_ai', appSettings);
  const { buildAskAIAgent } = await import('./ai-agent.lazy');

  return buildAskAIAgent({
    settings,
    instructions: system,
    toolContext: await createAskAIToolContext(appSettings),
    webSearch: appSettings.askAiWebSearch,
    maxSteps: appSettings.askAiMaxSteps,
    webSearchMaxUses: ASK_AI_CONFIG.web_search_max_uses,
  });
}
