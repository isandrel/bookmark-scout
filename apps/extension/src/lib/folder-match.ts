/**
 * Folder matching for saving the current page by typing part of a folder's name. Unlike the
 * bookmark search, which filters the tree, this returns a flat, ranked list of folders:
 *
 * - The last word must match the folder's own name; earlier words must each match the folder or
 *   one of its parents, so "react hooks" and "frontend/react" find nested folders.
 * - A whole name beats a name that starts with the word, then a word inside the name, then any
 *   substring, then, when allowed, a name one typo away (words of `fuzzy_min_length` or more).
 * - Recently used folders rank higher, then shallower folders, then by name.
 */

import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';
import type { BookmarkTreeNode } from '@/types';

const folderMatchConfig = readConfig(
  'ui/popup-folder-matches',
  z.strictObject({
    fuzzy_min_length: boundedNumber({ integer: true }),
    typo_max_edits: z.number().int().positive(),
    recent_bonus: boundedNumber({ integer: true }),
    max_height_fraction: z.number().gt(0).max(1),
  }),
);

/** Largest share of the popup's height the match list may take before it scrolls. */
export const FOLDER_MATCH_MAX_HEIGHT_FRACTION = folderMatchConfig.max_height_fraction;

/** Separators between words: spaces, and the slashes and arrows people type in folder paths. */
const WORD_SEPARATOR = /[\s/\\>›»]+/u;
/** Splits a name into words, so "Q4 Launch" offers "q4" and "launch" as word starts. */
const NAME_WORD = /[\p{L}\p{N}]+/gu;

/** How well a word matches a name, best first; `none` rejects the folder. */
const MATCH_SCORE = { exact: 100, prefix: 80, wordPrefix: 60, substring: 40, typo: 20, none: 0 };

export type FolderMatch = {
  folder: BookmarkTreeNode;
  /** Titles of the folder's parents, outermost first, without the browser's invisible root. */
  parents: string[];
  /** Where the last search word appears in the folder's title, for highlighting. */
  titleRanges: [number, number][];
  score: number;
};

function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase();
}

/**
 * Damerau-Levenshtein distance, or `limit + 1` when the lengths alone differ by more than
 * `limit`, which is all the typo check needs.
 */
function editDistanceWithin(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

/**
 * A word one typo away from a whole word in the name ("rect" -> "react", "raect" -> "react").
 * Only whole words: against word starts, "rect" would also match "recipes".
 */
function isOneTypoAway(word: string, name: string): boolean {
  if (word.length < folderMatchConfig.fuzzy_min_length) return false;
  for (const [nameWord] of name.matchAll(NAME_WORD)) {
    const limit = folderMatchConfig.typo_max_edits;
    if (editDistanceWithin(word, nameWord, limit) <= limit) return true;
  }
  return false;
}

function scoreWord(word: string, name: string, allowTypos: boolean): number {
  if (name === word) return MATCH_SCORE.exact;
  if (name.startsWith(word)) return MATCH_SCORE.prefix;
  const index = name.indexOf(word);
  if (index > 0) {
    return /[\p{L}\p{N}]/u.test(name[index - 1]) ? MATCH_SCORE.substring : MATCH_SCORE.wordPrefix;
  }
  return allowTypos && isOneTypoAway(word, name) ? MATCH_SCORE.typo : MATCH_SCORE.none;
}

function findRanges(title: string, word: string): [number, number][] {
  const haystack = normalize(title);
  // Highlighting needs offsets in the original title; skip it when normalizing changed lengths.
  if (haystack.length !== title.length) return [];
  const index = haystack.indexOf(word);
  return index === -1 ? [] : [[index, index + word.length]];
}

type FolderEntry = { folder: BookmarkTreeNode; parents: string[] };

function collectFolders(
  nodes: readonly BookmarkTreeNode[],
  parents: string[],
  out: FolderEntry[],
): FolderEntry[] {
  for (const node of nodes) {
    if (!node.children || node.url) continue;
    const isRoot = isBookmarkTreeRoot(node);
    // The invisible root and folders the browser manages cannot hold the page.
    if (!isRoot && !node.unmodifiable && !node.isTemporary) out.push({ folder: node, parents });
    collectFolders(node.children, isRoot ? parents : [...parents, node.title], out);
  }
  return out;
}

export type FolderMatchOptions = {
  /** How many matches to return (Settings > Search > Maximum folder matches). */
  limit: number;
  /** Whether a name one typo away matches (Settings > Search > Allow typos). */
  allowTypos: boolean;
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
  { limit, allowTypos, recentFolderIds = [] }: FolderMatchOptions,
): FolderMatch[] {
  const words = normalize(query).split(WORD_SEPARATOR).filter(Boolean);
  const lastWord = words.at(-1);
  if (!lastWord) return [];
  const earlierWords = words.slice(0, -1);

  const matches: FolderMatch[] = [];
  for (const { folder, parents } of collectFolders(tree, [], [])) {
    const title = normalize(folder.title);
    const titleScore = scoreWord(lastWord, title, allowTypos);
    if (titleScore === MATCH_SCORE.none) continue;

    const names = [...parents.map(normalize), title];
    if (!earlierWords.every((word) => names.some((name) => scoreWord(word, name, allowTypos) > 0)))
      continue;

    const recentRank = recentFolderIds.indexOf(folder.id);
    const recentScore =
      recentRank === -1
        ? 0
        : Math.max(0, folderMatchConfig.recent_bonus * (1 - recentRank / recentFolderIds.length));
    matches.push({
      folder,
      parents,
      titleRanges: findRanges(folder.title, lastWord),
      score: titleScore + recentScore,
    });
  }

  return matches
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.parents.length - b.parents.length ||
        a.folder.title.localeCompare(b.folder.title),
    )
    .slice(0, limit);
}
