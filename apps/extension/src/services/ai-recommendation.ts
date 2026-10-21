/**
 * AI folder suggestions: the request, the answer's shape, and saving into a suggested folder,
 * creating the folders it names. The call itself is `recommendFolders`
 * (`ai-recommendation-call.ts`) in pages, and `recommendFoldersVia` in the background, which hands
 * page reading and the request to quick save's AI host page. Nothing here reads pages or loads the
 * AI client, so the background can use it without bundling either.
 */

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
 * Note: All fields must be required for OpenAI structured output compatibility. The confidence
 * has no bounds here: some models answer 85 for 85%, which `toFolderRecommendations` rescales.
 */
const singleRecommendationSchema = z.object({
  type: z.enum(['existing', 'new']),
  folderPath: z.string().describe('Full folder path like "AI/Tools" or new folder name'),
  parentPath: z.string().describe('Parent path for new folder, empty string if type is existing'),
  confidence: z.number().describe('Confidence score from 0 to 1'),
  reason: z.string().describe('Brief reason for this recommendation'),
});

type RawFolderRecommendation = z.infer<typeof singleRecommendationSchema>;

/**
 * Schema for multiple recommendations, shared by the popup and AI quick save (through the AI host
 * page). It has no bounds: providers do not always honor the requested count, an empty list means
 * no suggestion rather than a broken answer, and a malformed suggestion is dropped on its own
 * instead of failing the others. The result is checked and cut to the requested count afterwards
 * (`toFolderRecommendations`).
 */
export const folderRecommendationsSchema = z.object({
  recommendations: z
    // `catch` keeps the item's JSON Schema for the provider and turns a bad item into undefined.
    .array(singleRecommendationSchema.optional().catch(undefined))
    .transform((items) => items.filter((item): item is RawFolderRecommendation => !!item)),
});

export type FolderRecommendationsObject = z.infer<typeof folderRecommendationsSchema>;

/**
 * Extracts folder paths from bookmark tree.
 * Returns array of "Parent/Child/Grandchild" formatted paths.
 */
export function extractFolderPaths(nodes: BookmarkTreeNode[]): { id: string; path: string }[] {
  return collectFolders(nodes).map(({ id, path }) => ({ id, path }));
}

/** The one suggestion for a library without folders: a new folder at the top. */
export function noFoldersRecommendation(): FolderRecommendation[] {
  return [
    {
      type: 'new',
      folderPath: t('bookmarks_root'),
      confidence: 1,
      reason: t('ai_recommendationNoFolders'),
    },
  ];
}

/** The system prompt and the JSON the model reads, for one page and the folder list. */
export async function buildFolderRecommendationRequest(
  page: { title: string; url: string; pageTitle?: string; pageText?: string },
  folderPaths: readonly string[],
  maxRecommendations: number,
): Promise<{ system: string; prompt: string }> {
  const { system } = await buildPrompt(
    'folder_recommendation',
    { aiMaxRecommendations: maxRecommendations },
    { hasPageText: Boolean(page.pageText) },
  );
  return {
    system,
    prompt: JSON.stringify({
      title: page.title,
      url: page.url,
      pageTitle: page.pageTitle,
      pageText: page.pageText,
      folders: folderPaths,
    }),
  };
}

/** A confidence from 0 to 1; a model that answered in percent (85) is rescaled. */
export function normalizeConfidence(confidence: number): number {
  const fraction = confidence > 1 ? confidence / 100 : confidence;
  return Math.min(1, Math.max(0, fraction));
}

/**
 * The model's answer checked against the tree and cut to the setting's count. The model's own
 * `type` is not trusted: a suggestion whose whole path exists is an existing folder, with its id
 * and real path, and any other is a new one. Suggestions that cannot be saved (an empty path)
 * are dropped, and two that lead to the same folder are shown once, the first one kept.
 */
