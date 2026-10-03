import { generateObject } from 'ai';
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

type CompatibleModel = Parameters<typeof generateObject>[0]['model'];

export type AIContextFormat = 'markdown' | 'xml';

export type AIContextPackOptions = {
  format: AIContextFormat;
  includeFolderPath: boolean;
  includeDates: boolean;
  includeTags: boolean;
  includeSummaries: boolean;
  maxItems: number;
  maxDepth: number;
  excerptLength: number;
};

export type PackedAIContext = {
  content: string;
  itemCount: number;
  format: AIContextFormat;
};

export type AutoTaggingOptions = {
  minTags: number;
  maxTags: number;
  tagStyle: 'kebab-case' | 'snake_case' | 'lowercase';
  /** Send each page's readable text too; needs website access. */
  readPages?: boolean;
};

export type AutoTaggingResultItem = {
  bookmarkId: string;
  title: string;
  url: string;
  tags: string[];
  reason: string;
};

export type SummarizerOptions = {
  summaryLength: number;
  includeDomainHint: boolean;
  /** Send each page's readable text too; needs website access. */
  readPages?: boolean;
};

export type SummarizerResultItem = {
  bookmarkId: string;
  title: string;
  url: string;
  summary: string;
};

const autoTaggingSchema = z.object({
  items: z.array(
    z.object({
      bookmarkId: z.string(),
      title: z.string(),
      // As many tags as the setting allows at most; the prompt asks for the configured range.
      tags: z.array(z.string()).min(1).max(SETTING_NUMBER_BOUNDS.autoTaggingMaxTags.max),
      reason: z.string(),
    }),
  ),
});

const summarizerSchema = z.object({
  items: z.array(
    z.object({
      bookmarkId: z.string(),
      title: z.string(),
      summary: z.string(),
    }),
  ),
});

type BookmarkInput = { bookmarkId: string; title: string; url: string };

/**
 * Sends a batch of bookmarks to the model in one request and maps each answer back to its
 * bookmark: answers for unknown ids and repeated answers are dropped.
 */
async function generateForBookmarks<
  Input extends BookmarkInput,
  Task extends 'auto_tagging' | 'summarization',
  Item extends { bookmarkId: string },
  Result,
>(request: {
  inputs: Input[];
  settings: AISettings;
  source: AIActivitySource;
  task: Task;
  promptSettings: PromptSettings<Task>;
  readPages: boolean;
  schema: z.ZodType<{ items: Item[] }>;
  toResult: (input: Input, item: Item) => Result;
}): Promise<Result[]> {
  if (request.inputs.length === 0) {
    return [];
  }

  const items = await addPageText(request.inputs, request.readPages);
  const model = createAIModel(request.settings, request.source) as CompatibleModel;
  const { system } = await buildPrompt(request.task, request.promptSettings, {
    hasPageText: items.some((item) => item.pageText),
  });

  const { object } = await generateObject({
    model,
    schema: request.schema,
    system,
    prompt: JSON.stringify({ bookmarks: items }),
  });

  const inputs = new Map(request.inputs.map((input) => [input.bookmarkId, input]));
  const answered = new Set<string>();
  return object.items.flatMap((item) => {
    const input = inputs.get(item.bookmarkId);
    if (!input || answered.has(input.bookmarkId)) {
      return [];
    }
    answered.add(input.bookmarkId);
    return [request.toResult(input, item)];
  });
}

export function buildAIContextPack(
  nodes: BookmarkTreeNode[],
  options: AIContextPackOptions,
  metadataByBookmarkId: StoredBookmarkMetadataById = {},
): PackedAIContext {
  const bookmarks = selectAIContextBookmarks(nodes, options);

  const content =
    options.format === 'xml'
      ? buildXmlContext(bookmarks, options, metadataByBookmarkId)
      : buildMarkdownContext(bookmarks, options, metadataByBookmarkId);

  return {
    content,
    itemCount: bookmarks.length,
    format: options.format,
  };
}

/** The bookmarks a context pack includes, after its depth and item limits. */
export function selectAIContextBookmarks(
  nodes: BookmarkTreeNode[],
  options: Pick<AIContextPackOptions, 'maxDepth' | 'maxItems'>,
) {
  return flattenBookmarks(nodes)
    .filter((bookmark) => bookmark.depth <= options.maxDepth)
    .slice(0, options.maxItems);
}

/** What saving reviewed AI suggestions did. */
export type ReviewedMetadataSaveResult = {
  saved: number;
  /** Suggestions for bookmarks deleted or pointed at another URL since the scan. */
  skipped: number;
};

/**
 * Saves reviewed tag or summary suggestions as bookmark metadata. Only results that map back to
 * a bookmark in the request are saved, and only while that bookmark still exists with the URL
 * the model saw, so a bookmark deleted since the scan never leaves an orphaned entry.
 */
export async function saveReviewedBookmarkMetadata<
  Item extends { bookmarkId: string; url: string },
>(
  items: readonly Item[],
  patch: (item: Item) => BookmarkMetadataPatch,
  options: BookmarkMetadataMergeOptions,
): Promise<ReviewedMetadataSaveResult> {
  const reviewed = items.filter((item) => item.url);
  const live = await Promise.all(reviewed.map((item) => getLiveBookmark(item.bookmarkId)));
  const current = reviewed.filter((item, index) => live[index]?.url === item.url);
  if (current.length > 0) {
    await mergeStoredBookmarkMetadata(
      Object.fromEntries(current.map((item) => [item.bookmarkId, patch(item)])),
      options,
    );
  }
  return { saved: current.length, skipped: reviewed.length - current.length };
}

