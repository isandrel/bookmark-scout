/**
 * AI-powered folder recommendation service.
 * Uses the shared AI client for multi-provider support.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

/**
 * Folder recommendation result.
 */
export interface FolderRecommendation {
  type: 'existing' | 'new';
  folderPath: string;
  folderId?: string;
  parentPath?: string;
  confidence: number;
  reason: string;
}

export type RecommendedFolderBookmarkResult = {
  status: 'created' | 'duplicate';
  folderId: string;
  folderPath: string;
  bookmarkId?: string;
  createdFolderIds: string[];
};

export class RecommendedFolderError extends Error {
  constructor(
    public readonly code: 'invalid-path' | 'path-conflict' | 'no-writable-root',
    public readonly segment?: string,
  ) {
    super(code);
    this.name = 'RecommendedFolderError';
  }
}

/**
 * Zod schema for single recommendation.
 * Note: All fields must be required for OpenAI structured output compatibility.
 */
const singleRecommendationSchema = z.object({
  type: z.enum(['existing', 'new']),
  folderPath: z.string().describe('Full folder path like "AI/Tools" or new folder name'),
  parentPath: z.string().describe('Parent path for new folder, empty string if type is existing'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  reason: z.string().describe('Brief reason for this recommendation'),
});

/**
 * Schema for multiple recommendations. It accepts as many as the setting allows at most, so any
 * value the user picks validates; the result is cut to the requested count afterwards.
 */
const recommendationsSchema = z.object({
  recommendations: z
    .array(singleRecommendationSchema)
    .min(1)
    .max(SETTING_NUMBER_BOUNDS.aiMaxRecommendations.max),
});

/**
 * Extracts folder paths from bookmark tree.
 * Returns array of "Parent/Child/Grandchild" formatted paths.
 */
export function extractFolderPaths(nodes: BookmarkTreeNode[]): { id: string; path: string }[] {
  return collectFolders(nodes).map(({ id, path }) => ({ id, path }));
}

/**
 * Recommends multiple folders for a bookmark using AI.
 * Returns up to maxRecommendations folder suggestions ranked by confidence.
 */
export async function recommendFolders(
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
  settings: AISettings,
  maxRecommendations: number = defaultSettings.aiMaxRecommendations,
  /** Send the page's readable text too; needs website access. */
  readPage = false,
): Promise<FolderRecommendation[]> {
  validateAISettings(settings);

  const folderList = extractFolderPaths(folders);
  const folderPaths = folderList.map((f) => f.path);

  if (folderPaths.length === 0) {
    return [{
      type: 'new',
      folderPath: t('bookmarks_root'),
      confidence: 1,
      reason: t('ai_recommendationNoFolders'),
    }];
  }

  const [page] = await addPageText([bookmark], readPage);
  const model = createAIModel(settings, 'folderRecommendation');
  const { system } = await buildPrompt(
    'folder_recommendation',
    { aiMaxRecommendations: maxRecommendations },
    { hasPageText: Boolean(page.pageText) },
  );

  const { object } = await generateObject({
    model,
    schema: recommendationsSchema,
    system,
    prompt: JSON.stringify({
      title: bookmark.title,
      url: bookmark.url,
      pageTitle: page.pageTitle,
      pageText: page.pageText,
      folders: folderPaths,
    }),
  });

  // Providers do not always honor the requested count; never show more than the setting allows.
  // Map folderPaths back to folderIds
  return object.recommendations.slice(0, maxRecommendations).map((rec) => {
    const matchedFolder = folderList.find((f) => f.path === rec.folderPath);
    return {
      ...rec,
      folderId: matchedFolder?.id,
    };
  });
}

export async function createRecommendedFolderBookmark(
  recommendation: FolderRecommendation,
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
): Promise<RecommendedFolderBookmarkResult> {
  const pathSegments = getRecommendedPathSegments(recommendation);
  const topLevelFolders = getTopLevelBookmarkNodes(folders).filter((node) => !node.url);
  const createdFolderIds: string[] = [];

  const matchingRoot = topLevelFolders.find((folder) => sameTitle(folder.title, pathSegments[0]));
  let segmentIndex = matchingRoot ? 1 : 0;
  const startFolder = matchingRoot ?? topLevelFolders[0];
  if (!startFolder) {
    throw new RecommendedFolderError('no-writable-root');
  }
  let currentFolder: BookmarkTreeNode = startFolder;
  const folderPath = (
    segmentIndex === 0 ? [currentFolder.title, ...pathSegments] : pathSegments
  ).join(AI_FOLDER_PATH_SEPARATOR);

  try {
    for (; segmentIndex < pathSegments.length; segmentIndex += 1) {
      const segment = pathSegments[segmentIndex];
      const children: BookmarkTreeNode[] = currentFolder.children ?? [];
      const matchingFolder = children.find(
        (child) => !child.url && sameTitle(child.title, segment),
      );

      if (matchingFolder) {
        currentFolder = matchingFolder;
        continue;
      }

      const conflictingBookmark = children.find(
        (child) => Boolean(child.url) && sameTitle(child.title, segment),
      );
      if (conflictingBookmark) {
        throw new RecommendedFolderError('path-conflict', segment);
      }

      const created = await createBookmark({
        parentId: currentFolder.id,
        title: segment,
      });
      createdFolderIds.push(created.id);
      currentFolder = {
        id: created.id,
        parentId: created.parentId,
        title: created.title,
        children: [],
      };
    }

    const children = await getBookmarkChildren(currentFolder.id);
    const duplicate = children.find(
      (child) => child.url && comparableUrl(child.url) === comparableUrl(bookmark.url),
    );
    if (duplicate) {
      return {
        status: 'duplicate',
        folderId: currentFolder.id,
        folderPath,
        bookmarkId: duplicate.id,
        createdFolderIds,
      };
    }

    const createdBookmark = await createBookmark({
      parentId: currentFolder.id,
      title: bookmark.title || t('popup_newBookmark'),
      url: bookmark.url,
    });

    return {
      status: 'created',
      folderId: currentFolder.id,
      folderPath,
      bookmarkId: createdBookmark.id,
      createdFolderIds,
    };
  } catch (error) {
    for (const folderId of [...createdFolderIds].reverse()) {
      try {
        await deleteBookmark(folderId);
      } catch {
        // Continue best-effort rollback for the remaining folders created by this transaction.
      }
    }
    throw error;
  }
}

function getRecommendedPathSegments(recommendation: FolderRecommendation) {
  const folderSegments = parsePath(recommendation.folderPath);
  const parentSegments = parsePath(recommendation.parentPath ?? '');
  const segments = parentSegments.length > 0 && folderSegments.length === 1
    ? [...parentSegments, folderSegments[folderSegments.length - 1] ?? '']
    : folderSegments;

  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new RecommendedFolderError('invalid-path');
  }

  return segments;
}

function parsePath(path: string) {
  return path
    .split(AI_FOLDER_PATH_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function sameTitle(left: string, right: string) {
  return left.trim().localeCompare(right.trim(), undefined, { sensitivity: 'accent' }) === 0;
}

/** The URL as the parser normalizes it, or the trimmed text when it does not parse. */
function comparableUrl(url: string) {
  return safeNormalizeUrl(url) ?? url.trim();
}
