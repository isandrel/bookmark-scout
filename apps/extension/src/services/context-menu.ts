/**
 * The browser's right-click menu: **Save bookmark to...** with the entries the user chose (Menu
 * Entries), in their order, where the user chose (Show Menu On). The contexts and entries are
 * tables in config/ui/context-menu.toml (`lib/context-menu-config.ts`); each entry's folders come
 * from its provider here, registered under the entry's id.
 *
 * The menu exists only while the Context Menu setting is on and the `contextMenu` permission is
 * granted (optional in Chrome and Edge, where `browser.contextMenus` is undefined until then).
 * A grant or revoke rebuilds it, and the click listener is added once the API appears. Showing it
 * on pages or selections needs nothing more: the click brings the page's address.
 */

// Type for bookmark naming setting
export type BookmarkNamingSource = 'link_text' | 'page_title' | 'link_url';

type ContextMenuSettings = {
  enabled: boolean;
  naming: BookmarkNamingSource;
  contexts: Settings['contextMenuContexts'];
  entries: Settings['contextMenuEntries'];
  recentMax: number;
  language: Settings['language'];
};

function toContextMenuSettings(stored: unknown): ContextMenuSettings {
  const settings = sanitizeSettings(stored);
  return {
    enabled: settings.contextMenuEnabled,
    naming: settings.contextMenuBookmarkNaming,
    contexts: settings.contextMenuContexts,
    entries: settings.contextMenuEntries,
    recentMax: settings.contextMenuRecentMax,
    language: settings.language,
  };
}

/** Settings that change what the menu shows, so a change to any of them rebuilds it. */
const MENU_SETTING_KEYS = [
  'enabled',
  'contexts',
  'entries',
  'recentMax',
  'language',
] as const satisfies readonly (keyof ContextMenuSettings)[];

function menuSettingsChanged(oldValue: unknown, newValue: unknown): boolean {
  const before = toContextMenuSettings(oldValue);
  const after = toContextMenuSettings(newValue);
  return MENU_SETTING_KEYS.some((key) => !isSameJson(before[key], after[key]));
}

/**
 * Read the context-menu preferences from the same sync area used by Options.
 */
async function getContextMenuSettings(): Promise<ContextMenuSettings> {
  const settings = toContextMenuSettings(await settingsValue.get());
  setLanguage(settings.language);
  // Menu titles are built right after this, so the selected language's messages must be loaded.
  await whenLanguageReady();
  return settings;
}

/** What a click saves: the link right-clicked, or the page itself. */
type SavedTarget = ContextMenuContext['saves'];

/**
 * Determine the bookmark title based on the naming preference, for a save of the link (`target`
 * "link") or of the page.
 * "Link text": Firefox reports the anchor text as `linkText`; Chrome does not expose it, so the
 * selected text is used when the link was selected, then the page title. A page is named after
 * the selected text, then its title.
 */
export function getBookmarkTitle(
  namingSource: BookmarkNamingSource,
  info: Browser.contextMenus.OnClickData & { linkText?: string },
  tab?: Browser.tabs.Tab,
  target: SavedTarget = 'link',
): string {
  switch (namingSource) {
    case 'page_title':
      return getBookmarkDisplayTitle(tab?.title);
    case 'link_url':
      return getBookmarkDisplayTitle(target === 'link' ? info.linkUrl : info.pageUrl);
    default:
      return getBookmarkDisplayTitle(
        (target === 'link' ? info.linkText?.trim() : undefined) ||
          info.selectionText?.trim() ||
          tab?.title,
      );
  }
}

/**
 * The address a click saves, and whether it is the link's or the page's: the link where the
 * click was on one and the menu shows on links, else the page where it shows on pages or
 * selections. Nothing for a click the menu's contexts do not save.
 */
function getSavedAddress(
  info: Browser.contextMenus.OnClickData,
  contexts: readonly string[],
): { url: string; target: SavedTarget } | undefined {
  const saves = new Set(getContextMenuContexts(contexts).map((context) => context.saves));
  if (info.linkUrl && saves.has('link')) return { url: info.linkUrl, target: 'link' };
  if (info.pageUrl && saves.has('page')) return { url: info.pageUrl, target: 'page' };
  return undefined;
}

// =============================================================================
// Types
// =============================================================================

/** A folder an entry offers. */
export type ContextMenuItem = { folderId: string; folderTitle: string };

/** The folders of one entry of `CONTEXT_MENU_ENTRIES`, registered under the entry's id. */
export type ContextMenuProvider = {
  id: string;
  getItems(settings: ContextMenuSettings): Promise<ContextMenuItem[]>;
};

// =============================================================================
// Menu Item ID Parsing
// =============================================================================

