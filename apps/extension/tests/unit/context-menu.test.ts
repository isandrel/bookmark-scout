import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addRecentFolder, getRecentFolders } from '@/lib/recent-folders-storage';
import { createBookmark } from '@/services/bookmarks';
import { installFakePermissions } from '../fake-permissions';
import { serveExtensionFiles } from '../locale-files';
import { readStoredData, STORAGE_ITEMS, seedStored, storedEntry } from './storage-helpers';

vi.mock('@/services/bookmarks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/bookmarks')>()),
  createBookmark: vi.fn(),
}));
vi.mock('@/lib/recent-folders-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/recent-folders-storage')>()),
  addRecentFolder: vi.fn(),
  getRecentFolders: vi.fn(),
}));

const SETTINGS = STORAGE_ITEMS.settings;
const MENU_ID = 'bookmark-scout::bookmarksBar::1';

type TreeFixture = Browser.bookmarks.BookmarkTreeNode[];

const folder = (id: string, parentId: string, title: string, folderType?: string) =>
  ({
    id,
    parentId,
    title,
    syncing: false,
    children: [],
    ...(folderType ? { folderType } : {}),
  }) as Browser.bookmarks.BookmarkTreeNode;

/** Chrome 134+: permanent folders carry `folderType`. */
const chromeTree: TreeFixture = [
  {
    id: '0',
    title: '',
    syncing: false,
    children: [
      folder('1', '0', 'Bookmarks bar', 'bookmarks-bar'),
      folder('2', '0', 'Other bookmarks', 'other'),
    ],
  },
];

/** Firefox: fixed GUIDs, no `folderType`, and the menu folder comes before the toolbar. */
const firefoxTree: TreeFixture = [
  {
    id: 'root________',
    title: '',
    syncing: false,
    children: [
      folder('menu________', 'root________', 'Bookmarks Menu'),
      folder('toolbar_____', 'root________', 'Bookmarks Toolbar'),
      folder('unfiled_____', 'root________', 'Other Bookmarks'),
    ],
  },
];

let bookmarkTree: TreeFixture;

let menus: Map<string, Browser.contextMenus.CreateProperties>;
let contextMenu: typeof import('@/services/context-menu');
let permissions: ReturnType<typeof installFakePermissions>;

async function getStoredSettings(): Promise<Record<string, unknown>> {
  return ((await readStoredData(SETTINGS)) as Record<string, unknown> | undefined) ?? {};
}

/** Seeds settings before the storage listener is registered, with the menu on unless given. */
async function seedSettings(settings: Record<string, unknown>) {
  await seedStored(SETTINGS, { contextMenuEnabled: true, ...settings });
}

async function setSettings(updates: Record<string, unknown>) {
  await seedStored(SETTINGS, { ...(await getStoredSettings()), ...updates });
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  fakeBrowser.reset();
  menus = new Map();

  // fakeBrowser does not implement context menus or bookmark lookups.
  vi.spyOn(fakeBrowser.contextMenus, 'create').mockImplementation((properties) => {
    menus.set(String(properties?.id), properties ?? {});
    return String(properties?.id);
  });
  vi.spyOn(fakeBrowser.contextMenus, 'removeAll').mockImplementation(async () => {
    menus.clear();
  });
  vi.spyOn(fakeBrowser.contextMenus.onClicked, 'addListener').mockImplementation(() => undefined);
  vi.spyOn(fakeBrowser.bookmarks, 'get').mockImplementation((async (id: string) => [
    { id, title: 'Bookmarks Bar', syncing: false },
  ]) as typeof fakeBrowser.bookmarks.get);
  bookmarkTree = chromeTree;
  vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockImplementation(async () => bookmarkTree);

  // The menu is off by default and needs the optional contextMenus permission (Chrome, Edge).
  permissions = installFakePermissions({ permissions: ['contextMenus'] });
  await seedSettings({ contextMenuEnabled: true });

  vi.mocked(getRecentFolders).mockResolvedValue([]);
  vi.mocked(addRecentFolder).mockResolvedValue();
  vi.mocked(createBookmark).mockImplementation(async ({ parentId, title, url }) => ({
    id: 'created-bookmark',
    parentId,
    title: title ?? '',
    url,
    syncing: false,
  }));
  contextMenu = await import('@/services/context-menu');
});

