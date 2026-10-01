import type { BookmarkTreeNode } from '@/types';

export type SearchOptions = {
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
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

function buildSearchRegex(query: string, options: SearchOptions): RegExp {
  const source = options.useRegex ? query : query.replace(REGEX_SPECIAL_CHARACTERS, '\\$&');
  // Always Unicode mode, so Whole Word never changes which patterns compile or what `\p{L}` means.
  const flags = options.matchCase ? 'gu' : 'giu';
  return options.wholeWord
    ? new RegExp(`(?<!${WORD_CHARACTER})(?:${source})(?!${WORD_CHARACTER})`, flags)
    : new RegExp(source, flags);
}

/** Whether a regex-mode query compiles; invalid patterns fall back to a plain text search. */
export function isSearchQueryValid(query: string, options: SearchOptions): boolean {
  if (!options.useRegex || !query) return true;
  try {
    buildSearchRegex(query, options);
    return true;
  } catch {
    return false;
  }
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
 * Keep matching nodes and their ancestors. A matching folder keeps all of its children so its
 * contents stay browsable; matches deeper inside it are still highlighted and flagged.
 *
 * The invisible browser root and the permanent folders beneath it (Bookmarks bar, Other
 * bookmarks, ...) are containers only: their own titles never match, otherwise a query such as
 * `bar`, `other`, or the regex `^$` would return the entire tree.
 */
export function filterBookmarkTree(
  nodes: readonly BookmarkTreeNode[],
  query: string,
  options: SearchOptions,
): BookmarkTreeNode[] {
  if (!query) return [...nodes];

  const search = compileSearch(query, options);
  const filterNodes = (
    items: readonly BookmarkTreeNode[],
    parentIsRoot: boolean,
  ): BookmarkTreeNode[] => {
    const filtered: BookmarkTreeNode[] = [];

    for (const node of items) {
      const isRoot = isBookmarkTreeRoot(node);
      const isContainer = isRoot || parentIsRoot;
      const isMatch = !isContainer && search.test(node.title);
      const matchFields = isMatch
        ? { isSearchMatch: true, searchMatchRanges: search.ranges(node.title) }
        : {};

      if (!node.children) {
        if (isMatch) filtered.push({ ...node, ...matchFields });
        continue;
      }

      const matchingChildren = filterNodes(node.children, isRoot);
      if (!isMatch && matchingChildren.length === 0) continue;

      const matchingById = new Map(matchingChildren.map((child) => [child.id, child]));
      filtered.push({
        ...node,
        ...matchFields,
        children: isMatch
          ? node.children.map((child) => matchingById.get(child.id) ?? child)
          : matchingChildren,
      });
    }

    return filtered;
  };

  return filterNodes(nodes, false);
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

export function getAllFolderIds(nodes: readonly BookmarkTreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.children ? [node.id, ...getAllFolderIds(node.children)] : [],
  );
}

export function countSearchMatches(nodes: readonly BookmarkTreeNode[]): number {
  return nodes.reduce(
    (count, node) =>
      count + (node.isSearchMatch ? 1 : 0) + countSearchMatches(node.children ?? []),
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
