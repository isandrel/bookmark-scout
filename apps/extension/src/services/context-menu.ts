/**
 * Context menu service for right-click quick bookmark adding.
 * Uses a provider-based architecture for extensibility.
 */

// Type for bookmark naming setting
export type BookmarkNamingSource = 'link_text' | 'page_title' | 'link_url';

// Storage key for settings (same as used in settings hook)
const SETTINGS_STORAGE_KEY = 'bookmark-scout-settings';
const RECENT_FOLDERS_STORAGE_KEY = 'bookmark-scout-recent-folders';

type ContextMenuSettings = {
  enabled: boolean;
  naming: BookmarkNamingSource;
  recentFoldersEnabled: boolean;
  recentFoldersMax: number;
  language: Settings['language'];
};

function toContextMenuSettings(stored: unknown): ContextMenuSettings {
  const settings = sanitizeSettings(stored);
  return {
    enabled: settings.contextMenuEnabled,
    naming: settings.contextMenuBookmarkNaming,
    recentFoldersEnabled: settings.recentFoldersEnabled,
    recentFoldersMax: settings.recentFoldersMax,
    language: settings.language,
  };
}

/** Settings that change what the menu shows, so a change to any of them rebuilds it. */
const MENU_SETTING_KEYS = [
  'enabled',
  'recentFoldersEnabled',
  'recentFoldersMax',
  'language',
] as const satisfies readonly (keyof ContextMenuSettings)[];

function menuSettingsChanged(oldValue: unknown, newValue: unknown): boolean {
  const before = toContextMenuSettings(oldValue);
  const after = toContextMenuSettings(newValue);
  return MENU_SETTING_KEYS.some((key) => before[key] !== after[key]);
}

/**
 * Read the context-menu preferences from the same sync area used by Options.
 */
async function getContextMenuSettings(): Promise<ContextMenuSettings> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(SETTINGS_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const settings = toContextMenuSettings(result[SETTINGS_STORAGE_KEY]);
      setLanguage(settings.language);
      resolve(settings);
    });
  });
}

/**
 * Determine the bookmark title based on the naming preference.
 * "Link text": Firefox reports the anchor text as `linkText`; Chrome does not expose it, so the
 * selected text is used when the link was selected, then the page title.
 */
export function getBookmarkTitle(
  namingSource: BookmarkNamingSource,
  info: chrome.contextMenus.OnClickData & { linkText?: string },
  tab?: chrome.tabs.Tab,
): string {
  const untitled = t('contextMenu_untitled');
  switch (namingSource) {
    case 'page_title':
      return tab?.title || untitled;
    case 'link_url':
      return info.linkUrl || untitled;
    default:
      return info.linkText?.trim() || info.selectionText?.trim() || tab?.title || untitled;
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
  private rebuildQueue: Promise<void> = Promise.resolve();

  /**
   * Register a menu provider.
   */
  registerProvider(provider: ContextMenuProvider): void {
    this.providers = this.providers.filter((existing) => existing.id !== provider.id);
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
    this.isInitialized = true;
    try {
      await this.rebuildMenu();
    } catch (error) {
      this.isInitialized = false;
      throw error;
    }
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
    const next = this.rebuildQueue.catch(() => undefined).then(() => this.buildMenu());
    this.rebuildQueue = next;
    return next;
  }

  private async buildMenu(): Promise<void> {
    await this.clearMenu();

    // A failed settings read must not recreate the menu or permit a save.
    const settings = await getContextMenuSettings();
    if (!settings.enabled) return;

    // Recreate root
    chrome.contextMenus.create({
      id: `${MENU_PREFIX}${SEPARATOR}root`,
      title: t('contextMenu_saveToFolder'),
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

    // Settings can change while a provider is loading. The queued storage-change
    // rebuild will also run, but avoid showing a menu that has already been disabled.
    if (!(await getContextMenuSettings()).enabled) {
      await this.clearMenu();
      return;
    }

    // Category labels and icons
    const categoryLabels: Record<string, { label: string; icon: string }> = {
      recent: { label: `📁 ${t('contextMenu_recentFolders')}`, icon: '📁' },
      ai: { label: `✨ ${t('contextMenu_aiSuggestions')}`, icon: '✨' },
      static: { label: `📚 ${t('contextMenu_defaultFolders')}`, icon: '📚' },
    };

    // Track if we have any items
    let hasItems = false;
    // Menu ids must be unique; a repeated folder would otherwise fail with "duplicate id".
    const createdIds = new Set<string>();

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
        const id = createMenuItemId(item.type, item.folderId);
        if (createdIds.has(id)) continue;
        createdIds.add(id);
        chrome.contextMenus.create({
          id,
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
        title: t('contextMenu_noFolders'),
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
      const settings = await getContextMenuSettings();
      if (!settings.enabled) {
        return { success: false, error: 'Context menu is disabled' };
      }
      const bookmarkTitle = getBookmarkTitle(settings.naming, info, tab);

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

let storageListenerRegistered = false;

function handleStorageChange(
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string,
): void {
  const settingsChange = areaName === 'sync' ? changes[SETTINGS_STORAGE_KEY] : undefined;
  const settingsChanged =
    settingsChange && menuSettingsChanged(settingsChange.oldValue, settingsChange.newValue);
  if (settingsChanged || (areaName === 'local' && changes[RECENT_FOLDERS_STORAGE_KEY])) {
    void contextMenuManager.rebuildMenu().catch((error) => {
      console.error('[ContextMenu] Failed to rebuild menu:', error);
    });
  }
}

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
      const settings = await getContextMenuSettings();
      if (!settings.recentFoldersEnabled) return [];
      const recentFolders = await getRecentFolders(settings.recentFoldersMax);
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
    const title = t('contextMenu_bookmarksBar');
    return [
      {
        id: 'static-bookmarks-bar',
        title,
        folderId: '1', // Chrome's Bookmarks Bar folder ID
        folderTitle: title,
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

  if (!storageListenerRegistered) {
    chrome.storage.onChanged.addListener(handleStorageChange);
    storageListenerRegistered = true;
  }

  // Initialize the menu
  await contextMenuManager.initialize();
}
