/**
 * AI-powered folder recommendation service.
 * Uses the shared AI client for multi-provider support.
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';
import { createAIModel, validateAISettings, type AISettings } from './ai-client';
import { FOLDER_RECOMMENDATION_PROMPT } from './ai-prompts';
import { createBookmark, deleteBookmark, getBookmarkChildren } from './bookmarks';

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
 * Schema for multiple recommendations.
 */
const recommendationsSchema = z.object({
  recommendations: z.array(singleRecommendationSchema).min(1).max(5),
});

/**
 * Extracts folder paths from bookmark tree.
 * Returns array of "Parent/Child/Grandchild" formatted paths.
 */
export function extractFolderPaths(
  nodes: BookmarkTreeNode[],
  parentPath = ''
): { id: string; path: string }[] {
  const result: { id: string; path: string }[] = [];

  for (const node of nodes) {
    // Skip if it's a bookmark (has URL)
    if (node.url) continue;

    const currentPath = parentPath ? `${parentPath}/${node.title}` : node.title;

    // Skip root nodes without titles
    if (node.title) {
      result.push({ id: node.id, path: currentPath });
    }

    // Recurse into children
    if (node.children) {
      result.push(...extractFolderPaths(node.children, node.title ? currentPath : ''));
    }
  }

  return result;
}

/**
 * Recommends multiple folders for a bookmark using AI.
 * Returns up to maxRecommendations folder suggestions ranked by confidence.
 */
export async function recommendFolders(
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
  settings: AISettings,
  maxRecommendations = 3
): Promise<FolderRecommendation[]> {
  validateAISettings(settings);

  const folderList = extractFolderPaths(folders);
  const folderPaths = folderList.map((f) => f.path);

  if (folderPaths.length === 0) {
    return [{
      type: 'new',
      folderPath: 'Bookmarks',
      confidence: 1,
      reason: 'No existing folders found',
    }];
  }

  const model = createAIModel(settings);

  const { object } = await generateObject({
    model,
    schema: recommendationsSchema,
    system: `${FOLDER_RECOMMENDATION_PROMPT.system}

Return exactly ${maxRecommendations} folder recommendations ranked by confidence. Include a mix of:
1. Best matching existing folder
2. Second best existing folder  
3. Suggest a new folder if appropriate, or third best existing

Each recommendation should have a clear, brief reason.`,
    prompt: JSON.stringify({
      title: bookmark.title,
      url: bookmark.url,
      folders: folderPaths,
    }),
  });

  // Map folderPaths back to folderIds
  return object.recommendations.map((rec) => {
    const matchedFolder = folderList.find((f) => f.path === rec.folderPath);
    return {
      ...rec,
      folderId: matchedFolder?.id,
    };
  });
}

/**
 * Legacy single recommendation (deprecated, use recommendFolders).
 */
export async function recommendFolder(
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
  settings: AISettings
): Promise<FolderRecommendation> {
  const recommendations = await recommendFolders(bookmark, folders, settings);
  return recommendations[0];
}

export async function createRecommendedFolderBookmark(
  recommendation: FolderRecommendation,
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
): Promise<RecommendedFolderBookmarkResult> {
  const pathSegments = getRecommendedPathSegments(recommendation);
  const topLevelFolders = getTopLevelFolders(folders);
  const createdFolderIds: string[] = [];

  let currentFolder = topLevelFolders.find((folder) =>
    sameTitle(folder.title, pathSegments[0]),
  );
  let segmentIndex = currentFolder ? 1 : 0;

  if (!currentFolder) {
    currentFolder = topLevelFolders[0];
  }
  if (!currentFolder) {
    throw new RecommendedFolderError('no-writable-root');
  }
  const folderPath = segmentIndex === 0
    ? [currentFolder.title, ...pathSegments].join('/')
    : pathSegments.join('/');

  try {
    for (; segmentIndex < pathSegments.length; segmentIndex += 1) {
      const segment = pathSegments[segmentIndex];
      const children = currentFolder.children ?? [];
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
      (child) => child.url && normalizeUrl(child.url) === normalizeUrl(bookmark.url),
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
      title: bookmark.title || 'New Bookmark',
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
    ? [...parentSegments, folderSegments.at(-1) ?? '']
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
  return path.split('/').map((segment) => segment.trim()).filter(Boolean);
}

function getTopLevelFolders(nodes: BookmarkTreeNode[]) {
  const roots = nodes.length === 1 && !nodes[0].title && nodes[0].children
    ? nodes[0].children
    : nodes;
  return roots.filter((node) => !node.url);
}

function sameTitle(left: string, right: string) {
  return left.trim().localeCompare(right.trim(), undefined, { sensitivity: 'accent' }) === 0;
}

function normalizeUrl(url: string) {
  try {
    return new URL(url).toString();
  } catch {
    return url.trim();
  }
}