describe('context menu settings', () => {
  it('is off on a fresh install', async () => {
    await fakeBrowser.storage.sync.clear();
    await contextMenu.initializeContextMenu();
    expect(menus.size).toBe(0);
  });

  it('builds the menu only while its permission is granted and removes it on revoke', async () => {
    permissions.revoke({ permissions: ['contextMenus'] });
    await contextMenu.initializeContextMenu();
    expect(menus.size).toBe(0);

    permissions.grant({ permissions: ['contextMenus'] });
    await vi.waitFor(() => expect(menus.has(MENU_ID)).toBe(true));

    permissions.revoke({ permissions: ['contextMenus'] });
    await vi.waitFor(() => expect(menus.size).toBe(0));
    const click: Browser.contextMenus.OnClickData = {
      menuItemId: MENU_ID,
      linkUrl: 'https://example.test/story',
      editable: false,
      pageUrl: 'https://example.test',
    };
    const blocked = await contextMenu.contextMenuManager.handleClick(click, { title: 'Page' });
    expect(blocked).toEqual({ success: false, code: 'disabled' });
    expect(createBookmark).not.toHaveBeenCalled();
    // The synced setting stays on, so another device that has the permission keeps its menu.
    expect(await getStoredSettings()).toMatchObject({ contextMenuEnabled: true });
  });

  it('starts without a menu when the saved setting is disabled', async () => {
    await seedSettings({ contextMenuEnabled: false });
    await contextMenu.initializeContextMenu();
    expect(menus.size).toBe(0);

    await setSettings({ contextMenuEnabled: true });
    await vi.waitFor(() => expect(menus.has(MENU_ID)).toBe(true));
  });

  it('removes the menu when disabled, rejects stale clicks, and restores it when enabled', async () => {
    await contextMenu.initializeContextMenu();
    expect(menus.has(MENU_ID)).toBe(true);
    expect(fakeBrowser.storage.sync.onChanged.hasListeners()).toBe(true);

    await setSettings({ contextMenuEnabled: false });
    await vi.waitFor(() => expect(menus.size).toBe(0));

    const click: Browser.contextMenus.OnClickData = {
      menuItemId: MENU_ID,
      linkUrl: 'https://example.test/story',
      selectionText: 'Anchor text',
      editable: false,
      pageUrl: 'https://example.test',
    };
    const blocked = await contextMenu.contextMenuManager.handleClick(click, {
      title: 'Page title',
    });
    expect(blocked).toEqual({ success: false, code: 'disabled' });
    expect(createBookmark).not.toHaveBeenCalled();

    await setSettings({ contextMenuEnabled: true });
    await vi.waitFor(() => expect(menus.has(MENU_ID)).toBe(true));

    const saved = await contextMenu.contextMenuManager.handleClick(click, {
      title: 'Page title',
    });
    expect(saved.success).toBe(true);
    expect(createBookmark).toHaveBeenCalledWith({
      parentId: '1',
      title: 'Anchor text',
      url: 'https://example.test/story',
    });
  });

  it.each([
    ['link_text', 'Anchor text'],
    ['page_title', 'Page title'],
    ['link_url', 'https://example.test/story'],
  ] as const)('uses the synced %s naming setting', async (naming, expectedTitle) => {
    await contextMenu.initializeContextMenu();
    await setSettings({ contextMenuBookmarkNaming: naming });

    const result = await contextMenu.contextMenuManager.handleClick(
      {
        menuItemId: MENU_ID,
        linkUrl: 'https://example.test/story',
        selectionText: 'Anchor text',
        editable: false,
        pageUrl: 'https://example.test',
      },
      { title: 'Page title' },
    );

    expect(result.success).toBe(true);
    expect(createBookmark).toHaveBeenCalledWith({
      parentId: '1',
      title: expectedTitle,
      url: 'https://example.test/story',
    });
  });

  it('serializes rapid settings changes so the final disabled state wins', async () => {
    await contextMenu.initializeContextMenu();
    const rebuildMenu = vi.spyOn(contextMenu.contextMenuManager, 'rebuildMenu');
    await setSettings({ contextMenuEnabled: false });
    await setSettings({ contextMenuEnabled: true });
    await setSettings({ contextMenuEnabled: false });

    // One queued rebuild per change; wait for all of them, whatever order they settle in.
    expect(rebuildMenu).toHaveBeenCalledTimes(3);
    await Promise.all(rebuildMenu.mock.results.map((result) => result.value));
    expect(menus.size).toBe(0);
  });

  it('clears the root when disabled while a menu provider is loading', async () => {
    await contextMenu.initializeContextMenu();

    let releaseProvider = () => {};
    const providerReady = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const getItems = vi.fn(async () => {
      await providerReady;
      return [];
    });
    contextMenu.contextMenuManager.registerProvider({ id: 'recentFolders', getItems });

    const rebuilding = contextMenu.contextMenuManager.rebuildMenu();
    await vi.waitFor(() => expect(getItems).toHaveBeenCalledOnce());
    // Change the stored value without an onChanged event so only the in-flight rebuild re-checks it.
    vi.spyOn(fakeBrowser.storage.sync, 'get').mockResolvedValue(
      storedEntry(SETTINGS, { contextMenuEnabled: false }),
    );
    releaseProvider();
    await rebuilding;

    expect(menus.size).toBe(0);
  });
});

