import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const regexConfig = readConfig(
  'bookmarks/search-regex',
  z.strictObject({ max_pattern_length: z.number().int().positive() }),
);

/** Limits of the regular expression search option. */
export const REGEX_SEARCH = { maxPatternLength: regexConfig.max_pattern_length } as const;

export type SearchOptions = {
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
};

/** Plain, case-insensitive substring search: what a page starts with. */
export const DEFAULT_SEARCH_OPTIONS: Readonly<SearchOptions> = {
  matchCase: false,
  wholeWord: false,
  useRegex: false,
};

/** Start and end offsets of one highlighted match inside a title. */
export type SearchMatchRange = readonly [start: number, end: number];

type CompiledSearch = {
  test: (text: string) => boolean;
  ranges: (text: string) => SearchMatchRange[];
};

const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

/**
 * A word character for whole-word matching: any letter, number, mark, or underscore, except
 * Han, Hiragana, and Katakana. Those scripts do not separate words with spaces, so a script
 * change or punctuation next to them counts as a boundary. `\b` is ASCII-only and never matched
 * CJK terms or terms ending in symbols such as `C++`.
 */
const WORD_CHARACTER =
  '(?:(?![\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}])[\\p{L}\\p{N}\\p{M}_])';

/** An unbounded quantifier at `index` of a pattern: `*`, `+`, or `{n,}`. */
function unboundedQuantifierAt(source: string, index: number): boolean {
  const char = source[index];
  if (char === '*' || char === '+') return true;
  return char === '{' && /^\{\d+,\}/.test(source.slice(index));
}

/** The index just past the `)` or `]` that closes the group or class opened at `start`. */
function closingIndex(source: string, start: number): number {
  let depth = 0;
  let inClass = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') index += 1;
    else if (inClass) {
      inClass = char !== ']';
      if (!inClass && depth === 0) return index + 1;
    } else if (char === '[') inClass = true;
    else if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return source.length;
}

/** What follows an escape's backslash: `d`, `p{L}`, `u{1F600}`, `k<name>`, or a digit run. */
const ESCAPE_BODY =
  /^(?:[pP]\{[^}]*\}|u\{[^}]*\}|u[\da-fA-F]{4}|x[\da-fA-F]{2}|c[a-zA-Z]|k<[^>]*>|\d+|.)/su;
const QUANTIFIER = /^(?:[*+?]|\{\d+(?:,\d*)?\})\??/;
const LOOKAROUND = /^\((?:\?[=!]|\?<[=!])/;
const GROUP_PREFIX = /^\?(?::|<[^>=!]+>)/;

/**
 * One item of a pattern: a single-character matcher (`char`, which can be tried on a character),
 * a group or back-reference (`group`, which can match anything), or a zero-width assertion.
 */
type PatternToken = { source: string; kind: 'char' | 'group' | 'assertion'; optional: boolean };

function tokenizePattern(source: string): PatternToken[] {
  const tokens: PatternToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    let end: number;
    let kind: PatternToken['kind'] = 'char';
    if (char === '\\') {
      const body = ESCAPE_BODY.exec(source.slice(index + 1))?.[0] ?? '';
      end = index + 1 + body.length;
      if (body === 'b' || body === 'B') kind = 'assertion';
      else if (/^(?:\d|k<)/.test(body)) kind = 'group';
    } else if (char === '[' || char === '(') {
      end = closingIndex(source, index);
      if (char === '(') kind = LOOKAROUND.test(source.slice(index)) ? 'assertion' : 'group';
    } else {
      end = index + String.fromCodePoint(source.codePointAt(index) ?? 0).length;
      if (char === '^' || char === '$') kind = 'assertion';
    }
    const quantifier = QUANTIFIER.exec(source.slice(end))?.[0] ?? '';
    tokens.push({
      source: source.slice(index, end),
      kind,
      optional: /^(?:[*?]|\{0[,}])/.test(quantifier),
    });
    index = end + quantifier.length;
  }
  return tokens;
}

