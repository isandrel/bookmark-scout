/**
 * Background script entrypoint for WXT.
 * Starts the context menu (and its click listener) and the bookmark listeners.
 */

// defineBackground is auto-imported by WXT
export default defineBackground(() => {
  browser.bookmarks.onRemoved.addListener((_id, removeInfo) => {
    const removedIds = subtreeIds(removeInfo.node);
    void removeStoredBookmarkMetadata(removedIds).catch((error) => {
      console.error('[Background] Failed to remove bookmark metadata:', error);
    });
    // Recent-folder storage changes rebuild the context menu.
    void removeRecentFolders(removedIds).catch((error) => {
      console.error('[Background] Failed to prune recent folders:', error);
    });
  });

  browser.bookmarks.onChanged.addListener((id, changeInfo) => {
    void updateRecentFolderTitle(id, changeInfo.title).catch((error) => {
      console.error('[Background] Failed to rename recent folder:', error);
    });
  });

  // A background worker may be started by any event, not only install or startup.
  void initializeContextMenu().catch((error) => {
    console.error('[Background] Failed to initialize context menu:', error);
  });
});
