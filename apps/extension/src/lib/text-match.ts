/**
 * Plain-text search for interface text, such as the Options page's settings search: the query is
 * read as words, and a text matches a word wherever it contains it, ignoring case and accents
 * (`é` matches `e`, as Chrome's own settings search does) and the width of full-width forms
 * (`Ａ` matches `a`). Words are found with `indexOf`, never a regular expression, so `c++`, `(`,
 * or `.*` are ordinary text. Languages written without spaces (Chinese, Japanese) are matched by
 * substring, so any run of characters the user types is one word.
 *
 * Ranges are offsets into the original text, in UTF-16 units, so the page can wrap them in
 * `<mark>`; a match that covers part of a character that folds to several (`ﬁ`) marks the whole
 * character.
 */

/** A compiled query: its words, folded the way texts are. */
export type TextQuery = { readonly terms: readonly string[] };

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
 * offset (plain ASCII), which is most interface text.
 */
type Folded = { text: string; starts?: number[]; ends?: number[] };

// Combining diacritical marks (U+0300-U+036F), the range Chrome's settings search strips. Marks
// outside it, such as the Japanese voicing marks, are part of the letter and stay.
const COMBINING_MARKS = /[̀-ͯ]/g;
// Printable ASCII folds by lowercasing alone, which keeps every offset.
const OUTSIDE_PRINTABLE_ASCII = /[^\u0020-\u007e]/;
const WHITESPACE = /\s+/u;

function foldCharacter(character: string): string {
  return character.toLowerCase().normalize('NFKD').replace(COMBINING_MARKS, '');
}

function foldText(text: string): Folded {
  if (!OUTSIDE_PRINTABLE_ASCII.test(text)) return { text: text.toLowerCase() };
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  // Where the last character that folded to something starts in `starts` and `ends`.
  let previous = 0;
  for (const character of text) {
    const part = foldCharacter(character);
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

// Interface text repeats on every keystroke of a search; fold each string once.
const foldedTexts = new Map<string, Folded>();

function foldedOf(text: string): Folded {
  let folded = foldedTexts.get(text);
  if (!folded) {
    folded = foldText(text);
    foldedTexts.set(text, folded);
  }
  return folded;
}

/** The query's words, folded; undefined for a query of only spaces. */
export function compileTextQuery(query: string): TextQuery | undefined {
  const terms = [
    ...new Set(
      query
        .trim()
        .split(WHITESPACE)
        .map((word) => foldText(word).text)
        .filter(Boolean),
    ),
  ];
  return terms.length > 0 ? { terms } : undefined;
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

/** Every place each of the query's words is in `text`. */
export function findTextMatches(text: string, query: TextQuery): TextMatch {
  const folded = foldedOf(text);
  const ranges: SearchMatchRange[] = [];
  const terms = new Set<number>();
  query.terms.forEach((term, termIndex) => {
    for (let at = folded.text.indexOf(term); at !== -1; at = folded.text.indexOf(term, at + 1)) {
      const last = at + term.length - 1;
      ranges.push([folded.starts?.[at] ?? at, folded.ends?.[last] ?? last + 1]);
      terms.add(termIndex);
    }
  });
  return { ranges: joinRanges(ranges), terms };
}

/** Whether every word of the query is somewhere in `texts`, each in any of them. */
export function matchesEveryTerm(texts: readonly string[], query: TextQuery): boolean {
  const found = new Set<number>();
  for (const text of texts) {
    for (const term of findTextMatches(text, query).terms) found.add(term);
  }
  return found.size === query.terms.length;
}
