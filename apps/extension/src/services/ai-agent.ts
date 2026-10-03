/**
 * The Ask AI chat agent: a tool-calling loop over the user's default AI service. Its own tools
 * only read (bookmarks, folders, the current tab, and with Read page content on, web pages);
 * providers with a built-in web search get that tool too, when the user turns it on.
 */
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { xai } from '@ai-sdk/xai';
import { isStepCount, type ToolSet, ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const config = readConfig(
  'ai/agent',
  z.strictObject({
    max_steps: z.number().int().positive(),
    max_bookmark_results: z.number().int().positive(),
    search_title_weight: z.number().nonnegative(),
    search_text_weight: z.number().nonnegative(),
    web_search_max_uses: z.number().int().positive(),
  }),
);

/**
 * Built-in web search per provider, run by the provider itself. Each package types its tool
 * differently, so they are held as plain objects and typed as a tool where they join the set.
 */
const WEB_SEARCH_TOOLS: Partial<Record<AIProvider, () => object>> = {
  openai: () => openai.tools.webSearch({}),
  anthropic: () => anthropic.tools.webSearch_20250305({ maxUses: config.web_search_max_uses }),
  google: () => google.tools.googleSearch({}),
  xai: () => xai.tools.webSearch({}),
};

/** Names the Ask AI tools are registered under, which the chat shows as steps. */
export const ASK_AI_TOOL_NAMES = {
  searchBookmarks: 'searchBookmarks',
  listFolders: 'listFolders',
  getCurrentPage: 'getCurrentPage',
  readPage: 'readPage',
  webSearch: 'webSearch',
} as const;

/** Names providers report for their own web search call, besides the registered one. */
export const ASK_AI_WEB_SEARCH_TOOL_NAMES: ReadonlySet<string> = new Set([
  ASK_AI_TOOL_NAMES.webSearch,
  'web_search',
  'google_search',
]);

export function supportsWebSearch(provider: AIProvider): boolean {
  return provider in WEB_SEARCH_TOOLS;
}

export type BookmarkSearchHit = {
  title: string;
  url: string;
  folder: string;
  tags?: string[];
  summary?: string;
};

/**
 * Bookmarks that match the most query words, best first. Each word scores the configured title
 * weight when in the title, plus the text weight when in the URL, folder path, saved tags, or
 * saved summary.
 */
export function searchBookmarksForAI(
  nodes: BookmarkTreeNode[],
  metadata: StoredBookmarkMetadataById,
  query: string,
  limit = config.max_bookmark_results,
): BookmarkSearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return flattenBookmarks(nodes)
    .flatMap((bookmark) => {
      const saved = metadata[bookmark.node.id] ?? {};
      const title = bookmark.node.title.toLowerCase();
      const rest = [bookmark.node.url, bookmark.pathLabel, ...(saved.tags ?? []), saved.summary]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const score = words.reduce(
        (total, word) =>
          total +
          (title.includes(word) ? config.search_title_weight : 0) +
          (rest.includes(word) ? config.search_text_weight : 0),
        0,
      );
      if (score === 0) return [];
      const hit: BookmarkSearchHit = {
        title: bookmark.node.title,
        url: bookmark.node.url ?? '',
        folder: bookmark.pathLabel,
        ...(saved.tags?.length ? { tags: saved.tags } : {}),
        ...(saved.summary ? { summary: saved.summary } : {}),
      };
      return [{ hit, score }];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ hit }) => hit);
}

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
      execute: async () => extractFolderPaths(await fetchBookmarkTree()).map((folder) => folder.path),
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
      execute: async ({ url }) => (await readPageText(url)) ?? { error: TOOL_MESSAGES.pageUnreadable },
    });
  }
  return tools;
}

export type AskAIOptions = {
  /** Add the provider's built-in web search, where it has one. */
  webSearch: boolean;
};

/** A new agent for the current default service and settings; built per message, so switching
 * services or settings applies to the next message. */
export async function createAskAIAgent(options: AskAIOptions) {
  const appSettings = await getSettings();
  const settings = await getActiveAISettings(appSettings.aiEnabled);
  const readPages = appSettings.aiReadPageContent && (await hasWebHostAccess());
  const webSearch = options.webSearch ? WEB_SEARCH_TOOLS[settings.provider]?.() : undefined;
  const { system } = await buildPrompt('ask_ai', {});

  return new ToolLoopAgent({
    model: createAIModel(settings, 'askAI'),
    instructions: system,
    tools: {
      ...createReadOnlyTools(readPages),
      ...(webSearch ? { [ASK_AI_TOOL_NAMES.webSearch]: webSearch as ToolSet[string] } : {}),
    },
    stopWhen: isStepCount(config.max_steps),
  });
}