const MENU_PREFIX = 'bookmark-scout';
const SEPARATOR = '::';
const ROOT_MENU_ID = `${MENU_PREFIX}${SEPARATOR}root`;
const EMPTY_MENU_ID = `${MENU_PREFIX}${SEPARATOR}empty`;

/**
 * Why a click saved nothing. `disabled` is expected (a click on a menu that the setting has just
 * turned off), so callers do not report it as a failure.
 */
export type ContextMenuClickErrorCode = 'invalid-item' | 'no-link' | 'disabled' | 'save-failed';

export type ContextMenuClickResult =
  | { success: true; folderTitle: string; bookmarkTitle: string }
  | { success: false; code: ContextMenuClickErrorCode; error?: string };

/** A menu item id is the prefix, the item's entry id, and its folder id. */
const MENU_ID_PARTS = 3;

export function createMenuItemId(entry: string, folderId: string): string {
  return `${MENU_PREFIX}${SEPARATOR}${entry}${SEPARATOR}${folderId}`;
}

/** The submenu of an entry with `submenu`. */
function createSubmenuId(entry: string): string {
  return `${MENU_PREFIX}${SEPARATOR}category${SEPARATOR}${entry}`;
}

export function parseMenuItemId(menuItemId: string): { type: string; folderId: string } | null {
  if (typeof menuItemId !== 'string' || !menuItemId.startsWith(MENU_PREFIX)) {
    return null;
  }
  const parts = menuItemId.split(SEPARATOR);
  if (parts.length < MENU_ID_PARTS) return null;
  return {
    type: parts[1],
    folderId: parts.slice(2).join(SEPARATOR), // Handle folder IDs with separators
  };
}

// =============================================================================
// Context Menu Manager
// =============================================================================

class ContextMenuManager {
  private providers = new Map<string, ContextMenuProvider>();
  private isInitialized = false;
  private rebuildQueue: Promise<void> = Promise.resolve();

  /** Register the provider of the entry `provider.id`, replacing any earlier one. */
  registerProvider(provider: ContextMenuProvider): void {
    this.providers.set(provider.id, provider);
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
    await browser.contextMenus?.removeAll();
  }

  /**
   * Rebuild the menu from the entries the user chose, in their order.
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
    if (!settings.enabled || !(await canShowMenu())) return;

    const contexts = getContextMenuContexts(settings.contexts).map(
      (context) => context.id,
    ) as Browser.contextMenus.CreateProperties['contexts'];

    // Recreate root
    browser.contextMenus.create({
      id: ROOT_MENU_ID,
      title: t('contextMenu_saveToFolder'),
      contexts,
    });

    const shown: { entry: ContextMenuEntry; items: ContextMenuItem[] }[] = [];
    for (const entry of getContextMenuEntries(settings.entries)) {
      const provider = this.providers.get(entry.id);
      if (!provider) continue;
      try {
        shown.push({ entry, items: await provider.getItems(settings) });
      } catch (error) {
        console.error(`[ContextMenu] Provider ${provider.id} failed:`, error);
      }
    }

    // Settings can change while a provider is loading. The queued storage-change
    // rebuild will also run, but avoid showing a menu that has already been disabled.
    if (!(await getContextMenuSettings()).enabled || !(await canShowMenu())) {
      await this.clearMenu();
      return;
    }

    let hasItems = false;
    // Menu ids must be unique; a repeated folder would otherwise fail with "duplicate id".
    const createdIds = new Set<string>();

    for (const { entry, items } of shown) {
      if (items.length === 0) continue;
      hasItems = true;

      // An entry without a submenu puts its folders straight into the menu, after its icon.
      let parentId = ROOT_MENU_ID;
      if (entry.submenu) {
        parentId = createSubmenuId(entry.id);
        browser.contextMenus.create({
          id: parentId,
          title: `${entry.icon} ${t(entry.label as MessageKey)}`,
          parentId: ROOT_MENU_ID,
          contexts,
        });
      }

      for (const item of items) {
        const id = createMenuItemId(entry.id, item.folderId);
        if (createdIds.has(id)) continue;
        createdIds.add(id);
        browser.contextMenus.create({
          id,
          title: entry.submenu ? item.folderTitle : `${entry.icon} ${item.folderTitle}`,
          parentId,
          contexts,
        });
      }
    }

    // If no items, show a disabled placeholder
    if (!hasItems) {
      browser.contextMenus.create({
        id: EMPTY_MENU_ID,
        title: t('contextMenu_noFolders'),
        parentId: ROOT_MENU_ID,
        contexts,
        enabled: false,
      });
    }
  }

  /**
   * Handle a context menu click.
   */
  async handleClick(
    info: Browser.contextMenus.OnClickData,
    tab?: Browser.tabs.Tab,
  ): Promise<ContextMenuClickResult> {
    const parsed = parseMenuItemId(info.menuItemId as string);
    if (!parsed) {
      return { success: false, code: 'invalid-item' };
    }

    const { folderId } = parsed;

    try {
      const settings = await getContextMenuSettings();
      if (!settings.enabled || !(await canShowMenu())) {
        return { success: false, code: 'disabled' };
      }
      const saved = getSavedAddress(info, settings.contexts);
      if (!saved) {
        return { success: false, code: 'no-link' };
      }
      const bookmarkTitle = getBookmarkTitle(settings.naming, info, tab, saved.target);

      // Create the bookmark, recorded in the History (and undoable with Ctrl+Z in the manager)
      const { result: bookmark } = await recordBookmarkWrites(
        { action: 'add', title: bookmarkTitle },
        (writer) => writer.create({ parentId: folderId, title: bookmarkTitle, url: saved.url }),
        { source: 'context_menu' },
      );

      // Get folder title for feedback
      const folder = await getBookmark(folderId);

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
      return { success: false, code: 'save-failed', error: getErrorMessage(error) };
    }
  }
}

