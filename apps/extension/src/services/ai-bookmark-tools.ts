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
      tags: z.array(z.string()).min(1).max(20),
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

export async function suggestBookmarkTags(
  nodes: BookmarkTreeNode[],
  settings: AISettings,
  options: AutoTaggingOptions,
): Promise<AutoTaggingResultItem[]> {
  validateAISettings(settings);

  const bookmarks = flattenBookmarks(nodes).map((bookmark) => ({
    bookmarkId: bookmark.node.id,
    title: bookmark.node.title,
    url: bookmark.node.url ?? '',
    folderPath: bookmark.pathLabel,
  }));

  if (bookmarks.length === 0) {
    return [];
  }

  const items = await addPageText(bookmarks, Boolean(options.readPages));
  const model = createAIModel(settings, 'autoTagging') as CompatibleModel;
  const { system } = await buildPrompt('auto_tagging', {
    minTags: options.minTags,
    maxTags: options.maxTags,
    tagStyle: options.tagStyle,
  });

  const { object } = await generateObject({
    model,
    schema: autoTaggingSchema,
    system: withAppRules(
      system,
      'Return exactly one item per bookmark and preserve bookmarkId/title exactly.',
      items.some((item) => item.pageText),
    ),
    prompt: JSON.stringify({ bookmarks: items }),
  });

  const seenBookmarkIds = new Set<string>();
  return object.items.flatMap((item) => {
    const source = bookmarks.find((bookmark) => bookmark.bookmarkId === item.bookmarkId);
    if (!source || seenBookmarkIds.has(source.bookmarkId)) {
      return [];
    }

    seenBookmarkIds.add(source.bookmarkId);
    return [
      {
        bookmarkId: source.bookmarkId,
        title: source.title,
        url: source.url,
        tags: item.tags,
        reason: item.reason,
      },
    ];
  });
}

export async function summarizeBookmarksWithAI(
  nodes: BookmarkTreeNode[],
  settings: AISettings,
  options: SummarizerOptions,
): Promise<SummarizerResultItem[]> {
  validateAISettings(settings);

  const bookmarks = flattenBookmarks(nodes).map((bookmark) => ({
    bookmarkId: bookmark.node.id,
    title: bookmark.node.title,
    url: bookmark.node.url ?? '',
    domain: options.includeDomainHint ? bookmark.hostname ?? '' : '',
    folderPath: bookmark.pathLabel,
  }));

  if (bookmarks.length === 0) {
    return [];
  }

  const items = await addPageText(bookmarks, Boolean(options.readPages));
  const model = createAIModel(settings, 'summarizer') as CompatibleModel;
  const { system } = await buildPrompt('summarization', {
    summaryLength: options.summaryLength,
    includeDomainHint: options.includeDomainHint ? 'true' : 'false',
  });

  const { object } = await generateObject({
    model,
    schema: summarizerSchema,
    system: withAppRules(
      system,
      'Return exactly one item per bookmark and preserve bookmarkId/title exactly.',
      items.some((item) => item.pageText),
    ),
    prompt: JSON.stringify({ bookmarks: items }),
  });

  const seenBookmarkIds = new Set<string>();
  return object.items.flatMap((item) => {
    const source = bookmarks.find((bookmark) => bookmark.bookmarkId === item.bookmarkId);
    if (!source || seenBookmarkIds.has(source.bookmarkId)) {
      return [];
    }

    seenBookmarkIds.add(source.bookmarkId);
    return [
      {
        bookmarkId: source.bookmarkId,
        title: source.title,
        url: source.url,
        summary: item.summary,
      },
    ];
  });
}

/** @deprecated Saves a file the same way as exports; call {@link downloadExport}. */
export function downloadTextFile(content: string, filename: string, mimeType: string) {
  downloadExport(content, filename, mimeType);
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
