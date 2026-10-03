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
  /** Titles of the folders on the path, from the permanent folder down to the saved-to folder. */
  folderTitles: string[];
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
 * Schema for multiple recommendations. It has no upper bound: providers do not always honor the
 * requested count, and one extra suggestion must not fail the whole request. The result is cut
 * to the requested count afterwards.
 */
const recommendationsSchema = z.object({
  recommendations: z.array(singleRecommendationSchema).min(1),
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

  // Never show more than the setting allows. Map folderPaths back to folderIds
  return object.recommendations.slice(0, maxRecommendations).map((rec) => {
    const matchedFolder = folderList.find((f) => f.path === rec.folderPath);
    return {
      ...rec,
      folderId: matchedFolder?.id,
    };
  });
}

/**
 * Where a suggested folder path leads in the current tree. Folder titles may contain the path
 * separator ("CI/CD"), so the path is matched against real titles before the rest is split.
 */
export type ResolvedFolderPath = {
  /** The deepest folder on the path that already exists; new folders go inside it. */
  folder: BookmarkTreeNode;
  /** Titles of the existing folders, from the permanent folder down to `folder`. */
  existingTitles: string[];
  /** Titles of the folders still to create inside `folder`, outermost first. */
  newTitles: string[];
};

/**
 * The longest chain of folders in `nodes` and below whose titles spell the start of `path`. A
 * title only matches up to a separator or the end of the path, so "CI/CD" matches the folder
 * "CI/CD" and not a folder "CI".
 */
function matchFolderChain(
  nodes: readonly BookmarkTreeNode[],
  path: string,
): { chain: BookmarkTreeNode[]; rest: string } {
  let best: { chain: BookmarkTreeNode[]; rest: string } = { chain: [], rest: path };
  for (const node of nodes) {
    const title = node.title.trim();
    if (node.url || !title || !sameTitle(path.slice(0, title.length), title)) continue;
    const after = path.slice(title.length).trimStart();
    if (after && !after.startsWith(AI_FOLDER_PATH_SEPARATOR)) continue;
    const below = matchFolderChain(
      node.children ?? [],
      after.slice(AI_FOLDER_PATH_SEPARATOR.length).trimStart(),
    );
    if (below.rest.length < best.rest.length) {
      best = { chain: [node, ...below.chain], rest: below.rest };
    }
  }
  return best;
}

/** The full path a recommendation names: a bare folder name goes inside its `parentPath`. */
function getRecommendedPath({ folderPath, parentPath = '' }: FolderRecommendation): string {
  const name = folderPath.trim();
  const parent = parentPath.trim();
  return parent && !name.includes(AI_FOLDER_PATH_SEPARATOR)
    ? `${parent}${AI_FOLDER_PATH_SEPARATOR}${name}`
    : name;
}

/**
 * Resolves a suggested path against `folders`: the existing folders it names, then the folders to
 * create. Paths start with a permanent folder ("Bookmarks Bar/News"), or inside the bookmarks bar
 * when they name none.
 */
export function resolveRecommendedFolderPath(
  recommendation: FolderRecommendation,
  folders: readonly BookmarkTreeNode[],
): ResolvedFolderPath {
  const path = getRecommendedPath(recommendation);
  if (parsePath(path).length === 0) throw new RecommendedFolderError('invalid-path');

  const topLevelFolders = getTopLevelBookmarkNodes(folders).filter((node) => !node.url);
  const defaultRoot = findBookmarksBarFolder(folders) ?? topLevelFolders[0];
  if (!defaultRoot) throw new RecommendedFolderError('no-writable-root');

  const fromRoot = matchFolderChain(topLevelFolders, path);
  const insideDefault = matchFolderChain(defaultRoot.children ?? [], path);
  const { chain, rest } =
    fromRoot.chain.length > 0
      ? fromRoot
      : { chain: [defaultRoot, ...insideDefault.chain], rest: insideDefault.rest };

  const newTitles = parsePath(rest);
  if (newTitles.some((title) => title === '.' || title === '..')) {
    throw new RecommendedFolderError('invalid-path');
  }
  return {
    folder: chain[chain.length - 1],
    existingTitles: chain.map((node) => node.title),
    newTitles,
  };
}

export async function createRecommendedFolderBookmark(
  recommendation: FolderRecommendation,
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
): Promise<RecommendedFolderBookmarkResult> {
  const { folder, existingTitles, newTitles } = resolveRecommendedFolderPath(
    recommendation,
    folders,
  );
  const folderTitles = [...existingTitles, ...newTitles];
  const createdFolderIds: string[] = [];

  // Only the first new folder can collide; the ones below it go into brand-new folders.
  const conflict = newTitles[0]
    ? folder.children?.find((child) => child.url && sameTitle(child.title, newTitles[0]))
    : undefined;
  if (conflict) throw new RecommendedFolderError('path-conflict', newTitles[0]);

  let currentFolderId = folder.id;
  try {
    for (const title of newTitles) {
      const created = await createBookmark({ parentId: currentFolderId, title });
      createdFolderIds.push(created.id);
      currentFolderId = created.id;
    }

    const children = await getBookmarkChildren(currentFolderId);
    const duplicate = children.find(
      (child) => child.url && comparableUrl(child.url) === comparableUrl(bookmark.url),
    );
    if (duplicate) {
      return {
        status: 'duplicate',
        folderId: currentFolderId,
        folderTitles,
        bookmarkId: duplicate.id,
        createdFolderIds,
      };
    }

    const createdBookmark = await createBookmark({
      parentId: currentFolderId,
      title: bookmark.title || t('popup_newBookmark'),
      url: bookmark.url,
    });

    return {
      status: 'created',
      folderId: currentFolderId,
      folderTitles,
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
