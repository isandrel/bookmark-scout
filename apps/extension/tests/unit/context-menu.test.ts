import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addRecentFolder, getRecentFolders } from '@/lib/recent-folders-storage';
import { createBookmark } from '@/services/bookmarks';

vi.mock('@/services/bookmarks', () => ({ createBookmark: vi.fn() }));
vi.mock('@/lib/recent-folders-storage', () => ({
  addRecentFolder: vi.fn(),
  getRecentFolders: vi.fn(),
}));

type StorageListener = (
  changes: { [key: string]: chrome.storage.StorageChange },
  areaName: string,
) => void;

const SETTINGS_KEY = 'bookmark-scout-settings';
const MENU_ID = 'bookmark-scout::static::1';

let storedSettings: Record<string, unknown>;
let menus: Map<string, chrome.contextMenus.CreateProperties>;
let storageListeners: StorageListener[];
let contextMenu: typeof import('@/services/context-menu');

async function setSettings(updates: Record<string, unknown>) {
  await chrome.storage.sync.set({
    [SETTINGS_KEY]: { ...storedSettings, ...updates },
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  storedSettings = {};
  menus = new Map();
  storageListeners = [];

  vi.stubGlobal('chrome', {
    runtime: { lastError: undefined },
    storage: {
      sync: {
        get: vi.fn((key: string, callback: (value: Record<string, unknown>) => void) => {
          callback({ [key]: storedSettings });
        }),
        set: vi.fn((items: Record<string, Record<string, unknown>>) => {
          const oldValue = storedSettings;
          storedSettings = items[SETTINGS_KEY];
          for (const listener of storageListeners) {
            listener({ [SETTINGS_KEY]: { oldValue, newValue: storedSettings } }, 'sync');
          }
          return Promise.resolve();
        }),
      },
      onChanged: {
        addListener: vi.fn((listener: StorageListener) => storageListeners.push(listener)),
      },
    },
    contextMenus: {
      create: vi.fn((properties: chrome.contextMenus.CreateProperties) => {
        menus.set(String(properties.id), properties);
      }),
      removeAll: vi.fn((callback: () => void) => {
        menus.clear();
        callback();
      }),
    },
    bookmarks: {
      get: vi.fn((id: string, callback: (nodes: chrome.bookmarks.BookmarkTreeNode[]) => void) => {
        callback([{ id, title: 'Bookmarks Bar' }]);
      }),
    },
  });

  vi.mocked(getRecentFolders).mockResolvedValue([]);
  vi.mocked(addRecentFolder).mockResolvedValue();
  vi.mocked(createBookmark).mockImplementation(async ({ parentId, title, url }) => ({
    id: 'created-bookmark',
    parentId,
    title,
    url,
  }));
  contextMenu = await import('@/services/context-menu');
});

describe('context menu settings', () => {
  it('starts without a menu when the saved setting is disabled', async () => {
    storedSettings = { contextMenuEnabled: false };
    await contextMenu.initializeContextMenu();
    expect(menus.size).toBe(0);

    await setSettings({ contextMenuEnabled: true });
    await vi.waitFor(() => expect(menus.has(MENU_ID)).toBe(true));
  });

  it('removes the menu when disabled, rejects stale clicks, and restores it when enabled', async () => {
    await contextMenu.initializeContextMenu();
    expect(menus.has(MENU_ID)).toBe(true);
    expect(storageListeners).toHaveLength(1);

    await setSettings({ contextMenuEnabled: false });
    await vi.waitFor(() => expect(menus.size).toBe(0));

    const click: chrome.contextMenus.OnClickData = {
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
    await vi.waitFor(() => expect(chrome.contextMenus.removeAll).toHaveBeenCalledTimes(4));
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
    storedSettings = { contextMenuEnabled: false };
    releaseProvider();
    await rebuilding;

    expect(menus.size).toBe(0);
  });
});
