/**
 * The Ask AI chat agent: a tool-calling loop over the user's default AI service. Its own tools
 * only read (bookmarks, folders, the current tab, and with Read page content on, web pages);
 * providers with a built-in web search get that tool too, when the user turns it on. The loop
 * and its tools need the AI SDK, so they live in ai-agent.lazy.ts and load with the first message.
 */
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

/** Providers whose own built-in web search Ask AI can add (tools in ai-agent.lazy.ts). */
const WEB_SEARCH_PROVIDERS = ['openai', 'anthropic', 'google', 'xai'] as const;

export type WebSearchProvider = (typeof WEB_SEARCH_PROVIDERS)[number];

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

export function supportsWebSearch(provider: AIProvider): provider is WebSearchProvider {
  return (WEB_SEARCH_PROVIDERS as readonly string[]).includes(provider);
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

export type AskAIOptions = {
  /** Add the provider's built-in web search, where it has one. */
  webSearch: boolean;
};

/** A new agent for the current default service and settings; built per message, so switching
 * services or settings applies to the next message. */
export async function createAskAIAgent(options: AskAIOptions) {
  const appSettings = await getSettings();
  const settings = await getActiveAISettings(appSettings.aiEnabled);
  const readPages = appSettings.aiReadPageContent && (await hasPermission('pageReading'));
  const { system } = await buildPrompt('ask_ai', {});
  const { buildAskAIAgent } = await import('./ai-agent.lazy');

  return buildAskAIAgent({
    settings,
    instructions: system,
    readPages,
    webSearch: options.webSearch,
    maxSteps: config.max_steps,
    webSearchMaxUses: config.web_search_max_uses,
  });
}