describe('context menu bookmarks bar item', () => {
  it('saves to the bookmarks bar the browser reports, not a fixed id', async () => {
    bookmarkTree = firefoxTree;
    await contextMenu.initializeContextMenu();
    const firefoxMenuId = 'bookmark-scout::bookmarksBar::toolbar_____';
    expect(menus.has(firefoxMenuId)).toBe(true);
    expect(menus.has(MENU_ID)).toBe(false);

    const result = await contextMenu.contextMenuManager.handleClick(
      {
        menuItemId: firefoxMenuId,
        linkUrl: 'https://example.test/story',
        editable: false,
        pageUrl: 'https://example.test',
      },
      { title: 'Page title' } as Browser.tabs.Tab,
    );
    expect(result.success).toBe(true);
    expect(createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'toolbar_____' }),
    );
  });

  it('finds the bar by folderType, the Firefox toolbar id, then the first permanent folder', async () => {
    const { findBookmarksBarFolder } = await import('@/services/bookmarks');
    const legacyChrome = [
      { id: '0', title: '', children: [folder('1', '0', 'Bar'), folder('2', '0', 'Other')] },
    ];
    const reordered = [
      {
        id: '0',
        title: '',
        children: [folder('2', '0', 'Other', 'other'), folder('9', '0', 'Bar', 'bookmarks-bar')],
      },
    ];
    expect(findBookmarksBarFolder(chromeTree)?.id).toBe('1');
    expect(findBookmarksBarFolder(reordered)?.id).toBe('9');
    expect(findBookmarksBarFolder(firefoxTree)?.id).toBe('toolbar_____');
    expect(findBookmarksBarFolder(legacyChrome)?.id).toBe('1');
    expect(findBookmarksBarFolder([])).toBeUndefined();
  });
});

