/**
 * Folder matching for saving the current page by typing part of a folder's name. Unlike the
 * bookmark search, which filters the tree, this returns a flat, ranked list of folders.
 *
 * Folders are ranked by relevance with the search engine in `bm25-search.ts` (BM25, word starts,
 * and fuzzy matching, as Search Matching says): each folder is a document made of its own name,
 * its parents' names, and the titles and site names of the bookmarks directly in it, each part
 * weighted (Folder Matches settings). Every typed word must be found in the folder, so "react
 * hooks" and "frontend/react" find nested folders, "rea" finds React, and "rect" finds it too.
 * Recently used folders get a boost; ties go to shallower folders, then by name.
 */

import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';
import type { BookmarkTreeNode } from '@/types';

const folderMatchConfig = readConfig(
  'ui/popup-folder-matches',
  z.strictObject({
    recent_boost: boundedNumber({ integer: false }),
    max_height_fraction: z.number().gt(0).max(1),
  }),
);

/** Largest share of the popup's height the match list may take before it scrolls. */
export const FOLDER_MATCH_MAX_HEIGHT_FRACTION = folderMatchConfig.max_height_fraction;

/** How much a folder's name, its parents' names, and the bookmarks in it count; 0 leaves one out. */
export type FolderMatchWeights = { name: number; parents: number; bookmarks: number };

export type FolderMatch = {
  folder: BookmarkTreeNode;
  /** Titles of the folder's parents, outermost first, without the browser's invisible root. */
  parents: string[];
  /** Where the typed words were found in the folder's title, for highlighting. */
  titleRanges: [number, number][];
  score: number;
};

function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase();
}

type FolderEntry = { folder: BookmarkTreeNode; parents: string[] };

/**
 * Every folder the page can be saved in: not the invisible root, and not folders the browser
 * manages or that go away (`isTemporary`).
 */
function collectFolders(
  nodes: readonly BookmarkTreeNode[],
  parents: string[],
  out: FolderEntry[],
): FolderEntry[] {
  for (const node of nodes) {
    if (!node.children || node.url) continue;
    const isRoot = isBookmarkTreeRoot(node);
    if (!isRoot && !node.unmodifiable && !node.isTemporary) out.push({ folder: node, parents });
    collectFolders(node.children, isRoot ? parents : [...parents, node.title], out);
  }
  return out;
}

/**
 * A folder's fields: names keep every word, short and common ones too, since a folder is often
 * named by one; bookmark titles drop stop words, as quick save's ranking does.
 */
function folderFields(weights: FolderMatchWeights): RankedField<FolderEntry>[] {
  return [
    { weight: weights.name, words: ({ folder }) => splitWords(folder.title) },
    { weight: weights.parents, words: ({ parents }) => parents.flatMap(splitWords) },
    {
      weight: weights.bookmarks,
      words: ({ folder }) =>
        (folder.children ?? []).flatMap((child) =>
          child.url ? [...tokenizeText(child.title), ...tokenizeHost(child.url)] : [],
        ),
    },
  ];
}

/**
 * One index per tree and set of weights: a tree is replaced, not changed, when a bookmark changes,
 * and the weights only when a setting does.
 */
const indexes = new WeakMap<readonly BookmarkTreeNode[], Map<string, RankedIndex<FolderEntry>>>();
function folderIndexOf(
  tree: readonly BookmarkTreeNode[],
  weights: FolderMatchWeights,
): RankedIndex<FolderEntry> {
  const key = [weights.name, weights.parents, weights.bookmarks].join('/');
  let byWeights = indexes.get(tree);
  if (!byWeights) {
    byWeights = new Map();
    indexes.set(tree, byWeights);
  }
  let index = byWeights.get(key);
  if (!index) {
    index = buildRankedIndex(collectFolders(tree, [], []), folderFields(weights));
    byWeights.set(key, index);
  }
  return index;
}

/** Where words the typed words stand for appear in the title, for highlighting. */
function findRanges(title: string, terms: ReadonlySet<string>): [number, number][] {
  const haystack = normalize(title);
  // Highlighting needs offsets in the original title; skip it when normalizing changed lengths.
  if (haystack.length !== title.length) return [];
  const ranges: [number, number][] = [];
  for (const match of haystack.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    const start = match.index ?? 0;
    if (terms.has(match[0])) ranges.push([start, start + match[0].length]);
  }
  return ranges;
}

