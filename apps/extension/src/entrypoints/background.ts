/**
 * Background script entrypoint for WXT.
 * Starts the context menu (and its click listener), the quick save shortcuts, the bookmark
 * listeners, and storage housekeeping.
 */

// defineBackground is auto-imported by WXT
export default defineBackground(() => {
  // Data from older releases is not migrated: keys this release does not register are removed.
  registerStorageCleanup();
  // A first install (never an update) opens the welcome page.
  registerWelcomePage();
  void restrictLocalStorageAccess();
  // Saves settings a closing Options page hands over.
  registerSettingsSaveListener();
  registerPromptCleanup();
  // Bookmark changes made outside Bookmark Scout, for the History; before the listeners below.
  registerBookmarkObserver();
  // Smart Rules' tags for new bookmarks, while Tag New Bookmarks is on.
  registerRuleAutoTag();

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

  // Quick save shortcuts; listeners must be added synchronously so a key press can wake the worker.
  registerQuickSave();

  // Access for local AI agents, while the user has it on (Options > For developers).
  registerAgentApprovals();
  registerAgentBridge();

  // Long tools that keep running when their page closes; a command or the alarm wakes them.
  registerJobs();

  // A background worker may be started by any event, not only install or startup.
  void initializeContextMenu().catch((error) => {
    console.error('[Background] Failed to initialize context menu:', error);
  });
});
