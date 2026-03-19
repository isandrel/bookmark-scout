import { generateObject } from 'ai';
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';
import { createAIModel, validateAISettings, type AISettings } from './ai-client';
import { buildPrompt } from './prompt-config';
import { flattenBookmarks } from './bookmark-tooling';

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
): PackedAIContext {
  const bookmarks = flattenBookmarks(nodes)
    .filter((bookmark) => bookmark.depth <= options.maxDepth)
    .slice(0, options.maxItems);

  const content =
    options.format === 'xml'
      ? buildXmlContext(bookmarks, options)
      : buildMarkdownContext(bookmarks, options);

  return {
    content,
    itemCount: bookmarks.length,
    format: options.format,
  };
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

  const model = createAIModel(settings) as CompatibleModel;
  const { system } = buildPrompt('auto_tagging', {
    minTags: options.minTags,
    maxTags: options.maxTags,
    tagStyle: options.tagStyle,
  });

  const { object } = await generateObject({
    model,
    schema: autoTaggingSchema,
    system: `${system}\n\nReturn exactly one item per bookmark and preserve bookmarkId/title exactly.`,
    prompt: JSON.stringify({ bookmarks }),
  });

  return object.items.map((item) => {
    const source = bookmarks.find((bookmark) => bookmark.bookmarkId === item.bookmarkId);
    return {
      bookmarkId: item.bookmarkId,
      title: item.title,
      url: source?.url ?? '',
      tags: item.tags,
      reason: item.reason,
    };
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

  const model = createAIModel(settings) as CompatibleModel;
  const { system } = buildPrompt('summarization', {
    summaryLength: options.summaryLength,
    includeDomainHint: options.includeDomainHint ? 'true' : 'false',
  });

  const { object } = await generateObject({
    model,
    schema: summarizerSchema,
    system: `${system}\n\nReturn exactly one item per bookmark and preserve bookmarkId/title exactly.`,
    prompt: JSON.stringify({ bookmarks }),
  });

  return object.items.map((item) => {
    const source = bookmarks.find((bookmark) => bookmark.bookmarkId === item.bookmarkId);
    return {
      bookmarkId: item.bookmarkId,
      title: item.title,
      url: source?.url ?? '',
      summary: item.summary,
    };
  });
}

export function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildMarkdownContext(
  bookmarks: ReturnType<typeof flattenBookmarks>,
  options: AIContextPackOptions,
) {
  const lines: string[] = ['# Bookmark Context', ''];

  bookmarks.forEach((bookmark, index) => {
    lines.push(`## ${index + 1}. ${bookmark.node.title || 'Untitled'}`);
    if (bookmark.node.url) {
      lines.push(`- URL: ${bookmark.node.url}`);
    }
    if (options.includeFolderPath) {
      lines.push(`- Folder: ${bookmark.pathLabel || 'Root'}`);
    }
    if (options.includeDates && bookmark.node.dateAdded) {
      lines.push(`- Added: ${new Date(bookmark.node.dateAdded).toISOString()}`);
    }
    if (options.includeTags) {
      lines.push('- Tags: []');
    }
    if (options.includeSummaries) {
      lines.push(`- Summary: ${truncateForContext(bookmark.node.title, options.excerptLength)}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

function buildXmlContext(
  bookmarks: ReturnType<typeof flattenBookmarks>,
  options: AIContextPackOptions,
) {
  const items = bookmarks
    .map((bookmark) => {
      const fields = [
        `<title>${escapeXml(bookmark.node.title || 'Untitled')}</title>`,
        bookmark.node.url ? `<url>${escapeXml(bookmark.node.url)}</url>` : '',
        options.includeFolderPath ? `<folder>${escapeXml(bookmark.pathLabel || 'Root')}</folder>` : '',
        options.includeDates && bookmark.node.dateAdded
          ? `<dateAdded>${new Date(bookmark.node.dateAdded).toISOString()}</dateAdded>`
          : '',
        options.includeTags ? '<tags></tags>' : '',
        options.includeSummaries
          ? `<summary>${escapeXml(truncateForContext(bookmark.node.title, options.excerptLength))}</summary>`
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

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