export type FolderMatchOptions = {
  /** How many matches to return (Settings > Search > Maximum folder matches). */
  limit: number;
  /** How typed words match (Settings > Saving & Search > Search Matching). */
  matching: SearchMatching;
  /** How much each part of a folder counts (Settings > Saving & Search > Folder Matches). */
  weights: FolderMatchWeights;
  /** Recently used folders, most recent first. */
  recentFolderIds?: readonly string[];
};

/**
 * `next` in the order `previous` showed the same folders in, with folders `previous` did not
 * have after them in their own order. Holds a list still while the user points at it or moves
 * through it with the keyboard, so a row does not jump away from under the pointer.
 */
export function holdFolderMatchOrder(
  previous: readonly FolderMatch[],
  next: readonly FolderMatch[],
): FolderMatch[] {
  const position = new Map(previous.map((match, index) => [match.folder.id, index]));
  const known = next.filter((match) => position.has(match.folder.id));
  known.sort((a, b) => (position.get(a.folder.id) ?? 0) - (position.get(b.folder.id) ?? 0));
  return [...known, ...next.filter((match) => !position.has(match.folder.id))];
}

type FolderEntryTitles = { title: string; parents: string[] };

/** A recent folder chip: the folder's title, with parents only where titles repeat. */
export type RecentFolderLabel = {
  id: string;
  title: string;
  /**
   * The closest parents that tell this folder from others with the same title, outermost first;
   * empty when its title is unique among the chips.
   */
  context: string[];
  /** Titles from the outermost folder down to this one, for its tooltip. */
  path: string[];
};

/** Each folder's title and parents in `tree`, outermost first, without the invisible root. */
function foldersById(tree: readonly BookmarkTreeNode[]): Map<string, FolderEntryTitles> {
  const parentsById = new Map<string, FolderEntryTitles>();
  const visit = (nodes: readonly BookmarkTreeNode[], parents: string[]) => {
    for (const node of nodes) {
      if (!node.children) continue;
      parentsById.set(node.id, { title: node.title, parents });
      visit(node.children, isBookmarkTreeRoot(node) ? parents : [...parents, node.title]);
    }
  };
  visit(tree, []);
  return parentsById;
}

/**
 * Labels for the recent folder chips. Folders that share a title ("Inbox" in Work and in Home)
 * each get the fewest closest parents that tell them apart, like folder matches show where a
 * folder is. Titles come from `tree` when the folder is in it, so a renamed folder shows its
 * new name.
 */
export function labelRecentFolders(
  folders: readonly { id: string; title: string }[],
  tree: readonly BookmarkTreeNode[],
): RecentFolderLabel[] {
  const inTree = foldersById(tree);
  const entries = folders.map((folder) => {
    const title = inTree.get(folder.id)?.title ?? folder.title;
    const parents = inTree.get(folder.id)?.parents ?? [];
    return { id: folder.id, title, parents, key: normalize(getBookmarkDisplayTitle(title)) };
  });
  const suffix = (parents: readonly string[], depth: number) =>
    parents.slice(Math.max(0, parents.length - depth));
  return entries.map(({ id, title, parents, key }) => {
    const namesakes = entries.filter((other) => other.id !== id && other.key === key);
    let depth = 0;
    const sameContext = (other: (typeof entries)[number]) =>
      suffix(other.parents, depth).map(normalize).join('\n') ===
      suffix(parents, depth).map(normalize).join('\n');
    while (depth < parents.length && namesakes.some(sameContext)) depth += 1;
    return { id, title, context: suffix(parents, depth), path: [...parents, title] };
  });
}

/** The folders that best match `query`, ranked. */
export function findFolderMatches(
  tree: readonly BookmarkTreeNode[],
  query: string,
  { limit, matching, weights, recentFolderIds = [] }: FolderMatchOptions,
): FolderMatch[] {
  const { hits, terms } = searchRankedIndex(
    folderIndexOf(tree, weights),
    splitWords(query),
    matching,
  );
  return hits
    .map(({ document: { folder, parents }, score }) => {
      const recentRank = recentFolderIds.indexOf(folder.id);
      const recentShare = recentRank === -1 ? 0 : 1 - recentRank / recentFolderIds.length;
      return {
        folder,
        parents,
        titleRanges: findRanges(folder.title, terms),
        score: score * (1 + folderMatchConfig.recent_boost * recentShare),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.parents.length - b.parents.length ||
        a.folder.title.localeCompare(b.folder.title),
    )
    .slice(0, limit);
}