/** The alternatives of a group's body, split at its own `|`, not at those of nested groups. */
function splitAlternatives(body: string): string[] {
  const alternatives: string[] = [];
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === '\\') index += 1;
    else if (char === '[' || char === '(') index = closingIndex(body, index) - 1;
    else if (char === '|') {
      alternatives.push(body.slice(start, index));
      start = index + 1;
    }
  }
  alternatives.push(body.slice(start));
  return alternatives;
}

/** The items an alternative can start with, and whether it can match nothing at all. */
function leadingTokens(alternative: string): { tokens: PatternToken[]; canBeEmpty: boolean } {
  const tokens: PatternToken[] = [];
  for (const token of tokenizePattern(alternative)) {
    if (token.kind === 'assertion') continue;
    tokens.push(token);
    if (!token.optional) return { tokens, canBeEmpty: false };
  }
  return { tokens, canBeEmpty: true };
}

/**
 * Characters to try two single-character matchers on, besides those written in the pattern:
 * enough of each kind (letters, digits, space, punctuation, other scripts) that `\w` and `\d`
 * share one and `\d` and `x` share none.
 */
const OVERLAP_PROBES = [
  ...' !"#$%&\'()*+,-./0123456789:;<=>?@',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~',
  ...'\t\n éßйΩ中あア한',
];

/** Whether two leading items could match the same character (always so for groups). */
function tokensOverlap(left: PatternToken, right: PatternToken): boolean {
  if (left.kind === 'group' || right.kind === 'group') return true;
  let leftRegex: RegExp;
  let rightRegex: RegExp;
  try {
    leftRegex = new RegExp(`^(?:${left.source})$`, 'iu');
    rightRegex = new RegExp(`^(?:${right.source})$`, 'iu');
  } catch {
    return true;
  }
  const probes = new Set([...OVERLAP_PROBES, ...left.source, ...right.source]);
  return [...probes].some((char) => leftRegex.test(char) && rightRegex.test(char));
}

/**
 * Whether a group's alternatives can match the same text, as `a|aa` (both start with `a`) and
 * `a|a?` (the second can match nothing) do. Repeated, such a group splits a long title in
 * exponentially many ways. Judged by each alternative's first character, so a pair that differs
 * later (`ab|ac`) is flagged too: a false alarm only searches the pattern as plain text.
 */
function hasOverlappingAlternatives(body: string): boolean {
  const alternatives = splitAlternatives(body.replace(GROUP_PREFIX, '')).map(leadingTokens);
  if (alternatives.length < 2) return false;
  if (alternatives.some((alternative) => alternative.canBeEmpty)) return true;
  return alternatives.some((left, leftIndex) =>
    alternatives
      .slice(leftIndex + 1)
      .some((right) =>
        left.tokens.some((leftToken) =>
          right.tokens.some((rightToken) => tokensOverlap(leftToken, rightToken)),
        ),
      ),
  );
}

/**
 * Whether a user pattern could take minutes on a title that almost matches, so it is searched as
 * plain text instead: it is longer than `max_pattern_length` in
 * `config/bookmarks/search-regex.toml`, or it repeats without bound a group that itself repeats
 * without bound (`(a+)+`, `(\w*)*`) or whose alternatives can match the same text (`(a|aa)+`,
 * `(a|a?)+`). The engine then tries every way to split the title, which can freeze the page.
 */
export function isSlowRegex(source: string): boolean {
  if (source.length > REGEX_SEARCH.maxPatternLength) return true;
  const groups: { start: number; repeatsInside: boolean }[] = [];
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }
    if (char === '[') inClass = true;
    else if (char === '(') groups.push({ start: index, repeatsInside: false });
    else if (char === ')') {
      const group = groups.pop();
      const repeatsInside = group?.repeatsInside ?? false;
      if (group && unboundedQuantifierAt(source, index + 1)) {
        if (repeatsInside) return true;
        if (hasOverlappingAlternatives(source.slice(group.start + 1, index))) return true;
      }
      const parent = groups.at(-1);
      if (repeatsInside && parent) parent.repeatsInside = true;
    } else {
      const parent = groups.at(-1);
      if (parent && unboundedQuantifierAt(source, index)) parent.repeatsInside = true;
    }
  }
  return false;
}