/** The menu API is present and the optional permission granted (always, in Firefox). */
async function canShowMenu(): Promise<boolean> {
  return Boolean(browser.contextMenus) && (await hasPermission('contextMenu'));
}

// Singleton instance
export const contextMenuManager = new ContextMenuManager();

let clickListenerAdded = false;

/** Saves the clicked link; added once `browser.contextMenus` exists (after a grant in Chrome). */
function listenForMenuClicks(): void {
  if (clickListenerAdded || !browser.contextMenus) return;
  clickListenerAdded = true;
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    const result = await contextMenuManager.handleClick(info, tab);
    if (!result.success && result.code !== 'disabled') {
      console.error('[ContextMenu] Failed to save bookmark:', result.code, result.error ?? '');
    }
  });
}

let storageWatchersRegistered = false;

function rebuildAfterStorageChange(): void {
  void contextMenuManager.rebuildMenu().catch((error) => {
    console.error('[ContextMenu] Failed to rebuild menu:', error);
  });
}

function watchContextMenuStorage(): void {
  // The stored value only reports the new settings, so remember the ones seen last.
  let previous: Settings | undefined;
  void settingsValue
    .get()
    .then((settings) => {
      previous ??= settings;
    })
    .catch(() => undefined);
  settingsValue.watch((next) => {
    const before = previous;
    previous = next;
    if (menuSettingsChanged(before, next)) rebuildAfterStorageChange();
  });
  recentFoldersValue.watch(rebuildAfterStorageChange);
}

// =============================================================================
// Built-in Providers
// =============================================================================

/**
 * Provider for recently used folders, as many as Recent Folders in Menu.
 */
export const recentFoldersProvider: ContextMenuProvider = {
  id: 'recentFolders',

  async getItems(settings): Promise<ContextMenuItem[]> {
    try {
      const recentFolders = await getRecentFolders(settings.recentMax);
      return recentFolders.map((folder) => ({ folderId: folder.id, folderTitle: folder.title }));
    } catch (error) {
      console.error('[ContextMenu] Failed to get recent folders:', error);
      return [];
    }
  },
};

const BOOKMARKS_BAR_ENTRY = 'bookmarksBar';

/**
 * Provider for the "Bookmarks Bar" item, named as the entry is. The folder is looked up in the
 * tree, because its id differs by browser (Firefox calls it the bookmarks toolbar).
 */
export const bookmarksBarProvider: ContextMenuProvider = {
  id: BOOKMARKS_BAR_ENTRY,

  async getItems(): Promise<ContextMenuItem[]> {
    const folderId = await getBookmarksBarId();
    if (!folderId) return [];
    return [{ folderId, folderTitle: getContextMenuEntryLabel(BOOKMARKS_BAR_ENTRY) }];
  },
};

/** The provider of every entry in config/ui/context-menu.toml. */
export const CONTEXT_MENU_PROVIDERS: readonly ContextMenuProvider[] = [
  recentFoldersProvider,
  bookmarksBarProvider,
];

// =============================================================================
// Initialization Helper
// =============================================================================

/**
 * Initialize context menu with default providers.
 */
export async function initializeContextMenu(): Promise<void> {
  for (const provider of CONTEXT_MENU_PROVIDERS) contextMenuManager.registerProvider(provider);

  listenForMenuClicks();
  if (!storageWatchersRegistered) {
    watchContextMenuStorage();
    // A grant adds the API and a revoke removes the menu, so either one rebuilds it.
    watchPermissions(() => {
      listenForMenuClicks();
      rebuildAfterStorageChange();
    });
    storageWatchersRegistered = true;
  }

  // Initialize the menu
  await contextMenuManager.initialize();
}
