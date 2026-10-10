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
import type { BookmarkTreeNode } from '@/types';

const folderMatchConfig = readConfig(
  'ui/popup-folder-matches',
  z.strictObject({
    fuzzy_min_length: z.number().int().min(2).max(20),
    recent_bonus: z.number().int().min(0).max(100),
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

/** Damerau-Levenshtein distance; lengths more than 2 apart return 3, which is all the typo check needs. */
function editDistanceAtMost2(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
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
    if (editDistanceAtMost2(word, nameWord) <= 1) return true;
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
    if (!earlierWords.every((word) => names.some((name) => scoreWord(word, name, allowTypos) > 0))) continue;

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
