/**
 * Background script entrypoint for WXT.
 * Handles context menu initialization and event listeners.
 */

function collectBookmarkIds(node: chrome.bookmarks.BookmarkTreeNode): string[] {
  return [node.id, ...(node.children?.flatMap(collectBookmarkIds) ?? [])];
}

// defineBackground is auto-imported by WXT
export default defineBackground(() => {
  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const result = await contextMenuManager.handleClick(info, tab);

    if (result.success) {
      console.log('[Background] Bookmark saved from context menu');
      // Note: Toast notifications would need to be shown in content script or popup
      // For now, we log success
    } else if (result.error !== 'Context menu is disabled') {
      console.error('[Background] Failed to save bookmark:', result.error);
    }
  });

  chrome.bookmarks.onRemoved.addListener((_id, removeInfo) => {
    const removedIds = collectBookmarkIds(removeInfo.node);
    void removeStoredBookmarkMetadata(removedIds).catch((error) => {
      console.error('[Background] Failed to remove bookmark metadata:', error);
    });
    // Recent-folder storage changes rebuild the context menu.
    void removeRecentFolders(removedIds).catch((error) => {
      console.error('[Background] Failed to prune recent folders:', error);
    });
  });

  chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
    void updateRecentFolderTitle(id, changeInfo.title).catch((error) => {
      console.error('[Background] Failed to rename recent folder:', error);
    });
  });

  // A background worker may be started by any event, not only install or startup.
  void initializeContextMenu().catch((error) => {
    console.error('[Background] Failed to initialize context menu:', error);
  });
});
