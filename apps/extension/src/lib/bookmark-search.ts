import type { BookmarkTreeNode } from '@/types';

export type SearchOptions = {
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
};

const REGEX_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

function buildSearchPattern(query: string, options: SearchOptions): string {
  const source = options.useRegex ? query : query.replace(REGEX_SPECIAL_CHARACTERS, '\\$&');
  return options.wholeWord ? `\\b(${source})\\b` : `(${source})`;
}

/** Build a title matcher; an invalid user regex falls back to a plain substring match. */
export function createSearchMatcher(
  query: string,
  options: SearchOptions,
): (text: string) => boolean {
  try {
    const regex = new RegExp(buildSearchPattern(query, options), options.matchCase ? '' : 'i');
    return (text) => regex.test(text);
  } catch {
    return (text) =>
      options.matchCase ? text.includes(query) : text.toLowerCase().includes(query.toLowerCase());
  }
}

/** Wrap matches in `<b>` for the tree's highlighted titles. */
export function highlightSearchMatch(text: string, query: string, options: SearchOptions): string {
  try {
    const regex = new RegExp(buildSearchPattern(query, options), options.matchCase ? 'g' : 'gi');
    return text.replace(regex, '<b>$1</b>');
  } catch {
    return text;
  }
}

/**
 * Keep matching nodes and their ancestors. A matching folder keeps all of its children so its
 * contents stay browsable; matches deeper inside it are still highlighted and flagged.
 */
export function filterBookmarkTree(
  nodes: readonly BookmarkTreeNode[],
  query: string,
  options: SearchOptions,
): BookmarkTreeNode[] {
  if (!query) return [...nodes];

  const matches = createSearchMatcher(query, options);
  const filterNodes = (items: readonly BookmarkTreeNode[]): BookmarkTreeNode[] => {
    const filtered: BookmarkTreeNode[] = [];

    for (const node of items) {
      const isMatch = matches(node.title);
      const title = isMatch ? highlightSearchMatch(node.title, query, options) : node.title;

      if (!node.children) {
        if (isMatch) filtered.push({ ...node, title, isSearchMatch: true });
        continue;
      }

      const matchingChildren = filterNodes(node.children);
      if (!isMatch && matchingChildren.length === 0) continue;

      const matchingById = new Map(matchingChildren.map((child) => [child.id, child]));
      filtered.push({
        ...node,
        title,
        isSearchMatch: isMatch || undefined,
        children: isMatch
          ? node.children.map((child) => matchingById.get(child.id) ?? child)
          : matchingChildren,
      });
    }

    return filtered;
  };

  return filterNodes(nodes);
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
