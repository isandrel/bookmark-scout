/**
 * The search engine behind typed searches that rank what they find: BM25 relevance over weighted
 * fields, with each typed word standing for library words it matches as typed, as the start of a
 * longer word (Match Word Starts), or spelled a little differently (Fuzzy Matching), each counting
 * less in that order, as MiniSearch and Lunr do. Every typed word must be found in a document.
 *
 * A caller describes its documents as fields of words with a weight each (folder matches: the
 * folder's name, its parents, the bookmarks in it). How words match and BM25's k1 and b are the
 * user's Search Matching settings (`SearchMatching`); the rest is `config/bookmarks/search-ranking.toml`.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const searchConfig = readConfig(
  'bookmarks/search-ranking',
  z.strictObject({
    idf_smoothing: z.number().positive(),
    prefix_weight: boundedNumber({ integer: false }),
    fuzzy_weight: boundedNumber({ integer: false }),
    max_expansions: boundedNumber({ integer: true }),
    fuzzy_word_list_rebuild_ratio: z.number().positive(),
  }),
);

/** A library's word list is made afresh once it remembers this many times its documents. */
export const FUZZY_WORD_LIST_REBUILD_RATIO = searchConfig.fuzzy_word_list_rebuild_ratio;

/** How typed words match and how BM25 scores (Settings > Saving & Search > Search Matching). */
export type SearchMatching = {
  /** Words spelled a little differently match too (Fuzzy Matching). */
  fuzzy: boolean;
  /** The shortest word that may differ by one edit, and by two. */
  fuzzyOneEdit: number;
  fuzzyTwoEdits: number;
  /** A typed word matches the longer words it starts (Match Word Starts). */
  prefix: boolean;
  /** BM25 k1 (term-frequency saturation) and b (length normalization). */
  k1: number;
  b: number;
};

/** One part of a document, such as a title, and how much a word in it counts. */
export type RankedField<Document> = {
  weight: number;
  words: (document: Document) => readonly string[];
};

type Indexed<Document> = {
  document: Document;
  /** Weighted count of each word. */
  terms: Map<string, number>;
  /** Weighted number of words. */
  length: number;
};

export type RankedIndex<Document> = {
  entries: Indexed<Document>[];
  /** How many documents have each word, which is also every word in the library. */
  documentFrequency: Map<string, number>;
  averageLength: number;
};

export type RankedHit<Document> = {
  document: Document;
  score: number;
};

/** Indexes `documents` by their weighted fields; a field of weight 0 is left out. */
export function buildRankedIndex<Document>(
  documents: readonly Document[],
  fields: readonly RankedField<Document>[],
): RankedIndex<Document> {
  const entries: Indexed<Document>[] = [];
  const documentFrequency = new Map<string, number>();
  let totalLength = 0;
  for (const document of documents) {
    const terms = new Map<string, number>();
    let length = 0;
    for (const field of fields) {
      if (field.weight === 0) continue;
      const words = field.words(document);
      for (const word of words) terms.set(word, (terms.get(word) ?? 0) + field.weight);
      length += words.length * field.weight;
    }
    for (const word of terms.keys()) {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    }
    entries.push({ document, terms, length });
    totalLength += length;
  }
  return {
    entries,
    documentFrequency,
    averageLength: entries.length > 0 ? totalLength / entries.length : 0,
  };
}

// The three rows the distance is worked out in, reused by every call and grown when a word is
// longer: searching compares every word of every bookmark, so a call must not allocate.
const DISTANCE_ROW_LENGTH = 64;
const newDistanceRows = (length: number) =>
  [new Int32Array(length), new Int32Array(length), new Int32Array(length)] as const;
let distanceRows = newDistanceRows(DISTANCE_ROW_LENGTH);

/**
 * Damerau-Levenshtein distance between `a` and the part of `b` from `start` to `end`, or
 * `limit + 1` once it is known to be more than `limit`, which is all fuzzy matching needs. It
 * reads `b` in place, so a caller scanning a text for words slices nothing.
 */
