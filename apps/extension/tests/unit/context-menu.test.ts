import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addRecentFolder, getRecentFolders } from '@/lib/recent-folders-storage';
import { createBookmark } from '@/services/bookmarks';

vi.mock('@/services/bookmarks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/bookmarks')>()),
  createBookmark: vi.fn(),
}));
vi.mock('@/lib/recent-folders-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/recent-folders-storage')>()),
  addRecentFolder: vi.fn(),
  getRecentFolders: vi.fn(),
}));

const SETTINGS_KEY = 'bookmark-scout-settings';
const MENU_ID = 'bookmark-scout::static::1';

type TreeFixture = Browser.bookmarks.BookmarkTreeNode[];

const folder = (id: string, parentId: string, title: string, folderType?: string) =>
  ({ id, parentId, title, syncing: false, children: [], ...(folderType ? { folderType } : {}) }) as
    Browser.bookmarks.BookmarkTreeNode;

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

async function getStoredSettings(): Promise<Record<string, unknown>> {
  const result = await fakeBrowser.storage.sync.get(SETTINGS_KEY);
  return (result[SETTINGS_KEY] as Record<string, unknown> | undefined) ?? {};
}

/** Seeds settings before the storage listener is registered. */
async function seedSettings(settings: Record<string, unknown>) {
  await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: settings });
}

async function setSettings(updates: Record<string, unknown>) {
  await fakeBrowser.storage.sync.set({
    [SETTINGS_KEY]: { ...(await getStoredSettings()), ...updates },
  });
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
  vi.spyOn(fakeBrowser.bookmarks, 'get').mockImplementation((async (id: string) => [
    { id, title: 'Bookmarks Bar', syncing: false },
  ]) as typeof fakeBrowser.bookmarks.get);
  bookmarkTree = chromeTree;
  vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockImplementation(async () => bookmarkTree);

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
    contextMenu.contextMenuManager.registerProvider({
      id: 'slow-provider',
      priority: 1,
      getItems,
    });

    const rebuilding = contextMenu.contextMenuManager.rebuildMenu();
    await vi.waitFor(() => expect(getItems).toHaveBeenCalledOnce());
    // Change the stored value without an onChanged event so only the in-flight rebuild re-checks it.
    vi.spyOn(fakeBrowser.storage.sync, 'get').mockResolvedValue({
      [SETTINGS_KEY]: { contextMenuEnabled: false },
    });
    releaseProvider();
    await rebuilding;

    expect(menus.size).toBe(0);
  });
});

describe('context menu bookmarks bar item', () => {
  it('saves to the bookmarks bar the browser reports, not a fixed id', async () => {
    bookmarkTree = firefoxTree;
    await contextMenu.initializeContextMenu();
    const firefoxMenuId = 'bookmark-scout::static::toolbar_____';
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
    [...menus.keys()].filter((id) => id.startsWith('bookmark-scout::recent::'));

  it('shows recent folders limited by the recent-folders max setting', async () => {
    await seedSettings({ recentFoldersMax: 3 });
    vi.mocked(getRecentFolders).mockImplementation(async (limit?: number) =>
      recent(['a', 'b', 'c', 'd', 'e']).slice(0, limit),
    );
    await contextMenu.initializeContextMenu();
    expect(getRecentFolders).toHaveBeenCalledWith(3);
    expect(recentMenuIds()).toEqual([
      'bookmark-scout::recent::a',
      'bookmark-scout::recent::b',
      'bookmark-scout::recent::c',
    ]);

    await setSettings({ recentFoldersMax: 5 });
    await vi.waitFor(() => expect(recentMenuIds()).toHaveLength(5));
  });

  it('hides recent folders when the setting is disabled and restores them live', async () => {
    await seedSettings({ recentFoldersEnabled: false });
    vi.mocked(getRecentFolders).mockResolvedValue(recent(['a']));
    await contextMenu.initializeContextMenu();
    expect(recentMenuIds()).toEqual([]);
    expect(menus.has(MENU_ID)).toBe(true);

    await setSettings({ recentFoldersEnabled: true });
    await vi.waitFor(() => expect(recentMenuIds()).toEqual(['bookmark-scout::recent::a']));
  });

  it('skips repeated folder ids instead of failing with a duplicate id', async () => {
    vi.mocked(getRecentFolders).mockResolvedValue(recent(['a', 'a', 'b']));
    await contextMenu.initializeContextMenu();
    const createdIds = vi
      .mocked(fakeBrowser.contextMenus.create)
      .mock.calls.map(([properties]) => properties.id);
    expect(createdIds.filter((id) => id === 'bookmark-scout::recent::a')).toHaveLength(1);
  });

  it('localizes menu titles with the selected language', async () => {
    await seedSettings({ language: 'ja' });
    vi.mocked(getRecentFolders).mockResolvedValue(recent(['a']));
    await contextMenu.initializeContextMenu();
    expect(menus.get('bookmark-scout::root')?.title).not.toBe('Save bookmark to...');
    expect(menus.get('bookmark-scout::category::recent')?.title).toBe('📁 最近のフォルダー');
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
