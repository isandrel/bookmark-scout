import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addRecentFolder, getRecentFolders } from '@/lib/recent-folders-storage';
import { createBookmark } from '@/services/bookmarks';

vi.mock('@/services/bookmarks', () => ({ createBookmark: vi.fn() }));
vi.mock('@/lib/recent-folders-storage', () => ({
  addRecentFolder: vi.fn(),
  getRecentFolders: vi.fn(),
}));

const SETTINGS_KEY = 'bookmark-scout-settings';
const MENU_ID = 'bookmark-scout::static::1';

let menus: Map<string, Browser.contextMenus.CreateProperties>;
let contextMenu: typeof import('@/services/context-menu');

async function setSettings(updates: Record<string, unknown>) {
  const stored = (await fakeBrowser.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY];
  await fakeBrowser.storage.sync.set({
    [SETTINGS_KEY]: { ...(stored as Record<string, unknown> | undefined), ...updates },
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
    menus.set(String(properties.id), properties);
    return String(properties.id);
  });
  vi.spyOn(fakeBrowser.contextMenus, 'removeAll').mockImplementation(async () => {
    menus.clear();
  });
  vi.spyOn(fakeBrowser.bookmarks, 'get').mockImplementation(async (id) => [
    { id: String(id), title: 'Bookmarks Bar', syncing: false },
  ]);

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
    await setSettings({ contextMenuEnabled: false });
    await contextMenu.initializeContextMenu();
    expect(menus.size).toBe(0);

    await setSettings({ contextMenuEnabled: true });
    await vi.waitFor(() => expect(menus.has(MENU_ID)).toBe(true));
  });

  it('removes the menu when disabled, rejects stale clicks, and restores it when enabled', async () => {
    await contextMenu.initializeContextMenu();
    expect(menus.has(MENU_ID)).toBe(true);

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
    expect(blocked).toEqual({ success: false, error: 'Context menu is disabled' });
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
    await setSettings({ contextMenuEnabled: false });
    await setSettings({ contextMenuEnabled: true });
    await setSettings({ contextMenuEnabled: false });
    await vi.waitFor(() => expect(fakeBrowser.contextMenus.removeAll).toHaveBeenCalledTimes(4));
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