export function editDistanceWithinRange(
  a: string,
  b: string,
  start: number,
  end: number,
  limit: number,
): number {
  const aLength = a.length;
  const bLength = end - start;
  if (Math.abs(aLength - bLength) > limit) return limit + 1;
  if (distanceRows[0].length <= bLength) {
    // Twice the word, so a run of ever longer words grows the rows only now and then.
    distanceRows = newDistanceRows(bLength * 2 + 1);
  }
  // `before` is the row two back (for a swap of neighbours), `previous` the row above.
  let [before, previous, current] = distanceRows;
  for (let j = 0; j <= bLength; j++) previous[j] = j;
  for (let i = 1; i <= aLength; i++) {
    const aChar = a.charCodeAt(i - 1);
    current[0] = i;
    let least = i;
    for (let j = 1; j <= bLength; j++) {
      const bChar = b.charCodeAt(start + j - 1);
      let edits = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (aChar === bChar ? 0 : 1),
      );
      if (
        i > 1 &&
        j > 1 &&
        aChar === b.charCodeAt(start + j - 2) &&
        a.charCodeAt(i - 2) === bChar
      ) {
        edits = Math.min(edits, before[j - 2] + 1);
      }
      current[j] = edits;
      if (edits < least) least = edits;
    }
    // No later row goes back under the limit: a row's least value is at most one more than the
    // row above's, so the row above is at the limit too, and a swap from it costs one more.
    if (least > limit) return limit + 1;
    [before, previous, current] = [previous, current, before];
  }
  return Math.min(previous[bLength], limit + 1);
}

/** Damerau-Levenshtein distance between two words, or `limit + 1` when it is more than `limit`. */
export function editDistanceWithin(a: string, b: string, limit: number): number {
  return editDistanceWithinRange(a, b, 0, b.length, limit);
}

/** Search Matching as the settings hold it. */
export function searchMatchingOf(settings: Settings): SearchMatching {
  return {
    fuzzy: settings.searchFuzzy,
    fuzzyOneEdit: settings.searchFuzzyOneEdit,
    fuzzyTwoEdits: settings.searchFuzzyTwoEdits,
    prefix: settings.searchPrefix,
    k1: settings.searchBm25K1,
    b: settings.searchBm25B,
  };
}

/** How much a word one edit away counts, relative to the whole word (a second edit halves it). */
export const FUZZY_MATCH_WEIGHT = searchConfig.fuzzy_weight;

/** How many edits a typed word of this length may differ by. */
export function fuzzyBudget(length: number, matching: SearchMatching): number {
  if (!matching.fuzzy) return 0;
  if (length >= matching.fuzzyTwoEdits) return 2;
  return length >= matching.fuzzyOneEdit ? 1 : 0;
}

/** A library word a typed word stands for, how much it counts, and how rare it is. */
type Expansion = { term: string; weight: number; idf: number };

/** The library words a typed word stands for, best first, at most `max_expansions`. */
function expandWord<Document>(
  word: string,
  index: RankedIndex<Document>,
  matching: SearchMatching,
): Expansion[] {
  const budget = fuzzyBudget(word.length, matching);
  const total = index.entries.length;
  const found: Expansion[] = [];
  for (const [term, frequency] of index.documentFrequency) {
    let weight = 0;
    if (term === word) weight = 1;
    else if (matching.prefix && term.startsWith(word)) weight = searchConfig.prefix_weight;
    else if (budget > 0) {
      const edits = editDistanceWithin(word, term, budget);
      if (edits <= budget) weight = searchConfig.fuzzy_weight / 2 ** (edits - 1);
    }
    if (weight > 0) {
      found.push({ term, weight, idf: bm25Idf(total, frequency, searchConfig.idf_smoothing) });
    }
  }
  return found
    .sort((a, b) => b.weight - a.weight || b.idf - a.idf)
    .slice(0, searchConfig.max_expansions);
}

export type RankedResult<Document> = {
  hits: RankedHit<Document>[];
  /** Every library word the typed words matched, for highlighting. */
  terms: ReadonlySet<string>;
};

/**
 * The documents that have every one of `words` (already split and normalized, as `splitWords`
 * gives them), scored with BM25; unsorted, since callers add their own ranking.
 */
export function searchRankedIndex<Document>(
  index: RankedIndex<Document>,
  words: readonly string[],
  matching: SearchMatching,
): RankedResult<Document> {
  if (words.length === 0) return { hits: [], terms: new Set() };
  const expansions = words.map((word) => expandWord(word, index, matching));
  if (expansions.some((list) => list.length === 0)) return { hits: [], terms: new Set() };

  const hits: RankedHit<Document>[] = [];
  for (const entry of index.entries) {
    let score = 0;
    for (const list of expansions) {
      let best = 0;
      for (const { term, weight, idf } of list) {
        const count = entry.terms.get(term);
        if (!count) continue;
        const termScore =
          weight * bm25TermScore(idf, count, entry.length, index.averageLength, matching);
        if (termScore > best) best = termScore;
      }
      if (best === 0) {
        score = 0;
        break;
      }
      score += best;
    }
    if (score > 0) hits.push({ document: entry.document, score });
  }
  return { hits, terms: new Set(expansions.flatMap((list) => list.map(({ term }) => term))) };
}
