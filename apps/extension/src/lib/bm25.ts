/**
 * BM25, the relevance score search engines rank documents by: a word counts for more when few
 * documents have it (`bm25Idf`) and when a document has it often, with diminishing returns (`k1`),
 * relative to how long the document is (`b`). Shared by quick save's folder ranking
 * (`folder-ranking.ts`) and the folder matches of popup search (`folder-match.ts`), each with its
 * own parameters from config.
 */

export type Bm25Parameters = {
  /** Term-frequency saturation: higher lets repeated words keep adding to the score. */
  k1: number;
  /** Length normalization, 0 to 1: higher favors short documents over long ones. */
  b: number;
};

/**
 * How rare a word is among `total` documents, `frequency` of which have it, with `smoothing`
 * added to both counts and the +1 that keeps a word found in most documents above zero.
 */
export function bm25Idf(total: number, frequency: number, smoothing: number): number {
  return Math.log(1 + (total - frequency + smoothing) / (frequency + smoothing));
}

/** One word's score in a document that has it `count` times (weighted) in `length` words. */
export function bm25TermScore(
  idf: number,
  count: number,
  length: number,
  averageLength: number,
  { k1, b }: Bm25Parameters,
): number {
  const norm = k1 * (1 - b + (b * length) / (averageLength || 1));
  return (idf * count * (k1 + 1)) / (count + norm);
}