export async function suggestBookmarkTags(
  nodes: BookmarkTreeNode[],
  settings: AISettings,
  options: AutoTaggingOptions,
): Promise<AutoTaggingResultItem[]> {
  validateAISettings(settings);

  return generateForBookmarks({
    inputs: flattenBookmarks(nodes).map((bookmark) => ({
      bookmarkId: bookmark.node.id,
      title: bookmark.node.title,
      url: bookmark.node.url ?? '',
      folderPath: bookmark.pathLabel,
    })),
    settings,
    source: 'autoTagging',
    task: 'auto_tagging',
    promptSettings: {
      autoTaggingMinTags: options.minTags,
      autoTaggingMaxTags: options.maxTags,
      autoTaggingTagStyle: options.tagStyle,
    },
    readPages: Boolean(options.readPages),
    schema: autoTaggingSchema,
    toResult: (input, item) => ({
      bookmarkId: input.bookmarkId,
      title: input.title,
      url: input.url,
      tags: item.tags,
      reason: item.reason,
    }),
  });
}

export async function summarizeBookmarksWithAI(
  nodes: BookmarkTreeNode[],
  settings: AISettings,
  options: SummarizerOptions,
): Promise<SummarizerResultItem[]> {
  validateAISettings(settings);

  return generateForBookmarks({
    inputs: flattenBookmarks(nodes).map((bookmark) => ({
      bookmarkId: bookmark.node.id,
      title: bookmark.node.title,
      url: bookmark.node.url ?? '',
      domain: options.includeDomainHint ? bookmark.hostname ?? '' : '',
      folderPath: bookmark.pathLabel,
    })),
    settings,
    source: 'summarizer',
    task: 'summarization',
    promptSettings: {
      summarizerSummaryLength: options.summaryLength,
      summarizerIncludeDomainHint: options.includeDomainHint,
    },
    readPages: Boolean(options.readPages),
    schema: summarizerSchema,
    toResult: (input, item) => ({
      bookmarkId: input.bookmarkId,
      title: input.title,
      url: input.url,
      summary: item.summary,
    }),
  });
}

/** A bookmark's folder path in a context pack; bookmarks outside any folder read as the root. */
function contextFolderLabel(bookmark: FlatBookmark): string {
  return bookmark.pathLabel || t('tools_rootFolder');
}

function buildMarkdownContext(
  bookmarks: ReturnType<typeof flattenBookmarks>,
  options: AIContextPackOptions,
  metadataByBookmarkId: StoredBookmarkMetadataById,
) {
  const lines: string[] = ['# Bookmark Context', ''];

  bookmarks.forEach((bookmark, index) => {
    const metadata = metadataByBookmarkId[bookmark.node.id];
    lines.push(`## ${index + 1}. ${getBookmarkDisplayTitle(bookmark.node.title)}`);
    if (bookmark.node.url) {
      lines.push(`- URL: ${bookmark.node.url}`);
    }
    if (options.includeFolderPath) {
      lines.push(`- Folder: ${contextFolderLabel(bookmark)}`);
    }
    if (options.includeDates && bookmark.node.dateAdded) {
      lines.push(`- Added: ${new Date(bookmark.node.dateAdded).toISOString()}`);
    }
    if (options.includeTags && metadata?.tags?.length) {
      lines.push(`- Tags: ${JSON.stringify(metadata.tags)}`);
    }
    if (options.includeSummaries && metadata?.summary) {
      lines.push(`- Summary: ${truncateForContext(metadata.summary, options.excerptLength)}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

function buildXmlContext(
  bookmarks: ReturnType<typeof flattenBookmarks>,
  options: AIContextPackOptions,
  metadataByBookmarkId: StoredBookmarkMetadataById,
) {
  const items = bookmarks
    .map((bookmark) => {
      const metadata = metadataByBookmarkId[bookmark.node.id];
      const fields = [
        `<title>${escapeXml(getBookmarkDisplayTitle(bookmark.node.title))}</title>`,
        bookmark.node.url ? `<url>${escapeXml(bookmark.node.url)}</url>` : '',
        options.includeFolderPath
          ? `<folder>${escapeXml(contextFolderLabel(bookmark))}</folder>`
          : '',
        options.includeDates && bookmark.node.dateAdded
          ? `<dateAdded>${new Date(bookmark.node.dateAdded).toISOString()}</dateAdded>`
          : '',
        options.includeTags && metadata?.tags?.length
          ? `<tags>${metadata.tags.map((tag) => `<tag>${escapeXml(tag)}</tag>`).join('')}</tags>`
          : '',
        options.includeSummaries && metadata?.summary
          ? `<summary>${escapeXml(truncateForContext(metadata.summary, options.excerptLength))}</summary>`
          : '',
      ].filter(Boolean);

      return `<bookmark id="${escapeXml(bookmark.node.id)}">${fields.join('')}</bookmark>`;
    })
    .join('');

  return `<bookmarks count="${bookmarks.length}">${items}</bookmarks>`;
}

function truncateForContext(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

/** HTML escaping plus `'`, which XML attribute values may be quoted with. */
function escapeXml(value: string) {
  return escapeHtml(value).replace(/'/g, '&apos;');
}
