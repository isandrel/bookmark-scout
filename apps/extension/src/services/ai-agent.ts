/**
 * What Ask AI's pages and its host need to know without loading the AI SDK: which providers have
 * their own web search, the names of the web search and skill tools, and what a call from a page
 * may use (`createAskAIToolContext`, for the chat's suggestion buttons). The chat itself runs on Pi
 * Durable in the AI host page (`ask-ai-host.lazy.ts`).
 */
/** Providers whose own built-in web search Ask AI can add (tools in ai-agent.lazy.ts). */
const WEB_SEARCH_PROVIDERS = ['openai', 'anthropic', 'google', 'xai'] as const;

export type WebSearchProvider = (typeof WEB_SEARCH_PROVIDERS)[number];

/** The name the provider's web search is registered under. */
export const ASK_AI_WEB_SEARCH_TOOL = 'webSearch';

/** The tool that reads one of Ask AI's skills (ask-ai-skills.lazy.ts). */
export const ASK_AI_SKILL_TOOL = 'readSkill';

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
