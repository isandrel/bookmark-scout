/**
 * Where quick save puts a page without AI: the folder the Quick save strategy picks (best match,
 * last used, or a fixed folder), the fallback when it picks none, and the other folders the
 * notification offers. Pure functions over the bookmark tree, so every strategy and fallback is
 * unit-tested without a browser.
 */

import type { BookmarkTreeNode } from '@/types';

/** A folder a bookmark can be saved in, with the titles from the outermost folder down to it. */
export type QuickSaveFolder = { id: string; path: string[] };

/** Why the strategy's own choice was not used; the notification says so. */
export type QuickSaveFallbackReason = 'noMatch' | 'fixedMissing';

export type QuickSaveTarget = {
  folder: QuickSaveFolder;
  /** Set when the folder is a fallback: the last used folder, else the bookmarks bar. */
  fallback?: QuickSaveFallbackReason;
  /** Other folders to offer, best first, without the target. */
  alternatives: QuickSaveFolder[];
};

export type QuickSaveTargetInput = {
  strategy: QuickSaveFolderStrategy;
  fixedFolderId: string;
  /** Recently used folder ids, most recent first. */
  recentFolderIds: readonly string[];
  /**
   * Folders ranked for the page, best first. Any of them can be an alternative, whatever the
   * strategy; only one scoring `minScore` or more is chosen, and only by best match.
   */
  ranked: readonly { id: string; score: number }[];
  minScore: number;
  /** How many alternatives to offer. */
  alternatives: number;
  /**
   * How many of them may be recent folders, filling in when fewer ranked folders match the page.
   * Recent folders say nothing about the page, so they come last and are few.
   */
  recentAlternatives: number;
  /** Folders the target and alternatives may not be, such as the one already holding the page. */
  excludeIds?: ReadonlySet<string>;
};

/** Every folder a bookmark can be saved in, by id: not the invisible root or managed folders. */
export function indexWritableFolders(
  tree: readonly BookmarkTreeNode[],
): Map<string, QuickSaveFolder> {
  const folders = new Map<string, QuickSaveFolder>();
  const visit = (nodes: readonly BookmarkTreeNode[], parents: string[]) => {
    for (const node of nodes) {
      if (node.url || !node.children) continue;
      const isRoot = isBookmarkTreeRoot(node);
      const path = isRoot ? parents : [...parents, node.title];
      if (!isRoot && !node.unmodifiable) folders.set(node.id, { id: node.id, path });
      visit(node.children, path);
    }
  };
  visit(tree, []);
  return folders;
}

/**
 * The folder for a quick save, and the alternatives. Best match takes the top-ranked folder,
 * last used the most recent folder, and fixed the chosen folder; when that gives nothing, the
 * last used folder, then the bookmarks bar. Alternatives are the next ranked folders, then at
 * most `recentAlternatives` recent folders when the matches run out.
 */
export function chooseQuickSaveTarget(
  tree: readonly BookmarkTreeNode[],
  input: QuickSaveTargetInput,
): QuickSaveTarget | null {
  const folders = indexWritableFolders(tree);
  const usable = (id: string | undefined): QuickSaveFolder | undefined => {
    const folder = id ? folders.get(id) : undefined;
    return folder && !input.excludeIds?.has(folder.id) ? folder : undefined;
  };
  const recent = input.recentFolderIds.map(usable).filter((folder) => folder !== undefined);
  const ranked = input.ranked.map(({ id }) => usable(id)).filter((folder) => folder !== undefined);
  const confident = input.ranked.find(({ id, score }) => score >= input.minScore && usable(id));

  let chosen: QuickSaveFolder | undefined;
  let fallback: QuickSaveFallbackReason | undefined;
  switch (input.strategy) {
    case 'best_match':
      chosen = usable(confident?.id);
      fallback = 'noMatch';
      break;
    case 'last_used':
      // With nothing recent this falls back to the bookmarks bar without a note: that is simply
      // where a first save goes.
      chosen = recent[0];
      break;
    case 'fixed':
      chosen = usable(input.fixedFolderId);
      fallback = 'fixedMissing';
      break;
  }
  if (chosen) {
    fallback = undefined;
  } else {
    const bar = findBookmarksBarFolder([...tree]);
    chosen =
      recent[0] ?? usable(bar?.id) ?? [...folders.values()].find((folder) => usable(folder.id));
  }
  if (!chosen) return null;

  const target = chosen;
  const alternatives: QuickSaveFolder[] = [];
  const offer = (folders: readonly QuickSaveFolder[], limit: number) => {
    let added = 0;
    for (const folder of folders) {
      if (alternatives.length >= input.alternatives || added >= limit) return;
      if (folder.id === target.id || alternatives.some((other) => other.id === folder.id)) continue;
      alternatives.push(folder);
      added += 1;
    }
  };
  offer(ranked, input.alternatives);
  offer(recent, input.recentAlternatives);
  return { folder: target, ...(fallback ? { fallback } : {}), alternatives };
}