function buildSearchRegex(query: string, options: SearchOptions): RegExp {
  if (options.useRegex && isSlowRegex(query)) throw new SyntaxError('slow pattern');
  const source = options.useRegex ? query : query.replace(REGEX_SPECIAL_CHARACTERS, '\\$&');
  // Always Unicode mode, so Whole Word never changes which patterns compile or what `\p{L}` means.
  const flags = options.matchCase ? 'gu' : 'giu';
  return options.wholeWord
    ? new RegExp(`(?<!${WORD_CHARACTER})(?:${source})(?!${WORD_CHARACTER})`, flags)
    : new RegExp(source, flags);
}

/**
 * Why a regex-mode query is searched as plain text instead: it does not compile (`invalid`), or
 * it could take too long (`slow`, see `isSlowRegex`). Undefined when it is used as typed.
 */
export function getSearchRegexProblem(
  query: string,
  options: SearchOptions,
): 'invalid' | 'slow' | undefined {
  if (!options.useRegex || !query) return undefined;
  if (isSlowRegex(query)) return 'slow';
  try {
    buildSearchRegex(query, options);
    return undefined;
  } catch {
    return 'invalid';
  }
}

/** Whether a regex-mode query is used as typed; otherwise it falls back to a plain text search. */
export function isSearchQueryValid(query: string, options: SearchOptions): boolean {
  return getSearchRegexProblem(query, options) === undefined;
}

function substringSearch(query: string, matchCase: boolean): CompiledSearch {
  const needle = matchCase ? query : query.toLowerCase();
  const normalize = (text: string) => (matchCase ? text : text.toLowerCase());
  return {
    test: (text) => normalize(text).includes(needle),
    ranges: (text) => {
      const ranges: SearchMatchRange[] = [];
      if (!needle) return ranges;
      const haystack = normalize(text);
      for (let index = haystack.indexOf(needle); index !== -1; ) {
        ranges.push([index, index + needle.length]);
        index = haystack.indexOf(needle, index + needle.length);
      }
      return ranges;
    },
  };
}

/** Compile a query once; an invalid user regex falls back to a plain substring search. */
function compileSearch(query: string, options: SearchOptions): CompiledSearch {
  let regex: RegExp;
  try {
    regex = buildSearchRegex(query, options);
  } catch {
    return substringSearch(query, options.matchCase);
  }

  return {
    test: (text) => {
      regex.lastIndex = 0;
      return regex.test(text);
    },
    ranges: (text) => {
      const ranges: SearchMatchRange[] = [];
      // matchAll starts from the shared regex's lastIndex, which test() advances.
      regex.lastIndex = 0;
      for (const match of text.matchAll(regex)) {
        // Zero-length matches (e.g. `^` or `a*`) have nothing to highlight.
        if (match[0].length > 0) ranges.push([match.index, match.index + match[0].length]);
      }
      return ranges;
    },
  };
}

/** Build a title matcher; an invalid user regex falls back to a plain substring match. */
export function createSearchMatcher(
  query: string,
  options: SearchOptions,
): (text: string) => boolean {
  return compileSearch(query, options).test;
}

/**
 * Locate matches as offsets so the UI can wrap them in elements. Titles are untrusted input and
 * are never converted to HTML.
 */
export function getSearchMatchRanges(
  text: string,
  query: string,
  options: SearchOptions,
): SearchMatchRange[] {
  return query ? compileSearch(query, options).ranges(text) : [];
}

/**
 * Whether the search options ask for the title-only search they were made for. Match case, whole
 * word, and regular expressions search titles as typed; otherwise the query is read in the search
 * query language (`search-query.ts`) and matched against every field (`search-documents.ts`).
 */
export function usesTitleSearch(options: SearchOptions): boolean {
  return options.matchCase || options.wholeWord || options.useRegex;
}

type NodeMatch = Pick<
  BookmarkTreeNode,
  'isSearchMatch' | 'searchMatchRanges' | 'searchMatchReasons'
>;