describe('context menu recent folders', () => {
  const recent = (ids: string[]) => ids.map((id) => ({ id, title: `Folder ${id}`, lastUsed: 0 }));
  const recentMenuIds = () =>
    [...menus.keys()].filter((id) => id.startsWith('bookmark-scout::recentFolders::'));

  it('shows recent folders limited by Recent Folders in Menu, not the popup max', async () => {
    await seedSettings({ contextMenuRecentMax: 3, recentFoldersMax: 1 });
    vi.mocked(getRecentFolders).mockImplementation(async (limit?: number) =>
      recent(['a', 'b', 'c', 'd', 'e']).slice(0, limit),
    );
    await contextMenu.initializeContextMenu();
    expect(getRecentFolders).toHaveBeenCalledWith(3);
    expect(recentMenuIds()).toEqual([
      'bookmark-scout::recentFolders::a',
      'bookmark-scout::recentFolders::b',
      'bookmark-scout::recentFolders::c',
    ]);

    await setSettings({ contextMenuRecentMax: 5 });
    await vi.waitFor(() => expect(recentMenuIds()).toHaveLength(5));
    // The popup's own Recent Folders setting does not reach the menu.
    await setSettings({ recentFoldersEnabled: false });
    await contextMenu.contextMenuManager.rebuildMenu();
    expect(recentMenuIds()).toHaveLength(5);
  });

  it('hides recent folders when Menu Entries leaves them out and restores them live', async () => {
    await seedSettings({ contextMenuEntries: ['bookmarksBar'] });
    vi.mocked(getRecentFolders).mockResolvedValue(recent(['a']));
    await contextMenu.initializeContextMenu();
    expect(recentMenuIds()).toEqual([]);
    expect(menus.has(MENU_ID)).toBe(true);

    await setSettings({ contextMenuEntries: [] });
    await vi.waitFor(() => expect(recentMenuIds()).toEqual(['bookmark-scout::recentFolders::a']));
  });

  it('skips repeated folder ids instead of failing with a duplicate id', async () => {
    vi.mocked(getRecentFolders).mockResolvedValue(recent(['a', 'a', 'b']));
    await contextMenu.initializeContextMenu();
    const createdIds = vi
      .mocked(fakeBrowser.contextMenus.create)
      .mock.calls.map(([properties]) => properties.id);
    expect(createdIds.filter((id) => id === 'bookmark-scout::recentFolders::a')).toHaveLength(1);
  });

  it('localizes menu titles with the selected language on the first build', async () => {
    // This module copy has no locales loaded, as in a freshly started background.
    const fetchFile = serveExtensionFiles();
    try {
      await seedSettings({ language: 'ja' });
      vi.mocked(getRecentFolders).mockResolvedValue(recent(['a']));
      await contextMenu.initializeContextMenu();
      expect(fetchFile).toHaveBeenCalledWith(
        'chrome-extension://test-extension-id/_locales/ja/messages.json',
      );
      expect(menus.get('bookmark-scout::root')?.title).toBe('ブックマークの保存先...');
      expect(menus.get('bookmark-scout::category::recentFolders')?.title).toBe('📁 最近のフォルダ');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('context menu link text naming', () => {
  it('prefers Firefox linkText, then selection, then page title', () => {
    const base = { menuItemId: MENU_ID, editable: false, pageUrl: 'https://example.test' };
    expect(
      contextMenu.getBookmarkTitle(
        'link_text',
        { ...base, linkText: 'Anchor', selectionText: 'Sel' },
        { title: 'Page' } as Browser.tabs.Tab,
      ),
    ).toBe('Anchor');
    expect(
      contextMenu.getBookmarkTitle('link_text', { ...base, selectionText: 'Sel' }, {
        title: 'Page',
      } as Browser.tabs.Tab),
    ).toBe('Sel');
    expect(
      contextMenu.getBookmarkTitle('link_text', base, { title: 'Page' } as Browser.tabs.Tab),
    ).toBe('Page');
  });
});

describe('context menu entries and contexts', () => {
  const recent = (ids: string[]) => ids.map((id) => ({ id, title: `Folder ${id}`, lastUsed: 0 }));
  const RECENT_SUBMENU = 'bookmark-scout::category::recentFolders';
  /**
   * The root's children, as `id: title`, in the order they were created (shown). This module copy
   * has no messages loaded, so a title is its icon and message key.
   */
  const rootChildren = () =>
    [...menus.values()]
      .filter((item) => item.parentId === 'bookmark-scout::root')
      .map((item) => `${item.id}: ${item.title}`);

  it('has a provider for every entry of the config table, and nothing else', async () => {
    const { CONTEXT_MENU_ENTRY_IDS } = await import('@/lib/context-menu-config');
    expect(contextMenu.CONTEXT_MENU_PROVIDERS.map((provider) => provider.id)).toEqual([
      ...CONTEXT_MENU_ENTRY_IDS,
    ]);
  });

  it('shows the entries in the order Menu Entries lists them, and only those', async () => {
    vi.mocked(getRecentFolders).mockResolvedValue(recent(['a']));
    await contextMenu.initializeContextMenu();
    // Empty (the default) means every entry, in the config file's order.
    expect(rootChildren()).toEqual([
      `${RECENT_SUBMENU}: 📁 contextMenu_recentFolders`,
      `${MENU_ID}: 📚 contextMenu_bookmarksBar`,
    ]);

    await setSettings({ contextMenuEntries: ['bookmarksBar', 'recentFolders'] });
    await vi.waitFor(() =>
      expect(rootChildren()).toEqual([
        `${MENU_ID}: 📚 contextMenu_bookmarksBar`,
        `${RECENT_SUBMENU}: 📁 contextMenu_recentFolders`,
      ]),
    );

    await setSettings({ contextMenuEntries: ['recentFolders'] });
    await vi.waitFor(() =>
      expect(rootChildren()).toEqual([`${RECENT_SUBMENU}: 📁 contextMenu_recentFolders`]),
    );
    expect(menus.has(MENU_ID)).toBe(false);
  });

  it('shows every item on the contexts Show Menu On lists, links only by default', async () => {
    await contextMenu.initializeContextMenu();
    expect(menus.size).toBeGreaterThan(0);
    for (const item of menus.values()) expect(item.contexts).toEqual(['link']);

    await setSettings({ contextMenuContexts: ['selection', 'page'] });
    // Stored in any order; the menu lists them in the config file's order.
    await vi.waitFor(() =>
      expect(menus.get('bookmark-scout::root')?.contexts).toEqual(['page', 'selection']),
    );
    for (const item of menus.values()) expect(item.contexts).toEqual(['page', 'selection']);
  });

  it('saves the page from a page or selection click, named after the selection', async () => {
    await seedSettings({ contextMenuContexts: ['link', 'page', 'selection'] });
    await contextMenu.initializeContextMenu();
    const base = { menuItemId: MENU_ID, editable: false, pageUrl: 'https://example.test/page' };
    const tab = { title: 'Page title' } as Browser.tabs.Tab;

    expect((await contextMenu.contextMenuManager.handleClick(base, tab)).success).toBe(true);
    expect(createBookmark).toHaveBeenLastCalledWith({
      parentId: '1',
      title: 'Page title',
      url: 'https://example.test/page',
    });

    await contextMenu.contextMenuManager.handleClick({ ...base, selectionText: ' A quote ' }, tab);
    expect(createBookmark).toHaveBeenLastCalledWith({
      parentId: '1',
      title: 'A quote',
      url: 'https://example.test/page',
    });

    // A click on a link still saves the link.
    await contextMenu.contextMenuManager.handleClick(
      { ...base, linkUrl: 'https://example.test/link' },
      tab,
    );
    expect(createBookmark).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: 'https://example.test/link' }),
    );

    // Link URL naming names a saved page after the page's own address.
    await setSettings({ contextMenuBookmarkNaming: 'link_url' });
    await contextMenu.contextMenuManager.handleClick(base, tab);
    expect(createBookmark).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'https://example.test/page' }),
    );
  });

  it('saves nothing from a page click while the menu shows on links only', async () => {
    await contextMenu.initializeContextMenu();
    const result = await contextMenu.contextMenuManager.handleClick(
      { menuItemId: MENU_ID, editable: false, pageUrl: 'https://example.test/page' },
      { title: 'Page title' } as Browser.tabs.Tab,
    );
    expect(result).toEqual({ success: false, code: 'no-link' });
    expect(createBookmark).not.toHaveBeenCalled();
  });

  it('a page saved with Link Text naming ignores a link text Firefox reports', () => {
    const info = {
      menuItemId: MENU_ID,
      editable: false,
      pageUrl: 'https://example.test/page',
      linkText: 'Anchor',
    };
    const tab = { title: 'Page title' } as Browser.tabs.Tab;
    expect(contextMenu.getBookmarkTitle('link_text', info, tab, 'page')).toBe('Page title');
    expect(contextMenu.getBookmarkTitle('link_text', info, tab, 'link')).toBe('Anchor');
  });
});
