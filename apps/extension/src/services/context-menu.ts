/**
 * Context menu service for right-click quick bookmark adding.
 * Uses a provider-based architecture for extensibility.
 */

import { createBookmark } from './bookmarks';
import { getRecentFolders, addRecentFolder } from '@/lib/recent-folders-storage';
import { defaultSettings } from '@/lib/settings-schema';

// Type for bookmark naming setting
export type BookmarkNamingSource = 'link_text' | 'page_title' | 'link_url';

// Storage key for settings (same as used in settings hook)
const SETTINGS_STORAGE_KEY = 'bookmark-scout-settings';

/**
 * Get the bookmark naming preference from settings.
 */
async function getBookmarkNamingSetting(): Promise<BookmarkNamingSource> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_STORAGE_KEY, (result) => {
      const settings = result[SETTINGS_STORAGE_KEY];
      if (settings?.contextMenuBookmarkNaming) {
        resolve(settings.contextMenuBookmarkNaming);
      } else {
        resolve(defaultSettings.contextMenuBookmarkNaming || 'link_text');
      }
    });
  });
}

/**
 * Determine the bookmark title based on the naming preference.
 */
function getBookmarkTitle(
  namingSource: BookmarkNamingSource,
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): string {
  switch (namingSource) {
    case 'link_text':
      // Use selection text (the link's anchor text) or fall back to page title
      return info.selectionText || tab?.title || 'Untitled';
    case 'page_title':
      return tab?.title || 'Untitled';
    case 'link_url':
      return info.linkUrl || 'Untitled';
    default:
      return info.selectionText || tab?.title || 'Untitled';
  }
}

// =============================================================================
// Types
// =============================================================================

export interface PageInfo {
  url: string;
  title: string;
  linkUrl?: string;
  linkText?: string;
}

export interface ContextMenuItem {
  id: string;
  title: string;
  folderId: string;
  folderTitle: string;
  type: 'recent' | 'ai' | 'static';
  icon?: string;
}

export interface ContextMenuProvider {
  id: string;
  priority: number; // Lower = higher priority (appears first)
  getItems(pageInfo: PageInfo): Promise<ContextMenuItem[]>;
}

// =============================================================================
// Menu Item ID Parsing
// =============================================================================

const MENU_PREFIX = 'bookmark-scout';
const SEPARATOR = '::';

export function createMenuItemId(type: string, folderId: string): string {
  return `${MENU_PREFIX}${SEPARATOR}${type}${SEPARATOR}${folderId}`;
}

export function parseMenuItemId(menuItemId: string): { type: string; folderId: string } | null {
  if (typeof menuItemId !== 'string' || !menuItemId.startsWith(MENU_PREFIX)) {
    return null;
  }
  const parts = menuItemId.split(SEPARATOR);
  if (parts.length < 3) return null;
  return {
    type: parts[1],
    folderId: parts.slice(2).join(SEPARATOR), // Handle folder IDs with separators
  };
}

// =============================================================================
// Context Menu Manager
// =============================================================================

class ContextMenuManager {
  private providers: ContextMenuProvider[] = [];
  private isInitialized = false;

