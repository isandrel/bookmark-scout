/**
 * The folder the bookmark manager opens on when its address names none (Start Folder in Options >
 * Behavior > Manager view): the bookmarks bar, as the browser's own manager does, the folder it
 * showed last on this device, or a chosen folder. A last or chosen folder that is gone, or not a
 * folder, opens the bookmarks bar instead.
 */
import type { BookmarkTreeNode } from '@/types';

/** The start folder's id for `tree`, given the setting and the folder shown last. */
export function pickManagerStartFolder(
  tree: readonly BookmarkTreeNode[],
  settings: Pick<Settings, 'managerStartFolder' | 'managerStartFolderId'>,
  lastFolderId: string,
): string | null {
  const wanted =
    settings.managerStartFolder === 'last'
      ? lastFolderId
      : settings.managerStartFolder === 'chosen'
        ? settings.managerStartFolderId
        : '';
  const folder = wanted ? findNode(tree, wanted) : undefined;
  if (folder && !folder.url) return folder.id;
  return findBookmarksBarFolder(tree)?.id ?? null;
}

/**
 * Reads the setting and the folder shown last, while the tree loads, and returns the picker for
 * the start folder. A last folder that cannot be read counts as none.
 */
export async function loadManagerStartFolderPicker(): Promise<
  (tree: readonly BookmarkTreeNode[]) => string | null
> {
  const [settings, lastFolderId] = await Promise.all([
    getSettings(),
    managerLastFolderValue.get().catch(() => ''),
  ]);
  return (tree) => pickManagerStartFolder(tree, settings, lastFolderId);
}
