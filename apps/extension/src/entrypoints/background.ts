/**
 * Background script entrypoint for WXT.
 * Handles context menu initialization and event listeners.
 */

import { initializeContextMenu, contextMenuManager } from '@/services/context-menu';

// defineBackground is auto-imported by WXT
export default defineBackground(() => {
  // Initialize context menu on extension install
  chrome.runtime.onInstalled.addListener(async () => {
    console.log('[Background] Extension installed, initializing context menu...');
    await initializeContextMenu();
  });

  // Also initialize on startup (for browser restarts)
  chrome.runtime.onStartup.addListener(async () => {
    console.log('[Background] Browser started, initializing context menu...');
    await initializeContextMenu();
  });

  // Handle context menu clicks
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('[Background] Context menu clicked:', info.menuItemId);

    const result = await contextMenuManager.handleClick(info, tab);

    if (result.success) {
      console.log(
        `[Background] Bookmark saved: "${result.bookmarkTitle}" to "${result.folderTitle}"`,
      );
      // Note: Toast notifications would need to be shown in content script or popup
      // For now, we log success
    } else {
      console.error('[Background] Failed to save bookmark:', result.error);
    }
  });

  // Rebuild menu when storage changes (e.g., recent folders updated elsewhere)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes['bookmark-scout-recent-folders']) {
      console.log('[Background] Recent folders changed, rebuilding menu...');
      contextMenuManager.rebuildMenu();
    }
  });

  console.log('[Background] Background script loaded');
});
