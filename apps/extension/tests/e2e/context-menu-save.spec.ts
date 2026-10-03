import type { Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { seedFolder, setSettings } from './popup-helpers';

/**
 * Playwright cannot open the native right-click menu, so these tests drive the real background
 * listener: they dispatch `contextMenus.onClicked` in the service worker with the click data
 * Chrome would send, and read the result back from `chrome.bookmarks`.
 */

const RECENT_KEY = 'bookmark-scout-recent-folders';
const ROOT_ID = 'bookmark-scout::root';
const RECENT_CATEGORY_ID = 'bookmark-scout::category::recent';
const BOOKMARKS_BAR_ITEM_ID = 'bookmark-scout::static::1';
const PAGE_URL = 'https://e2e.invalid/article';

type MenuEntry = { id: string; title?: string; parentId?: string; contexts?: string[] };
type SavedBookmark = { title: string; url?: string; index?: number };

type ClickData = {
  menuItemId: string;
  parentMenuItemId?: string;
  linkUrl?: string;
  linkText?: string;
  selectionText?: string;
  pageUrl?: string;
};

const recentId = (folderId: string) => `bookmark-scout::recent::${folderId}`;

/**
 * Mirror every item the background registers so tests can read the menu, which Chrome has no API
 * to list. The original `create` still runs, so the real menu is built as before.
 */
async function recordMenu(worker: Worker) {
  await worker.evaluate(() => {
    type Recorder = { items: Map<string, unknown>; installed: Set<unknown> };
    type MenusApi = typeof chrome.contextMenus;
    const scope = globalThis as unknown as {
      browser?: { contextMenus?: MenusApi };
      __menuRecorder?: Recorder;
    };
    const state = scope.__menuRecorder ?? { items: new Map(), installed: new Set() };
    scope.__menuRecorder = state;
    for (const menus of [chrome.contextMenus, scope.browser?.contextMenus]) {
      if (!menus || state.installed.has(menus)) continue;
      state.installed.add(menus);
      const create = menus.create.bind(menus);
      const removeAll = menus.removeAll.bind(menus);
      menus.create = ((properties: chrome.contextMenus.CreateProperties, callback?: () => void) => {
        if (properties.id) state.items.set(properties.id, { ...properties });
        return create(properties, callback);
      }) as MenusApi['create'];
      menus.removeAll = (() => {
        state.items.clear();
        return removeAll();
      }) as MenusApi['removeAll'];
    }
  });
  // Turn the menu on (it is off by default) and rebuild once, so the recorder sees the whole
  // menu, not only items created after this point.
  await setSettings(worker, { language: 'en', contextMenuEnabled: true });
}

async function menuEntries(worker: Worker): Promise<MenuEntry[]> {
  return worker.evaluate(() => {
    const state = (globalThis as unknown as { __menuRecorder?: { items: Map<string, MenuEntry> } })
      .__menuRecorder;
    return [...(state?.items.values() ?? [])].map(({ id, title, parentId, contexts }) => ({
      id,
      title,
      parentId,
      contexts,
    }));
  });
}

/** Child menu items of `parentId`, as `id: title`, in creation (display) order. */
async function menuChildren(worker: Worker, parentId: string): Promise<string[]> {
  return (await menuEntries(worker))
    .filter((entry) => entry.parentId === parentId)
    .map((entry) => `${entry.id}: ${entry.title}`);
}

/** Ask Chrome itself whether the item is registered: `update` rejects for unknown ids. */
async function isRegistered(worker: Worker, id: string): Promise<boolean> {
  return worker.evaluate(async (menuItemId) => {
    try {
      await chrome.contextMenus.update(menuItemId, {});
      return true;
    } catch {
      return false;
    }
  }, id);
}

/** Fire the registered onClicked listeners as Chrome does for a click in a page tab. */
async function clickMenuItem(worker: Worker, info: ClickData, tabTitle = 'E2E Article Page') {
  await worker.evaluate(
    ({ clickInfo, title, pageUrl }) => {
      const tab = {
        id: 4242,
        index: 0,
        windowId: 1,
        title,
        url: pageUrl,
        active: true,
        highlighted: true,
        pinned: false,
        incognito: false,
        discarded: false,
        autoDiscardable: true,
        frozen: false,
        groupId: -1,
        selected: true,
      };
      const event = chrome.contextMenus.onClicked as unknown as {
        hasListeners(): boolean;
        dispatch(info: unknown, tab: unknown): void;
      };
      if (!event.hasListeners()) throw new Error('No context menu click listener is registered');
      event.dispatch({ editable: false, frameId: 0, pageUrl, ...clickInfo }, tab);
    },
    { clickInfo: info, title: tabTitle, pageUrl: PAGE_URL },
  );
}

async function savedIn(worker: Worker, folderId: string): Promise<SavedBookmark[]> {
  return worker.evaluate(async (id) => {
    const children = await chrome.bookmarks.getChildren(id);
    return children.map(({ title, url, index }) => ({ title, url, index }));
  }, folderId);
}

async function folderTitle(worker: Worker, folderId: string): Promise<string> {
  return worker.evaluate(async (id) => (await chrome.bookmarks.get(id))[0].title, folderId);
}

async function seedRecentFolders(worker: Worker, folders: { id: string; title: string }[]) {
  await worker.evaluate(
    async ({ key, entries }) => {
      const now = Date.now();
      await chrome.storage.local.set({
        [key]: entries.map((folder, position) => ({ ...folder, lastUsed: now - position })),
      });
    },
    { key: RECENT_KEY, entries: folders },
  );
}

async function recentFolderIds(worker: Worker): Promise<string[]> {
  return worker.evaluate(async (key) => {
    const stored = (await chrome.storage.local.get(key))[key] as { id: string }[] | undefined;
    return (stored ?? []).map((folder) => folder.id);
  }, RECENT_KEY);
}

test.describe('context menu save', () => {
  // The optional contextMenus permission, which Options asks for when the menu is turned on.
  test.use({ grantPermissions: ['contextMenus'] });
  // The menu is off by default; these tests start with it turned on.
  test.beforeEach(async ({ extensionWorker }) => {
    await setSettings(extensionWorker, { contextMenuEnabled: true });
  });

  test('a fresh profile offers only the Bookmarks Bar, which saves the link there', async ({
    extensionWorker,
  }) => {
    await recordMenu(extensionWorker);
    await expect
      .poll(() => menuChildren(extensionWorker, ROOT_ID))
      .toEqual([`${BOOKMARKS_BAR_ITEM_ID}: 📚 Bookmarks Bar`]);
    const root = (await menuEntries(extensionWorker)).find((entry) => entry.id === ROOT_ID);
    expect(root?.title).toBe('Save bookmark to...');
    // Every item is offered only on links; the click handler needs a link URL.
    for (const entry of await menuEntries(extensionWorker)) {
      expect(entry.contexts, entry.id).toEqual(['link']);
    }
    expect(await isRegistered(extensionWorker, BOOKMARKS_BAR_ITEM_ID)).toBe(true);

    const barBefore = await savedIn(extensionWorker, '1');
    await clickMenuItem(extensionWorker, {
      menuItemId: BOOKMARKS_BAR_ITEM_ID,
      parentMenuItemId: ROOT_ID,
      linkUrl: 'https://e2e.invalid/bar-link',
      selectionText: '  Selected Bar Link  ',
    });

    await expect.poll(() => savedIn(extensionWorker, '1')).toHaveLength(barBefore.length + 1);
    expect((await savedIn(extensionWorker, '1')).at(-1)).toEqual({
      title: 'Selected Bar Link',
      url: 'https://e2e.invalid/bar-link',
      index: barBefore.length,
    });

    // The save records the bar as a recent folder and rebuilds the menu with it.
    const barTitle = await folderTitle(extensionWorker, '1');
    await expect
      .poll(() => menuChildren(extensionWorker, RECENT_CATEGORY_ID))
      .toEqual([`${recentId('1')}: ${barTitle}`]);
    expect(await isRegistered(extensionWorker, recentId('1'))).toBe(true);
  });

  test('a recent folder item saves into that exact folder and moves it to the top', async ({
    extensionWorker,
  }) => {
    const inbox = await seedFolder(extensionWorker, 'E2E Menu Inbox', [
      { title: 'Inbox Existing', url: 'https://e2e.invalid/inbox-existing' },
    ]);
    const archive = await seedFolder(extensionWorker, 'E2E Menu Archive', [
      {
        title: 'Archive Nested',
        children: [{ title: 'Nested Existing', url: 'https://e2e.invalid/nested-existing' }],
      },
    ]);
    const nestedId = archive.ids['Archive Nested'];
    await recordMenu(extensionWorker);
    await seedRecentFolders(extensionWorker, [
      { id: inbox.folderId, title: 'E2E Menu Inbox' },
      { id: nestedId, title: 'Archive Nested' },
    ]);

    await expect
      .poll(() => menuChildren(extensionWorker, RECENT_CATEGORY_ID))
      .toEqual([
        `${recentId(inbox.folderId)}: E2E Menu Inbox`,
        `${recentId(nestedId)}: Archive Nested`,
      ]);
    expect(await menuChildren(extensionWorker, ROOT_ID)).toEqual([
      `${RECENT_CATEGORY_ID}: 📁 Recent Folders`,
      `${BOOKMARKS_BAR_ITEM_ID}: 📚 Bookmarks Bar`,
    ]);

    await clickMenuItem(extensionWorker, {
      menuItemId: recentId(nestedId),
      linkUrl: 'https://e2e.invalid/nested-save',
      selectionText: 'Nested Save',
    });

    await expect
      .poll(() => savedIn(extensionWorker, nestedId))
      .toEqual([
        { title: 'Nested Existing', url: 'https://e2e.invalid/nested-existing', index: 0 },
        { title: 'Nested Save', url: 'https://e2e.invalid/nested-save', index: 1 },
      ]);
    // Only the clicked folder changed: not its parent, the other recent folder, or the bar.
    expect((await savedIn(extensionWorker, archive.folderId)).map((node) => node.title)).toEqual([
      'Archive Nested',
    ]);
    expect((await savedIn(extensionWorker, inbox.folderId)).map((node) => node.title)).toEqual([
      'Inbox Existing',
    ]);

    await expect.poll(() => recentFolderIds(extensionWorker)).toEqual([nestedId, inbox.folderId]);
    await expect
      .poll(() => menuChildren(extensionWorker, RECENT_CATEGORY_ID))
      .toEqual([
        `${recentId(nestedId)}: Archive Nested`,
        `${recentId(inbox.folderId)}: E2E Menu Inbox`,
      ]);
  });

  test('the bookmark naming setting picks the saved title for each click type', async ({
    extensionWorker,
  }) => {
    const target = await seedFolder(extensionWorker, 'E2E Menu Naming', []);
    const menuItemId = recentId(target.folderId);
    await seedRecentFolders(extensionWorker, [{ id: target.folderId, title: 'E2E Menu Naming' }]);
    await expect.poll(() => isRegistered(extensionWorker, menuItemId)).toBe(true);

    const save = async (info: Omit<ClickData, 'menuItemId'>, expectedTitle: string) => {
      const before = (await savedIn(extensionWorker, target.folderId)).length;
      await clickMenuItem(extensionWorker, { menuItemId, ...info });
      await expect
        .poll(async () => (await savedIn(extensionWorker, target.folderId))[before])
        .toEqual({ title: expectedTitle, url: info.linkUrl, index: before });
    };

    // Link text (default): Firefox's linkText, else the selected link text, else the page title.
    await save(
      { linkUrl: 'https://e2e.invalid/ff', linkText: ' Firefox Anchor ', selectionText: 'Ignored' },
      'Firefox Anchor',
    );
    await save(
      { linkUrl: 'https://e2e.invalid/sel', selectionText: 'Selected Anchor' },
      'Selected Anchor',
    );
    await save({ linkUrl: 'https://e2e.invalid/plain' }, 'E2E Article Page');

    await setSettings(extensionWorker, { contextMenuBookmarkNaming: 'page_title' });
    await save(
      { linkUrl: 'https://e2e.invalid/page', selectionText: 'Not Used' },
      'E2E Article Page',
    );

    await setSettings(extensionWorker, { contextMenuBookmarkNaming: 'link_url' });
    await save(
      { linkUrl: 'https://e2e.invalid/url-as-title', selectionText: 'Not Used' },
      'https://e2e.invalid/url-as-title',
    );

    expect((await savedIn(extensionWorker, target.folderId)).map((node) => node.title)).toEqual([
      'Firefox Anchor',
      'Selected Anchor',
      'E2E Article Page',
      'E2E Article Page',
      'https://e2e.invalid/url-as-title',
    ]);
  });

  test('page, selection, and foreign menu clicks without a link save nothing', async ({
    extensionWorker,
  }) => {
    const target = await seedFolder(extensionWorker, 'E2E Menu No Link', []);
    const menuItemId = recentId(target.folderId);

    // Page and plain-selection contexts carry no linkUrl; another extension's id is not ours.
    await clickMenuItem(extensionWorker, { menuItemId });
    await clickMenuItem(extensionWorker, { menuItemId, selectionText: 'Just selected text' });
    await clickMenuItem(extensionWorker, {
      menuItemId: 'another-extension::save',
      linkUrl: 'https://e2e.invalid/foreign',
    });
    // These are rejected before any await, so a later valid save is a reliable settle point.
    await clickMenuItem(extensionWorker, { menuItemId, linkUrl: 'https://e2e.invalid/valid' });

    await expect.poll(() => savedIn(extensionWorker, target.folderId)).toHaveLength(1);
    expect(await savedIn(extensionWorker, target.folderId)).toEqual([
      { title: 'E2E Article Page', url: 'https://e2e.invalid/valid', index: 0 },
    ]);
  });

  test('turning the context menu off removes it and ignores stale clicks until it is back', async ({
    extensionWorker,
  }) => {
    const target = await seedFolder(extensionWorker, 'E2E Menu Toggle', []);
    const menuItemId = recentId(target.folderId);
    await recordMenu(extensionWorker);
    await seedRecentFolders(extensionWorker, [{ id: target.folderId, title: 'E2E Menu Toggle' }]);
    await expect.poll(() => isRegistered(extensionWorker, menuItemId)).toBe(true);
    const barBefore = await savedIn(extensionWorker, '1');

    await setSettings(extensionWorker, { contextMenuEnabled: false });
    await expect.poll(() => menuEntries(extensionWorker)).toEqual([]);
    expect(await isRegistered(extensionWorker, ROOT_ID)).toBe(false);
    expect(await isRegistered(extensionWorker, menuItemId)).toBe(false);

    // A menu that was already open when the setting changed can still deliver a click. Its
    // settings read is queued before the re-enable below, so it must see the disabled state.
    await clickMenuItem(extensionWorker, { menuItemId, linkUrl: 'https://e2e.invalid/while-off' });

    await setSettings(extensionWorker, { contextMenuEnabled: true });
    await expect.poll(() => isRegistered(extensionWorker, menuItemId)).toBe(true);
    await clickMenuItem(extensionWorker, { menuItemId, linkUrl: 'https://e2e.invalid/while-on' });

    await expect.poll(() => savedIn(extensionWorker, target.folderId)).toHaveLength(1);
    expect((await savedIn(extensionWorker, target.folderId))[0].url).toBe(
      'https://e2e.invalid/while-on',
    );
    expect(await savedIn(extensionWorker, '1')).toEqual(barBefore);
  });

  test('renaming, deleting, or hiding recent folders rebuilds the menu', async ({
    extensionWorker,
  }) => {
    const kept = await seedFolder(extensionWorker, 'E2E Menu Kept', []);
    const renamed = await seedFolder(extensionWorker, 'E2E Menu Rename Me', []);
    const doomed = await seedFolder(extensionWorker, 'E2E Menu Doomed', [
      { title: 'Doomed Child Folder', children: [] },
    ]);
    const doomedChildId = doomed.ids['Doomed Child Folder'];
    await recordMenu(extensionWorker);
    await seedRecentFolders(extensionWorker, [
      { id: kept.folderId, title: 'E2E Menu Kept' },
      { id: renamed.folderId, title: 'E2E Menu Rename Me' },
      { id: doomedChildId, title: 'Doomed Child Folder' },
    ]);
    await expect
      .poll(() => menuChildren(extensionWorker, RECENT_CATEGORY_ID))
      .toEqual([
        `${recentId(kept.folderId)}: E2E Menu Kept`,
        `${recentId(renamed.folderId)}: E2E Menu Rename Me`,
        `${recentId(doomedChildId)}: Doomed Child Folder`,
      ]);

    await extensionWorker.evaluate(
      (id) => chrome.bookmarks.update(id, { title: 'E2E Menu Renamed' }),
      renamed.folderId,
    );
    await expect
      .poll(() => menuChildren(extensionWorker, RECENT_CATEGORY_ID))
      .toEqual([
        `${recentId(kept.folderId)}: E2E Menu Kept`,
        `${recentId(renamed.folderId)}: E2E Menu Renamed`,
        `${recentId(doomedChildId)}: Doomed Child Folder`,
      ]);

    // Removing an ancestor drops the recent subfolder inside it.
    await extensionWorker.evaluate((id) => chrome.bookmarks.removeTree(id), doomed.folderId);
    await expect
      .poll(() => menuChildren(extensionWorker, RECENT_CATEGORY_ID))
      .toEqual([
        `${recentId(kept.folderId)}: E2E Menu Kept`,
        `${recentId(renamed.folderId)}: E2E Menu Renamed`,
      ]);
    expect(await isRegistered(extensionWorker, recentId(doomedChildId))).toBe(false);

    await setSettings(extensionWorker, { recentFoldersMax: 1 });
    await expect
      .poll(() => menuChildren(extensionWorker, RECENT_CATEGORY_ID))
      .toEqual([`${recentId(kept.folderId)}: E2E Menu Kept`]);

    await setSettings(extensionWorker, { recentFoldersEnabled: false });
    await expect
      .poll(() => menuChildren(extensionWorker, ROOT_ID))
      .toEqual([`${BOOKMARKS_BAR_ITEM_ID}: 📚 Bookmarks Bar`]);
    expect(await isRegistered(extensionWorker, RECENT_CATEGORY_ID)).toBe(false);
    expect(await isRegistered(extensionWorker, recentId(kept.folderId))).toBe(false);
  });
});