export function toFolderRecommendations(
  object: FolderRecommendationsObject,
  folders: readonly BookmarkTreeNode[],
  maxRecommendations: number,
): FolderRecommendation[] {
  const seen = new Set<string>();
  const result: FolderRecommendation[] = [];
  for (const raw of object.recommendations) {
    if (result.length >= maxRecommendations) break;
    const rec = { ...raw, confidence: normalizeConfidence(raw.confidence) };
    let resolved: ResolvedFolderPath;
    try {
      resolved = resolveRecommendedFolderPath(rec, folders);
    } catch {
      continue;
    }
    const exists = resolved.newTitles.length === 0;
    const key = exists
      ? `id:${resolved.folder.id}`
      : `new:${resolved.folder.id}:${resolved.newTitles.map((title) => title.toLocaleLowerCase()).join('\n')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(
      exists
        ? {
            ...rec,
            type: 'existing',
            folderPath: resolved.existingTitles.join(AI_FOLDER_PATH_SEPARATOR),
            parentPath: '',
            folderId: resolved.folder.id,
          }
        : // An "existing" folder that is not there is offered as a new one, with its review.
          { ...rec, type: 'new' },
    );
  }
  return result;
}

/** A stable key for a suggestion, from what it leads to (unique after `toFolderRecommendations`). */
export function folderRecommendationKey(rec: FolderRecommendation): string {
  return rec.folderId ? `id:${rec.folderId}` : `new:${rec.parentPath ?? ''}\n${rec.folderPath}`;
}

/**
 * `recommendFolders` for a context that cannot load the AI SDK (the background): reading the
 * page and the request itself go to `run`, the AI host page. Settings must be checked already.
 */
export async function recommendFoldersVia(
  run: {
    readPage: (url: string) => Promise<{ title?: string; text: string } | null>;
    generate: (request: {
      schema: 'folderRecommendations';
      system: string;
      prompt: string;
    }) => Promise<FolderRecommendationsObject>;
  },
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
  maxRecommendations: number,
  readPage: boolean,
): Promise<FolderRecommendation[]> {
  const folderList = extractFolderPaths(folders);
  if (folderList.length === 0) return noFoldersRecommendation();
  const pageText = readPage ? await run.readPage(bookmark.url) : null;
  const request = await buildFolderRecommendationRequest(
    { ...bookmark, pageTitle: pageText?.title, pageText: pageText?.text },
    folderList.map((f) => f.path),
    maxRecommendations,
  );
  const answer = await run.generate({ schema: 'folderRecommendations', ...request });
  return toFolderRecommendations(answer, folders, maxRecommendations);
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

export type RecommendedFolderPathResult = {
  folderId: string;
  /** Titles of the folders on the path, from the permanent folder down to the folder. */
  folderTitles: string[];
  /** Folders this call created, outermost first. */
  createdFolderIds: string[];
};

/**
 * Creates the folders a recommendation names that do not exist yet. When one fails, the ones it
 * already created are removed again before the error is thrown.
 */
export async function createRecommendedFolderPath(
  recommendation: FolderRecommendation,
  folders: readonly BookmarkTreeNode[],
  /** Creates and removes the folders; a history writer records them. */
  writer: Pick<BookmarkWriter, 'create' | 'remove'> = {
    create: (details) => createBookmark(details),
    remove: deleteBookmark,
  },
): Promise<RecommendedFolderPathResult> {
  const { folder, existingTitles, newTitles } = resolveRecommendedFolderPath(
    recommendation,
    folders,
  );
  // Only the first new folder can collide; the ones below it go into brand-new folders.
  const conflict = newTitles[0]
    ? folder.children?.find((child) => child.url && sameTitle(child.title, newTitles[0]))
    : undefined;
  if (conflict) throw new RecommendedFolderError('path-conflict', newTitles[0]);

  const createdFolderIds: string[] = [];
  let folderId = folder.id;
  try {
    for (const title of newTitles) {
      const created = await writer.create({ parentId: folderId, title });
      createdFolderIds.push(created.id);
      folderId = created.id;
    }
  } catch (error) {
    await removeEmptyFolders(createdFolderIds, writer.remove);
    throw error;
  }
  return { folderId, folderTitles: [...existingTitles, ...newTitles], createdFolderIds };
}

/**
 * Saves `bookmark` into the suggested folder, creating the folders it needs; one undo history
 * entry and one History record (`audit` names where from, such as quick save).
 */
export async function createRecommendedFolderBookmark(
  recommendation: FolderRecommendation,
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
  audit: BookmarkWriteAudit = {},
): Promise<RecommendedFolderBookmarkResult> {
  const { result } = await recordBookmarkWrites(
    { action: 'add', title: bookmark.title },
    (writer) => saveIntoRecommendedFolder(recommendation, bookmark, folders, writer),
    audit,
  );
  return result;
}

async function saveIntoRecommendedFolder(
  recommendation: FolderRecommendation,
  bookmark: { title: string; url: string },
  folders: BookmarkTreeNode[],
  writer: BookmarkWriter,
): Promise<RecommendedFolderBookmarkResult> {
  const { folderId, folderTitles, createdFolderIds } = await createRecommendedFolderPath(
    recommendation,
    folders,
    writer,
  );

  try {
    const children = await getBookmarkChildren(folderId);
    const duplicate = children.find(
      (child) => child.url && comparableUrl(child.url) === comparableUrl(bookmark.url),
    );
    if (duplicate) {
      return {
        status: 'duplicate',
        folderId,
        folderTitles,
        bookmarkId: duplicate.id,
        createdFolderIds,
      };
    }

    const createdBookmark = await writer.create({
      parentId: folderId,
      title: bookmark.title || t('popup_newBookmark'),
      url: bookmark.url,
    });

    return {
      status: 'created',
      folderId,
      folderTitles,
      bookmarkId: createdBookmark.id,
      createdFolderIds,
    };
  } catch (error) {
    await removeEmptyFolders(createdFolderIds, writer.remove);
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
