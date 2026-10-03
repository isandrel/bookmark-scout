/**
 * The Ask AI agent itself: the AI SDK tool-calling loop and its read-only tools. It loads with
 * the Ask AI chat through `createAskAIAgent` in ai-agent.ts; like every `*.lazy.ts` file it is
 * left out of auto-imports, so import it only with `import()` or from another lazy module.
 */
import { isStepCount, type ToolSet, ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
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

async function loadBookmarks() {
  const nodes = await fetchBookmarkTree();
  const ids = flattenBookmarks(nodes).map((bookmark) => bookmark.node.id);
  return { nodes, metadata: await getStoredBookmarkMetadata(ids) };
}

/** Tool results reach the model as data; these explain to it why a tool returned nothing. */
const TOOL_MESSAGES = {
  pageUnreadable:
    'The page could not be read: it did not load, is not an HTML page, or is on the local network.',
  noActiveTab: 'There is no web page open in the active tab.',
} as const;

function createReadOnlyTools(readPages: boolean): ToolSet {
  const tools: ToolSet = {
    [ASK_AI_TOOL_NAMES.searchBookmarks]: tool({
      description:
        "Search the user's bookmarks by keywords. Matches titles, URLs, folder names, saved tags, and saved summaries.",
      inputSchema: z.object({
        query: z.string().describe('Space-separated keywords'),
      }),
      execute: async ({ query }) => {
        const { nodes, metadata } = await loadBookmarks();
        return searchBookmarksForAI(nodes, metadata, query);
      },
    }),
    [ASK_AI_TOOL_NAMES.listFolders]: tool({
      description: "List the paths of all the user's bookmark folders.",
      inputSchema: z.object({}),
      execute: async () =>
        extractFolderPaths(await fetchBookmarkTree()).map((folder) => folder.path),
    }),
    [ASK_AI_TOOL_NAMES.getCurrentPage]: tool({
      description: 'Get the title and URL of the page open in the active browser tab.',
      inputSchema: z.object({}),
      execute: async () => {
        const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
        return tab?.url && isWebUrl(tab.url)
          ? { title: tab.title ?? '', url: tab.url }
          : { error: TOOL_MESSAGES.noActiveTab };
      },
    }),
  };
  if (readPages) {
    tools[ASK_AI_TOOL_NAMES.readPage] = tool({
      description: 'Read the main text of a web page by its URL, as Markdown.',
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) =>
        (await readPageText(url)) ?? { error: TOOL_MESSAGES.pageUnreadable },
    });
  }
  return tools;
}

export type AskAIAgentOptions = {
  settings: AISettings;
  instructions: string;
  /** Add the page-reading tool. */
  readPages: boolean;
  /** Add the provider's built-in web search, where it has one. */
  webSearch: boolean;
  maxSteps: number;
  webSearchMaxUses: number;
};

export async function buildAskAIAgent(options: AskAIAgentOptions) {
  const { settings } = options;
  // First, so settings that cannot make a call fail before anything else loads.
  const model = await createAIModel(settings, 'askAI');
  const webSearchTool =
    options.webSearch && supportsWebSearch(settings.provider)
      ? await WEB_SEARCH_TOOLS[settings.provider]({ maxUses: options.webSearchMaxUses })
      : undefined;

  return new ToolLoopAgent({
    model,
    instructions: options.instructions,
    tools: {
      ...createReadOnlyTools(options.readPages),
      ...(webSearchTool ? { [ASK_AI_TOOL_NAMES.webSearch]: webSearchTool as ToolSet[string] } : {}),
    },
    stopWhen: isStepCount(options.maxSteps),
  });
}
