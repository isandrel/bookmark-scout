/**
 * Local folder ranking for quick save: which folder does a page belong in, without AI.
 *
 * Each writable folder is a BM25 document made of its own name, the names of its parents, and the
 * titles and site names of the bookmarks directly in it, each part weighted
 * (`config/bookmarks/folder-ranking.toml`). The page's title, site name, and URL path words are
 * the query. Pure functions only: the background builds the index from `bookmarks.getTree()` and
 * keeps it until a bookmark changes.
 *
 * Words come from `Intl.Segmenter` (word granularity) for text in scripts written without spaces
 * (Chinese, Japanese, Thai, and others), so 机器学习 matches a folder named 机器学习 inside a longer
 * title. Other text is split on letters and digits, which gives the same words for spaced scripts
 * and is several times faster on a library of thousands of bookmarks.
 */

import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const rankingConfig = readConfig(
  'bookmarks/folder-ranking',
  z.strictObject({
    k1: z.number().min(0).max(5),
    b: z.number().min(0).max(1),
    min_score: z.number().min(0),
    name_weight: z.number().min(0).max(20),
    path_weight: z.number().min(0).max(20),
    bookmark_weight: z.number().min(0).max(20),
    min_token_length: z.number().int().min(1).max(10),
    stop_words: z.array(z.string().min(1)),
  }),
);

/** The minimum score a folder needs to be chosen (`min_score`). */
export const FOLDER_RANKING_MIN_SCORE = rankingConfig.min_score;

const STOP_WORDS: ReadonlySet<string> = new Set(
  rankingConfig.stop_words.map((word) => normalizeWord(word)),
);

/** Scripts written without spaces between words, which need a dictionary to find words. */
const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
/** Characters that count double toward the minimum word length. */
const WIDE_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** A run of letters, combining marks, and digits: one word in a spaced script. */
const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const DIGITS_ONLY = /^\p{N}+$/u;

let segmenter: Intl.Segmenter | undefined;

function normalizeWord(word: string): string {
  return word.normalize('NFKC').toLocaleLowerCase();
}

function wordLength(word: string): number {
  let length = 0;
  for (const character of word) length += WIDE_CHARACTER.test(character) ? 2 : 1;
  return length;
}

function keepWord(word: string): boolean {
  return wordLength(word) >= rankingConfig.min_token_length && !STOP_WORDS.has(word);
}

/**
 * The words of `text`, lowercased, without stop words and words shorter than the configured
 * minimum, in order (repeats kept).
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeWord(text);
  const words: string[] = [];
  if (UNSPACED_SCRIPT.test(normalized)) {
    segmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
    for (const { segment, isWordLike } of segmenter.segment(normalized)) {
      if (isWordLike && keepWord(segment)) words.push(segment);
    }
  } else {
    for (const [word] of normalized.matchAll(WORD)) if (keepWord(word)) words.push(word);
  }
  return words;
}

/**
 * The words that name a site: the host's labels before its public suffix, without `www`
 * (`docs.github.com` -> docs, github; `news.bbc.co.uk` -> news, bbc).
 */
export function tokenizeHost(url: string | undefined): string[] {
  const hostname = getUrlHostname(url);
  // An IP address says nothing about what the page is about.
  if (!hostname || /^[\d.]+$/.test(hostname) || hostname.includes(':')) return [];
  const domain = getRegistrableDomain(hostname);
  const domainName = domain.includes('.') ? domain.slice(0, domain.indexOf('.')) : domain;
  const subdomain = hostname.length > domain.length ? hostname.slice(0, -domain.length - 1) : '';
  return [...subdomain.split('.'), domainName].flatMap((label) =>
    label ? tokenizeText(label.replace(/-/g, ' ')) : [],
  );
}

/** The words of a URL's path, decoded; numbers alone (ids, dates) are left out. */
export function tokenizeUrlPath(url: string | undefined): string[] {
  if (!url) return [];
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return [];
  }
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape keeps the raw path, whose letters still count.
  }
  return tokenizeText(decoded.replace(/[-_.+]/g, ' ')).filter((word) => !DIGITS_ONLY.test(word));
}

/** One candidate folder and the words that describe it. */
type FolderDocument = {
  id: string;
  /** Titles from the outermost visible folder down to this one. */
  path: string[];
  /** Weighted count of each word. */
  terms: Map<string, number>;
  /** Weighted number of words. */
  length: number;
};