  /**
   * Register a menu provider.
   */
  registerProvider(provider: ContextMenuProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Unregister a menu provider by ID.
   */
  unregisterProvider(id: string): void {
    this.providers = this.providers.filter((p) => p.id !== id);
  }

  /**
   * Initialize the context menu (call on extension install/startup).
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Remove all existing menu items first
    await this.clearMenu();

    // Create root menu item
    chrome.contextMenus.create({
      id: `${MENU_PREFIX}${SEPARATOR}root`,
      title: 'Save bookmark to...',
      contexts: ['link'],
    });

    this.isInitialized = true;

    // Build initial menu
    await this.rebuildMenu();
  }

  /**
   * Clear all menu items.
   */
  private async clearMenu(): Promise<void> {
    return new Promise((resolve) => {
      chrome.contextMenus.removeAll(() => {
        resolve();
      });
    });
  }

  /**
   * Rebuild the menu with current provider data.
   * Creates separate submenus for each category (Recent, AI, etc.)
   */
  async rebuildMenu(): Promise<void> {
    // Remove old dynamic items
    await this.clearMenu();

    // Recreate root
    chrome.contextMenus.create({
      id: `${MENU_PREFIX}${SEPARATOR}root`,
      title: 'Save bookmark to...',
      contexts: ['link'],
    });

    // Group items by type
    const itemsByType: Record<string, ContextMenuItem[]> = {};

    for (const provider of this.providers) {
      try {
        const pageInfo: PageInfo = { url: '', title: '', linkUrl: '', linkText: '' };
        const items = await provider.getItems(pageInfo);
        for (const item of items) {
          if (!itemsByType[item.type]) {
            itemsByType[item.type] = [];
          }
          itemsByType[item.type].push(item);
        }
      } catch (error) {
        console.error(`[ContextMenu] Provider ${provider.id} failed:`, error);
      }
    }

    // Category labels and icons
    const categoryLabels: Record<string, { label: string; icon: string }> = {
      recent: { label: '📁 Recent Folders', icon: '📁' },
      ai: { label: '✨ AI Suggestions', icon: '✨' },
      static: { label: '📚 Default Folders', icon: '📚' },
    };

    // Track if we have any items
    let hasItems = false;

    // Create submenus for each category with items
    for (const [type, items] of Object.entries(itemsByType)) {
      if (items.length === 0) continue;
      hasItems = true;

      const categoryInfo = categoryLabels[type] || { label: type, icon: '' };

      // For categories with only one item (like Bookmarks Bar), add directly
      if (type === 'static' && items.length === 1) {
        chrome.contextMenus.create({
          id: createMenuItemId(type, items[0].folderId),
          title: `${categoryInfo.icon} ${items[0].folderTitle}`,
          parentId: `${MENU_PREFIX}${SEPARATOR}root`,
          contexts: ['link'],
        });
        continue;
      }

      // Create category submenu
      const categoryId = `${MENU_PREFIX}${SEPARATOR}category${SEPARATOR}${type}`;
      chrome.contextMenus.create({
        id: categoryId,
        title: categoryInfo.label,
        parentId: `${MENU_PREFIX}${SEPARATOR}root`,
        contexts: ['link'],
      });

      // Add items to the category submenu
      for (const item of items) {
        chrome.contextMenus.create({
          id: createMenuItemId(item.type, item.folderId),
          title: item.folderTitle,
          parentId: categoryId,
          contexts: ['link'],
        });
      }
    }

    // If no items, show a disabled placeholder
    if (!hasItems) {
      chrome.contextMenus.create({
        id: `${MENU_PREFIX}${SEPARATOR}empty`,
        title: 'No folders available',
        parentId: `${MENU_PREFIX}${SEPARATOR}root`,
        contexts: ['link'],
        enabled: false,
      });
    }
  }

  /**
   * Handle a context menu click.
   */
  async handleClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab,
  ): Promise<{
    success: boolean;
    folderTitle?: string;
    bookmarkTitle?: string;
    error?: string;
  }> {
    const parsed = parseMenuItemId(info.menuItemId as string);
    if (!parsed) {
      return { success: false, error: 'Invalid menu item' };
    }

    const { folderId } = parsed;
    const linkUrl = info.linkUrl;

    if (!linkUrl) {
      return { success: false, error: 'No link URL' };
    }

    try {
      // Get naming preference from settings
      const namingSource = await getBookmarkNamingSetting();
      const bookmarkTitle = getBookmarkTitle(namingSource, info, tab);

      // Create the bookmark
      const bookmark = await createBookmark({
        parentId: folderId,
        title: bookmarkTitle,
        url: linkUrl,
      });

      // Get folder title for feedback
      const folder = await new Promise<chrome.bookmarks.BookmarkTreeNode>((resolve, reject) => {
        chrome.bookmarks.get(folderId, (results) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(results[0]);
          }
        });
      });

      // Update recent folders
      await addRecentFolder(folderId, folder.title);

      // Trigger menu rebuild to update recent folders order
      await this.rebuildMenu();

      return {
        success: true,
        folderTitle: folder.title,
        bookmarkTitle: bookmark.title,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Singleton instance
export const contextMenuManager = new ContextMenuManager();

// =============================================================================
// Built-in Providers
// =============================================================================

/**
 * Provider for recently used folders.
 */
export const recentFoldersProvider: ContextMenuProvider = {
  id: 'recent-folders',
  priority: 10,

  async getItems(): Promise<ContextMenuItem[]> {
    try {
      const recentFolders = await getRecentFolders();
      return recentFolders.map((folder) => ({
        id: `recent-${folder.id}`,
        title: folder.title,
        folderId: folder.id,
        folderTitle: folder.title,
        type: 'recent' as const,
        icon: '📁',
      }));
    } catch (error) {
      console.error('[ContextMenu] Failed to get recent folders:', error);
      return [];
    }
  },
};

/**
 * Provider for static "Bookmarks Bar" option.
 */
export const bookmarksBarProvider: ContextMenuProvider = {
  id: 'bookmarks-bar',
  priority: 100, // Lower priority = appears last

  async getItems(): Promise<ContextMenuItem[]> {
    return [
      {
        id: 'static-bookmarks-bar',
        title: 'Bookmarks Bar',
        folderId: '1', // Chrome's Bookmarks Bar folder ID
        folderTitle: 'Bookmarks Bar',
        type: 'static' as const,
        icon: '📚',
      },
    ];
  },
};

// =============================================================================
// Initialization Helper
// =============================================================================

/**
 * Initialize context menu with default providers.
 */
export async function initializeContextMenu(): Promise<void> {
  // Register default providers
  contextMenuManager.registerProvider(recentFoldersProvider);
  contextMenuManager.registerProvider(bookmarksBarProvider);

  // Initialize the menu
  await contextMenuManager.initialize();
}