/**
 * Keep matching nodes and their ancestors. A matching folder keeps all of its children so its
 * contents stay browsable; matches deeper inside it are still highlighted and flagged.
 *
 * The invisible browser root and the permanent folders beneath it (Bookmarks bar, Other
 * bookmarks, ...) are containers only: their own titles never match, otherwise a query such as
 * `bar`, `other`, or the regex `^$` would return the entire tree. `matchOf` is asked about every
 * other node, with whether a folder above it already matched.
 */
export function filterTree(
  nodes: readonly BookmarkTreeNode[],
  matchOf: (node: BookmarkTreeNode, insideMatch: boolean) => NodeMatch | undefined,
): BookmarkTreeNode[] {
  const filterNodes = (
    items: readonly BookmarkTreeNode[],
    parentIsRoot: boolean,
    insideMatch: boolean,
  ): BookmarkTreeNode[] => {
    const filtered: BookmarkTreeNode[] = [];

    for (const node of items) {
      const isRoot = isBookmarkTreeRoot(node);
      const match = isRoot || parentIsRoot ? undefined : matchOf(node, insideMatch);

      if (!node.children) {
        if (match) filtered.push({ ...node, ...match });
        continue;
      }

      const matchingChildren = filterNodes(node.children, isRoot, insideMatch || Boolean(match));
      if (!match && matchingChildren.length === 0) continue;

      const matchingById = new Map(matchingChildren.map((child) => [child.id, child]));
      filtered.push({
        ...node,
        ...match,
        children: match
          ? node.children.map((child) => matchingById.get(child.id) ?? child)
          : matchingChildren,
      });
    }

    return filtered;
  };

  return filterNodes(nodes, false, false);
}

/**
 * The tree filtered by titles, searched as typed with Match case, Whole word, or regular
 * expressions (`usesTitleSearch`). Without them, `bookmark-query-filter.lazy.ts` reads the query
 * in the search query language.
 */
export function filterBookmarkTree(
  nodes: readonly BookmarkTreeNode[],
  query: string,
  options: SearchOptions,
): BookmarkTreeNode[] {
  if (!query) return [...nodes];

  const search = compileSearch(query, options);
  return filterTree(nodes, (node) =>
    search.test(node.title)
      ? { isSearchMatch: true, searchMatchRanges: search.ranges(node.title) }
      : undefined,
  );
}

function containsSearchMatch(node: BookmarkTreeNode): boolean {
  return node.isSearchMatch === true || (node.children ?? []).some(containsSearchMatch);
}

/** Folders to open for a filtered tree: ancestors of every match plus matching folders. */
export function getSearchExpandedFolderIds(nodes: readonly BookmarkTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children && containsSearchMatch(node)
      ? [node.id, ...getSearchExpandedFolderIds(node.children)]
      : [],
  );
}

export function countSearchMatches(nodes: readonly BookmarkTreeNode[]): number {
  return nodes.reduce(
    (count, node) => count + (node.isSearchMatch ? 1 : 0) + countSearchMatches(node.children ?? []),
    0,
  );
}

/**
 * Keep the first `limit` matches in display order. Non-matching nodes survive only as context:
 * ancestors of kept matches, or contents of a kept matching folder.
 */
export function limitSearchResults(
  nodes: readonly BookmarkTreeNode[],
  limit: number,
): BookmarkTreeNode[] {
  if (countSearchMatches(nodes) <= limit) return [...nodes];

  let remaining = limit;
  const limitNodes = (
    items: readonly BookmarkTreeNode[],
    insideMatch: boolean,
  ): BookmarkTreeNode[] => {
    const kept: BookmarkTreeNode[] = [];

    for (const node of items) {
      if (node.isSearchMatch) {
        if (remaining === 0) continue;
        remaining -= 1;
        kept.push(node.children ? { ...node, children: limitNodes(node.children, true) } : node);
      } else if (node.children) {
        const children = limitNodes(node.children, insideMatch);
        if (insideMatch || children.length > 0) kept.push({ ...node, children });
      } else if (insideMatch) {
        kept.push(node);
      }
    }

    return kept;
  };

  return limitNodes(nodes, false);
}