export type FolderRankingIndex = {
  documents: FolderDocument[];
  /** How many folders contain each word. */
  documentFrequency: Map<string, number>;
  averageLength: number;
};

export type RankedFolder = {
  id: string;
  /** Titles from the outermost visible folder down to this one. */
  path: string[];
  score: number;
};

function addTerms(terms: Map<string, number>, words: readonly string[], weight: number): number {
  if (weight === 0) return 0;
  for (const word of words) terms.set(word, (terms.get(word) ?? 0) + weight);
  return words.length * weight;
}

/**
 * Indexes every folder a bookmark can be saved in: not the invisible root, and not folders the
 * browser manages (`unmodifiable`).
 */
export function buildFolderRankingIndex(tree: readonly BookmarkTreeNode[]): FolderRankingIndex {
  const documents: FolderDocument[] = [];
  const documentFrequency = new Map<string, number>();
  let totalLength = 0;

  const visit = (nodes: readonly BookmarkTreeNode[], parents: string[]) => {
    for (const node of nodes) {
      if (node.url || !node.children) continue;
      const isRoot = isBookmarkTreeRoot(node);
      const path = isRoot ? parents : [...parents, node.title];
      if (!isRoot && !node.unmodifiable) {
        const terms = new Map<string, number>();
        let length = addTerms(terms, tokenizeText(node.title), rankingConfig.name_weight);
        length += addTerms(terms, parents.flatMap(tokenizeText), rankingConfig.path_weight);
        for (const child of node.children) {
          if (!child.url) continue;
          const words = [...tokenizeText(child.title), ...tokenizeHost(child.url)];
          length += addTerms(terms, words, rankingConfig.bookmark_weight);
        }
        for (const word of terms.keys()) {
          documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
        }
        documents.push({ id: node.id, path, terms, length });
        totalLength += length;
      }
      visit(node.children, path);
    }
  };
  visit(tree, []);

  return {
    documents,
    documentFrequency,
    averageLength: documents.length > 0 ? totalLength / documents.length : 0,
  };
}

/** The query words for a page: its title, site name, and URL path, each word once. */
export function getPageQueryWords(page: { title?: string; url?: string }): string[] {
  return [
    ...new Set([
      ...tokenizeText(page.title ?? ''),
      ...tokenizeHost(page.url),
      ...tokenizeUrlPath(page.url),
    ]),
  ];
}

export type RankFoldersOptions = {
  /** How many folders to return at most. */
  limit: number;
  /** Folders to leave out, such as the one the page is already in. */
  excludeIds?: ReadonlySet<string>;
  /** Folders scoring below this are left out; defaults to the configured minimum. */
  minScore?: number;
};

/**
 * Folders ranked by how well they match the page, best first, scoring at least the minimum.
 * Ties go to the shallower folder, then the shorter path text, so results are stable.
 */
export function rankFolders(
  index: FolderRankingIndex,
  page: { title?: string; url?: string },
  { limit, excludeIds, minScore = FOLDER_RANKING_MIN_SCORE }: RankFoldersOptions,
): RankedFolder[] {
  const words = getPageQueryWords(page);
  const total = index.documents.length;
  if (words.length === 0 || total === 0 || limit <= 0) return [];

  const { k1, b } = rankingConfig;
  const weights = words.flatMap((word) => {
    const frequency = index.documentFrequency.get(word);
    if (!frequency) return [];
    // BM25 with the +1 that keeps a word found in most folders from scoring below zero.
    return [{ word, idf: Math.log(1 + (total - frequency + 0.5) / (frequency + 0.5)) }];
  });
  if (weights.length === 0) return [];

  const ranked: RankedFolder[] = [];
  for (const document of index.documents) {
    if (excludeIds?.has(document.id)) continue;
    const norm = k1 * (1 - b + (b * document.length) / (index.averageLength || 1));
    let score = 0;
    for (const { word, idf } of weights) {
      const frequency = document.terms.get(word);
      if (frequency) score += (idf * frequency * (k1 + 1)) / (frequency + norm);
    }
    if (score >= minScore) ranked.push({ id: document.id, path: document.path, score });
  }

  return ranked
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.path.length - right.path.length ||
        left.path.join('/').localeCompare(right.path.join('/')),
    )
    .slice(0, limit);
}
