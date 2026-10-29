/**
 * Plain-text matching shared by every search that marks what it found: the Options page's settings
 * search (`settings-search.ts`) and the bookmark search (`search-documents.ts`). A text and a word
 * are folded by the same `TextFoldRules`, which say what the comparison ignores: case, accents
 * (`é` matches `e`, as Chrome's own settings search does), and the width of full-width forms (`Ａ`
 * matches `a`). Each search keeps its own rules: the settings search reads them from
 * `config/ui/settings-search.toml`; the bookmark search ignores case only.
 *
 * Words are found with `indexOf`, never a regular expression, so `c++`, `(`, or `.*` are ordinary
 * text. Languages written without spaces (Chinese, Japanese) are matched by substring, so any run
 * of characters the user types is one word.
 *
 * Ranges are offsets into the original text, in UTF-16 units, so the page can wrap them in
 * `<mark>`; a match that covers part of a character that folds to several (`ﬁ`, `İ`) marks the
 * whole character.
 */

/** What a comparison ignores. */
export type TextFoldRules = {
  readonly ignoreCase: boolean;
  readonly ignoreAccents: boolean;
  readonly ignoreWidth: boolean;
};

/**
 * How a query's text becomes terms: `allWords` needs each word, anywhere and in any order;
 * `phrase` needs the whole query as typed (runs of spaces read as one).
 */
export const TEXT_QUERY_MODES = ['allWords', 'phrase'] as const;
export type TextQueryMode = (typeof TEXT_QUERY_MODES)[number];

/** A compiled query: its terms, folded by `rules`, the way the texts it is matched against are. */
export type TextQuery = { readonly terms: readonly string[]; readonly rules: TextFoldRules };

/** Where a query's words are in one text, and which of the words were found there. */
export type TextMatch = {
  /** Sorted, with overlapping and touching ranges joined. */
  ranges: SearchMatchRange[];
  /** Indexes into `TextQuery.terms`. */
  terms: ReadonlySet<number>;
};

/**
 * Text folded for comparison, and where each folded code unit came from: `[starts[i], ends[i])`
 * is the original character folded unit `i` belongs to. Both are unset when folding kept every
 * offset (plain ASCII, or only case changed and the length stayed), which is most text.
 */
export type FoldedText = { text: string; starts?: number[]; ends?: number[] };

// Combining diacritical marks (U+0300-U+036F), the range Chrome's settings search strips. Marks
// outside it, such as the Japanese voicing marks, are part of the letter and stay.
const COMBINING_MARKS = /[̀-ͯ]/g;
// Printable ASCII has no accents or wide forms, and lowercasing it keeps every offset.
const OUTSIDE_PRINTABLE_ASCII = /[^ -~]/;
const WHITESPACE = /\s+/u;
const WORD_SEPARATOR = ' ';

/**
 * The Unicode normalization a fold needs: decomposed when accents go (so they can be stripped),
 * compatibility forms when width goes (`Ａ` to `A`), composed again when accents stay.
 */
function normalizationOf(rules: TextFoldRules): 'NFKD' | 'NFD' | 'NFKC' | undefined {
  if (rules.ignoreAccents) return rules.ignoreWidth ? 'NFKD' : 'NFD';
  return rules.ignoreWidth ? 'NFKC' : undefined;
}

function foldCharacter(character: string, rules: TextFoldRules): string {
  const cased = rules.ignoreCase ? character.toLowerCase() : character;
  const form = normalizationOf(rules);
  const normalized = form ? cased.normalize(form) : cased;
  return rules.ignoreAccents ? normalized.replace(COMBINING_MARKS, '') : normalized;
}

/** `text` folded by `rules`, with the map back to its offsets when folding moved them. */
export function foldText(text: string, rules: TextFoldRules): FoldedText {
  const cased = rules.ignoreCase ? text.toLowerCase() : text;
  if (!OUTSIDE_PRINTABLE_ASCII.test(text)) return { text: cased };
  // Case alone changes the length of only a few characters (`İ`); while the length stays, so do
  // the offsets.
  if (!normalizationOf(rules) && cased.length === text.length) return { text: cased };
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  // Where the last character that folded to something starts in `starts` and `ends`.
  let previous = 0;
  for (const character of text) {
    const part = foldCharacter(character, rules);
    const end = index + character.length;
    if (part.length === 0) {
      // A separate accent (e + U+0301) belongs to the letter before it, so a mark on the
      // letter takes it along.
      ends.fill(end, previous);
    } else {
      previous = ends.length;
      for (let unit = 0; unit < part.length; unit += 1) {
        starts.push(index);
        ends.push(end);
      }
    }
    folded += part;
    index = end;
  }
  return { text: folded, starts, ends };
}

/**
 * Every place the folded `term` is in `folded`, as ranges of the original text, overlapping
 * repeats included (`aa` in `aaa` twice); `joinRanges` turns them into marks.
 */
export function findFoldedRanges(folded: FoldedText, term: string): SearchMatchRange[] {
  const ranges: SearchMatchRange[] = [];
  if (!term) return ranges;
  for (let at = folded.text.indexOf(term); at !== -1; at = folded.text.indexOf(term, at + 1)) {
    const last = at + term.length - 1;
    ranges.push([folded.starts?.[at] ?? at, folded.ends?.[last] ?? last + 1]);
  }
  return ranges;
}

// Interface text repeats on every keystroke of a search; fold each string once per set of rules.
const foldedTexts = new WeakMap<TextFoldRules, Map<string, FoldedText>>();

function foldedOf(text: string, rules: TextFoldRules): FoldedText {
  let cache = foldedTexts.get(rules);
  if (!cache) {
    cache = new Map();
    foldedTexts.set(rules, cache);
  }
  let folded = cache.get(text);
  if (!folded) {
    folded = foldText(text, rules);
    cache.set(text, folded);
  }
  return folded;
}

/** The query's terms, folded by `rules`; undefined for a query of only spaces. */
export function compileTextQuery(
  query: string,
  rules: TextFoldRules,
  mode: TextQueryMode,
): TextQuery | undefined {
  const words = query.trim().split(WHITESPACE);
  const parts = mode === 'phrase' ? [words.join(WORD_SEPARATOR)] : words;
  const terms = [...new Set(parts.map((part) => foldText(part, rules).text).filter(Boolean))];
  return terms.length > 0 ? { terms, rules } : undefined;
}

/** Sorts ranges and joins the ones that overlap or touch, so each run of matches is one mark. */
export function joinRanges(ranges: readonly SearchMatchRange[]): SearchMatchRange[] {
  const sorted = [...ranges].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const joined: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = joined.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else joined.push([start, end]);
  }
  return joined;
}

/** Every place each of the query's terms is in `text`. */
export function findTextMatches(text: string, query: TextQuery): TextMatch {
  const folded = foldedOf(text, query.rules);
  const ranges: SearchMatchRange[] = [];
  const terms = new Set<number>();
  query.terms.forEach((term, termIndex) => {
    const found = findFoldedRanges(folded, term);
    if (found.length === 0) return;
    ranges.push(...found);
    terms.add(termIndex);
  });
  return { ranges: joinRanges(ranges), terms };
}

/** Whether every term of the query is somewhere in `texts`, each in any of them. */
export function matchesEveryTerm(texts: readonly string[], query: TextQuery): boolean {
  const found = new Set<number>();
  for (const text of texts) {
    for (const term of findTextMatches(text, query).terms) found.add(term);
  }
  return found.size === query.terms.length;
}
