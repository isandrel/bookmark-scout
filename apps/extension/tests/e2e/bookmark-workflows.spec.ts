import { readFile } from 'node:fs/promises';
import type { Locator, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';

type SeedItem = { title: string; url?: string; children?: SeedItem[] };

async function seedFolder(worker: Worker, title: string, items: SeedItem[]) {
  return worker.evaluate(
    async ({ folderTitle, entries }) => {
      const [root] = await chrome.bookmarks.getTree();
      const writableRoot = root.children?.find((node) => node.children !== undefined);
      if (!writableRoot) throw new Error('No writable bookmark root found');

      const folder = await chrome.bookmarks.create({
        parentId: writableRoot.id,
        title: folderTitle,
      });
      const ids: Record<string, string> = {};

      const createItems = async (parentId: string, nodes: SeedItem[]) => {
        for (const node of nodes) {
          const created = await chrome.bookmarks.create({
            parentId,
            title: node.title,
            ...(node.url ? { url: node.url } : {}),
          });
          ids[node.title] = created.id;
          if (node.children) await createItems(created.id, node.children);
        }
      };

      await createItems(folder.id, entries);
      return {
        folderId: folder.id,
        ids,
        writableRootTitle: writableRoot.title || 'Untitled',
      };
    },
    { folderTitle: title, entries: items },
  );
}

function bookmarkPageUrl(extensionId: string, folderId: string) {
  return `chrome-extension://${extensionId}/bookmarks.html?id=${folderId}`;
}

function toolCard(page: Page, title: string): Locator {
  return page
    .getByRole('heading', { name: title, exact: true })
    .locator('..')
    .locator('..')
    .locator('..')
    .locator('..');
}

test('opens the popup and finds a bookmark through search', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Popup', [
    { title: 'Popup Match', url: 'https://example.com/popup-match' },
    { title: 'Different Link', url: 'https://example.com/different' },
  ]);

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const search = page.getByPlaceholder('Search bookmarks...');
  await expect(search).toBeVisible();
  await search.fill('Popup Match');
  await expect(page.getByText('Popup Match', { exact: true })).toBeVisible();
  await expect(page.getByText('Different Link', { exact: true })).toHaveCount(0);
});

test('side panel search and dark mode persist across reload', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Side Panel', [
    { title: 'Side Panel Match', url: 'https://example.com/side-panel' },
  ]);

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const search = page.getByPlaceholder('Search bookmarks...');
  await expect(search).toBeVisible();
  await search.fill('Side Panel Match');
  await expect(page.getByText('Side Panel Match', { exact: true })).toBeVisible();

  await page.getByTitle('Dark mode').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByTitle('Light mode')).toBeVisible();
});

test('popup uses selected Japanese and Korean language settings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Locales', [
    { title: 'Locale Delete', url: 'https://example.com/locale-delete' },
  ]);
  const setLanguage = (language: 'ja' | 'ko') =>
    extensionWorker.evaluate(async (selectedLanguage) => {
      const key = 'bookmark-scout-settings';
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({
        [key]: { ...(stored[key] ?? {}), language: selectedLanguage, confirmBeforeDelete: true },
      });
    }, language);

  const openDeleteDialog = async (
    placeholder: string,
    dialogTitle: string,
    cancelLabel: string,
  ) => {
    await page.getByPlaceholder(placeholder).fill('Locale Delete');
    const bookmarkRow = page.locator('.bookmark-item').filter({ hasText: 'Locale Delete' });
    await expect(bookmarkRow).toBeVisible();
    await bookmarkRow.hover();
    await bookmarkRow.getByTitle('Delete bookmark').click();
    const dialog = page.getByRole('dialog', { name: dialogTitle });
    await expect(dialog).toContainText('Locale Delete');
    await dialog.getByRole('button', { name: cancelLabel }).click();
  };

  await setLanguage('ja');
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByPlaceholder('ブックマークを検索...')).toBeVisible();
  await openDeleteDialog('ブックマークを検索...', 'ブックマークを削除', 'キャンセル');

  await setLanguage('ko');
  await page.reload();
  await expect(page.getByPlaceholder('북마크 검색...')).toBeVisible();
  await openDeleteDialog('북마크 검색...', '북마크 삭제', '취소');
  await expect
    .poll(() => extensionWorker.evaluate(async (id) => chrome.bookmarks.get(id), folder.ids['Locale Delete']))
    .toHaveLength(1);
});

test('updates popup ordering from synced settings and creates a folder', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Popup Actions', [
    { title: 'Zulu Link', url: 'https://example.com/zulu' },
    { title: 'Alpha Link', url: 'https://example.com/alpha' },
  ]);

  const setSortOrder = (order: 'alphabetical' | 'folders') =>
    extensionWorker.evaluate(async (sortOrder) => {
      const key = 'bookmark-scout-settings';
      const stored = await chrome.storage.sync.get(key);
      await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), sortOrder } });
    }, order);

  const visibleLinkOrder = async () => {
    const text = await page.locator('body').innerText();
    return ['Zulu Link', 'Alpha Link'].sort(
      (left, right) => text.indexOf(left) - text.indexOf(right),
    );
  };

  await setSortOrder('alphabetical');
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.locator('.accordion-item').first().locator('.folder-item').first().click();
  await page.getByText('E2E Popup Actions', { exact: true }).click();
  await expect.poll(visibleLinkOrder).toEqual(['Alpha Link', 'Zulu Link']);

  await setSortOrder('folders');
  await expect.poll(visibleLinkOrder).toEqual(['Zulu Link', 'Alpha Link']);

  const folderTrigger = page
    .locator('.folder-item')
    .filter({ hasText: 'E2E Popup Actions' })
    .first();
  await folderTrigger.hover();
  await folderTrigger.getByTitle('Add folder').click();
  await page.getByPlaceholder('Enter folder name...').fill('Created in Popup');
  await page.getByPlaceholder('Enter folder name...').press('Enter');

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.some((item) => item.title === 'Created in Popup' && !item.url);
      }, folder.folderId),
    )
    .toBe(true);
});

test('confirms bookmark and folder deletion, and cancels without changing the tree', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Delete', [
    { title: 'Delete Me', url: 'https://example.com/delete-me' },
    { title: 'Keep Me', url: 'https://example.com/keep-me' },
    {
      title: 'Removable Folder',
      children: [{ title: 'Nested Delete', url: 'https://example.com/nested-delete' }],
    },
  ]);

  await extensionWorker.evaluate(async () => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({
      [key]: { ...(stored[key] ?? {}), confirmBeforeDelete: true },
    });
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('Delete Me');
  const bookmarkRow = page.locator('.bookmark-item').filter({ hasText: 'Delete Me' });
  await expect(bookmarkRow).toBeVisible();
  await bookmarkRow.hover();
  await bookmarkRow.getByTitle('Delete bookmark').click();

  const bookmarkDialog = page.getByRole('dialog', { name: 'Delete bookmark' });
  await expect(bookmarkDialog).toContainText('Delete Me');
  await expect
    .poll(() => extensionWorker.evaluate(async (id) => chrome.bookmarks.get(id), folder.ids['Delete Me']))
    .toHaveLength(1);
  await bookmarkDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(bookmarkDialog).toHaveCount(0);
  await expect(bookmarkRow).toBeVisible();
  await expect
    .poll(() => extensionWorker.evaluate(async (id) => chrome.bookmarks.get(id), folder.ids['Delete Me']))
    .toHaveLength(1);

  await bookmarkRow.hover();
  await bookmarkRow.getByTitle('Delete bookmark').click();
  await bookmarkDialog.getByRole('button', { name: 'Delete bookmark' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.some((item) => item.title === 'Delete Me');
      }, folder.folderId),
    )
    .toBe(false);
  await expect(bookmarkRow).toHaveCount(0);

  await search.fill('Removable Folder');
  const folderRow = page.locator('.folder-item').filter({ hasText: 'Removable Folder' }).first();
  await expect(folderRow).toBeVisible();
  await folderRow.hover();
  await folderRow.getByTitle('Delete folder').click();

  const folderDialog = page.getByRole('dialog', { name: 'Delete folder' });
  await expect(folderDialog).toContainText('Removable Folder');
  await expect(folderDialog).toContainText('all its contents');
  await folderDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(folderDialog).toHaveCount(0);
  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => chrome.bookmarks.getChildren(id), folder.ids['Removable Folder']),
    )
    .toHaveLength(1);

  await folderRow.hover();
  await folderRow.getByTitle('Delete folder').click();
  await folderDialog.getByRole('button', { name: 'Delete folder' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.map((item) => item.title);
      }, folder.folderId),
    )
    .toEqual(['Keep Me']);
});

test('deletes bookmarks and folders immediately when confirmation is disabled', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Immediate Delete', [
    { title: 'Immediate Bookmark', url: 'https://example.com/immediate' },
    { title: 'Immediate Folder', children: [{ title: 'Nested', url: 'https://example.com/nested' }] },
  ]);

  await extensionWorker.evaluate(async () => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({
      [key]: { ...(stored[key] ?? {}), confirmBeforeDelete: false },
    });
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('Immediate Bookmark');
  const bookmarkRow = page.locator('.bookmark-item').filter({ hasText: 'Immediate Bookmark' });
  await expect(bookmarkRow).toBeVisible();
  await bookmarkRow.hover();
  await bookmarkRow.getByTitle('Delete bookmark').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.some((item) => item.title === 'Immediate Bookmark');
      }, folder.folderId),
    )
    .toBe(false);

  await search.fill('Immediate Folder');
  const folderRow = page.locator('.folder-item').filter({ hasText: 'Immediate Folder' }).first();
  await expect(folderRow).toBeVisible();
  await folderRow.hover();
  await folderRow.getByTitle('Delete folder').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(() => extensionWorker.evaluate(async (id) => chrome.bookmarks.getChildren(id), folder.folderId))
    .toEqual([]);
});

test('undo restores a deleted bookmark and its nested folder tree at the original positions', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Recover Delete', [
    { title: 'Recover Bookmark', url: 'https://example.com/recover-bookmark' },
    {
      title: 'Recover Folder',
      children: [
        {
          title: 'Recover Child Folder',
          children: [{ title: 'Recover Deep Bookmark', url: 'https://example.com/recover-deep' }],
        },
      ],
    },
    { title: 'Recovery Anchor', url: 'https://example.com/recovery-anchor' },
  ]);

  await extensionWorker.evaluate(async () => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({
      [key]: { ...(stored[key] ?? {}), confirmBeforeDelete: true },
    });
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('Recover Bookmark');
  const bookmarkRow = page.locator('.bookmark-item').filter({ hasText: 'Recover Bookmark' });
  await bookmarkRow.hover();
  await bookmarkRow.getByTitle('Delete bookmark').click();
  await page
    .getByRole('dialog', { name: 'Delete bookmark' })
    .getByRole('button', { name: 'Delete bookmark' })
    .click();
  const notifications = page.getByRole('region', { name: 'Notifications (F8)' });
  await expect(
    notifications.getByText('Deleted "Recover Bookmark". Undo within 10 seconds.', { exact: true }),
  ).toBeVisible();
  await expect(notifications.getByText(/browser-generated|original IDs/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(notifications.getByText('Restored "Recover Bookmark".', { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.map((item) => item.title);
      }, folder.folderId),
    )
    .toEqual(['Recover Bookmark', 'Recover Folder', 'Recovery Anchor']);

  await search.fill('Recover Folder');
  const folderRow = page.locator('.folder-item').filter({ hasText: 'Recover Folder' }).first();
  await folderRow.hover();
  await folderRow.getByTitle('Delete folder').click();
  await page
    .getByRole('dialog', { name: 'Delete folder' })
    .getByRole('button', { name: 'Delete folder' })
    .click();
  await page.getByRole('button', { name: 'Undo' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        const restored = children.find((item) => item.title === 'Recover Folder');
        if (!restored) return [];
        const [tree] = await chrome.bookmarks.getSubTree(restored.id);
        return [
          tree.title,
          tree.children?.[0]?.title,
          tree.children?.[0]?.children?.[0]?.title,
          tree.children?.[0]?.children?.[0]?.url,
        ];
      }, folder.folderId),
    )
    .toEqual([
      'Recover Folder',
      'Recover Child Folder',
      'Recover Deep Bookmark',
      'https://example.com/recover-deep',
    ]);
});

test('only the latest repeated deletion is recoverable and missing parents fail safely', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Recovery Limits', [
    { title: 'First Deleted', url: 'https://example.com/first-deleted' },
    { title: 'Second Deleted', url: 'https://example.com/second-deleted' },
    {
      title: 'Conflict Parent',
      children: [{ title: 'Conflict Child', url: 'https://example.com/conflict-child' }],
    },
  ]);

  await extensionWorker.evaluate(async () => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({
      [key]: { ...(stored[key] ?? {}), confirmBeforeDelete: false },
    });
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const search = page.getByPlaceholder('Search bookmarks...');
  const deleteBookmark = async (title: string) => {
    await search.fill(title);
    const row = page.locator('.bookmark-item').filter({ hasText: title });
    await expect(row).toBeVisible();
    await row.hover();
    await row.getByTitle('Delete bookmark').click();
  };

  await deleteBookmark('First Deleted');
  await deleteBookmark('Second Deleted');
  await expect(
    page
      .getByRole('region', { name: 'Notifications (F8)' })
      .getByText('Deleted "Second Deleted". Undo within 10 seconds.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.map((item) => item.title);
      }, folder.folderId),
    )
    .toEqual(['Second Deleted', 'Conflict Parent']);

  await deleteBookmark('Conflict Child');
  await extensionWorker.evaluate(
    async (id) => new Promise<void>((resolve) => chrome.bookmarks.removeTree(id, () => resolve())),
    folder.ids['Conflict Parent'],
  );
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Notifications (F8)' })
      .getByText('The original folder no longer exists, so this item cannot be restored.'),
  ).toBeVisible();
  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.map((item) => item.title);
      }, folder.folderId),
    )
    .toEqual(['Second Deleted']);
});

test('navigates folders and filters bookmarks by title and URL', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Collection', [
    { title: 'Alpha Item', url: 'https://example.com/alpha' },
    { title: 'Beta Item', url: 'https://example.com/beta' },
    {
      title: 'Nested Folder',
      children: [{ title: 'Inside Nested', url: 'https://example.com/nested' }],
    },
  ]);

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(3);

  await page.getByPlaceholder('Filter titles...').fill('alpha');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Alpha Item');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(rows).toHaveCount(3);

  await page.getByPlaceholder('Filter URLs...').fill('example.com/beta');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Beta Item');
  await page.getByRole('button', { name: 'Reset' }).click();

  await rows.filter({ hasText: 'Nested Folder' }).click();
  await expect(page).toHaveURL(new RegExp(`id=${folder.ids['Nested Folder']}$`));
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Inside Nested');

  await page.locator('nav').getByRole('button', { name: 'E2E Collection' }).click();
  await expect(page).toHaveURL(new RegExp(`id=${folder.folderId}$`));
  await expect(rows).toHaveCount(3);
});

test('manager filters globally across nested folders or only the selected folder', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const local = await seedFolder(extensionWorker, 'E2E Scope Local', [
    { title: 'Shared Target Local', url: 'https://example.com/local-target' },
    {
      title: 'Inner Scope',
      children: [{ title: 'Shared Target Nested', url: 'https://example.com/nested-target' }],
    },
  ]);
  const remote = await seedFolder(extensionWorker, 'E2E Scope Remote', [
    { title: 'Shared Target Remote', url: 'https://example.com/remote-target' },
  ]);

  await page.goto(bookmarkPageUrl(extensionId, local.folderId));
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Shared Target Nested' })).toHaveCount(0);

  await page.getByPlaceholder('Filter titles...').fill('Shared Target');
  await expect(rows).toHaveCount(3);
  await expect(
    rows
      .filter({ hasText: 'Shared Target Nested' })
      .getByTitle(`${local.writableRootTitle} / E2E Scope Local / Inner Scope`, { exact: true }),
  ).toBeVisible();
  await expect(
    rows
      .filter({ hasText: 'Shared Target Remote' })
      .getByTitle(`${remote.writableRootTitle} / E2E Scope Remote`, { exact: true }),
  ).toBeVisible();

  await page.getByRole('checkbox', { name: 'Current folder only' }).check();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Shared Target Local');
  await expect(rows.filter({ hasText: 'Shared Target Nested' })).toHaveCount(0);
  await expect(rows.filter({ hasText: 'Shared Target Remote' })).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Current folder only' }).uncheck();
  await expect(rows).toHaveCount(3);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Inner Scope' })).toHaveCount(1);

  await page.getByPlaceholder('Filter URLs...').fill('remote-target');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Shared Target Remote');
  await page.getByRole('checkbox', { name: 'Current folder only' }).check();
  await expect(rows.filter({ hasText: 'Shared Target Remote' })).toHaveCount(0);
  await expect(page.getByText('No results.', { exact: true })).toBeVisible();
});

test('keeps full titles and URLs available past the former truncation limits', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const commonTitle = 'Common bookmark prefix '.repeat(2);
  const zuluTitle = `${commonTitle}Zulu`;
  const alphaTitle = `${commonTitle}Alpha`;
  const longUrl = `https://example.com/${'segment-'.repeat(8)}tail-marker`;
  const folder = await seedFolder(extensionWorker, 'E2E Full Values', [
    { title: zuluTitle, url: longUrl },
    { title: alphaTitle, url: 'https://example.com/short' },
  ]);
  await extensionWorker.evaluate(async () => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), sortOrder: 'alphabetical' } });
  });

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(alphaTitle);
  await expect(rows.nth(1).getByTitle(zuluTitle, { exact: true })).toBeVisible();
  await expect(rows.nth(1).getByTitle(longUrl, { exact: true })).toBeVisible();

  await page.getByPlaceholder('Filter titles...').fill('Zulu');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(zuluTitle);
  await page.getByRole('button', { name: 'Reset' }).click();

  await page.getByPlaceholder('Filter URLs...').fill('tail-marker');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(zuluTitle);
  const persistedOrder = await extensionWorker.evaluate(async (id) => {
    const children = await chrome.bookmarks.getChildren(id);
    return children.map((item) => item.title);
  }, folder.folderId);
  expect(persistedOrder).toEqual([zuluTitle, alphaTitle]);
});

test('opens full details for the selected manager item without changing it', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const title = 'Detailed Bookmark';
  const url = 'https://example.com/details?source=e2e';
  const folder = await seedFolder(extensionWorker, 'E2E Details', [{ title, url }]);
  const bookmarkId = folder.ids[title];
  const before = await extensionWorker.evaluate(async (id) => {
    const [bookmark] = await chrome.bookmarks.get(id);
    return bookmark;
  }, bookmarkId);

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  const row = page.locator('tbody tr').filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'View Details' }).click();

  const dialog = page.getByRole('dialog', { name: 'Bookmark Details' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('bookmark-details-name')).toHaveText(title);
  await expect(dialog.getByTestId('bookmark-details-url')).toHaveText(url);
  await expect(dialog.getByTestId('bookmark-details-path')).toContainText('E2E Details');
  await expect(dialog.getByTestId('bookmark-details-added').locator('time')).toHaveCount(1);
  await expect(dialog.getByTestId('bookmark-details-modified')).toHaveText('Not available');
  await expect(dialog.getByTestId('bookmark-details-id')).toHaveText(bookmarkId);
  await expect(dialog.getByRole('button', { name: 'Copy URL' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copy ID' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Open link' })).toHaveAttribute('href', url);

  const after = await extensionWorker.evaluate(async (id) => {
    const [bookmark] = await chrome.bookmarks.get(id);
    return bookmark;
  }, bookmarkId);
  expect(after).toEqual(before);
});

test('moves a bookmark with the table controls and persists the new order', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Reorder', [
    { title: 'First Link', url: 'https://example.com/first' },
    { title: 'Second Link', url: 'https://example.com/second' },
    { title: 'Third Link', url: 'https://example.com/third' },
  ]);

  await extensionWorker.evaluate(async () => {
    const key = 'bookmark-scout-settings';
    const stored = await chrome.storage.sync.get(key);
    await chrome.storage.sync.set({ [key]: { ...(stored[key] ?? {}), sortOrder: 'folders' } });
  });

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('First Link');

  // Moves are only offered while the table shows the browser's own order.
  const firstRow = rows.filter({ hasText: 'First Link' });
  await expect(firstRow.getByRole('button', { name: 'Move down' })).toBeDisabled();
  await page.getByRole('button', { name: 'Browser order' }).click();
  await firstRow.hover();
  await firstRow.getByRole('button', { name: 'Move down' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.map((item) => item.title);
      }, folder.folderId),
    )
    .toEqual(['Second Link', 'First Link', 'Third Link']);
  await expect(rows.nth(0)).toContainText('Second Link');
});

test('previews and applies duplicate and URL cleanup tools', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Maintenance', [
    { title: 'Duplicate One', url: 'https://example.com/duplicate' },
    { title: 'Duplicate Two', url: 'https://example.com/duplicate' },
    { title: 'Tracked Link', url: 'https://example.com/page?utm_source=e2e&keep=yes' },
  ]);

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByTitle('Show tools').click();

  await toolCard(page, 'Duplicate Cleaner').getByRole('button', { name: 'Scan' }).click();
  const duplicates = page.getByRole('dialog', { name: 'Duplicate Cleaner' });
  await expect(duplicates).toContainText('Duplicate One');
  await expect(duplicates).toContainText('Duplicate Two');
  await duplicates.getByRole('button', { name: 'Remove duplicates' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.filter((item) => item.url === 'https://example.com/duplicate').length;
      }, folder.folderId),
    )
    .toBe(1);

  await toolCard(page, 'URL Cleaner').getByRole('button', { name: 'Clean' }).click();
  const cleaner = page.getByRole('dialog', { name: 'URL Cleaner' });
  await expect(cleaner).toContainText('Tracked Link');
  await expect(cleaner).toContainText('utm_source=e2e');
  await cleaner.getByRole('button', { name: 'Apply Changes' }).click();

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const [bookmark] = await chrome.bookmarks.get(id);
        return bookmark.url;
      }, folder.ids['Tracked Link']),
    )
    .toBe('https://example.com/page?keep=yes');
});

test('reports scoped statistics and privacy findings', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Reports', [
    { title: 'Safe Link', url: 'https://example.com/safe' },
    { title: 'Privacy Link', url: 'https://example.com/private?token=fixture' },
  ]);

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByTitle('Show tools').click();

  await toolCard(page, 'Bookmark Statistics').getByRole('button', { name: 'View' }).click();
  const statistics = page.getByRole('dialog', { name: 'Bookmark Statistics' });
  await expect(statistics).toContainText('Bookmarks');
  await expect(statistics).toContainText('2');
  await page.keyboard.press('Escape');

  await toolCard(page, 'Privacy Scanner').getByRole('button', { name: 'Scan' }).click();
  const privacy = page.getByRole('dialog', { name: 'Privacy Scanner' });
  await expect(privacy).toContainText('Privacy Link');
  await expect(privacy).toContainText('Sensitive query parameter: token');
});

test('exports and imports bookmark data without manual file handling', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'E2E Data', [
    { title: 'Exported Link', url: 'https://example.com/exported' },
  ]);

  await page.goto(bookmarkPageUrl(extensionId, folder.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByTitle('Show tools').click();

  const exportCard = toolCard(page, 'Export Bookmarks');
  await exportCard.getByRole('combobox').click();
  await page.getByRole('option', { name: 'JSON' }).click();
  const downloadPromise = page.waitForEvent('download');
  await exportCard.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    children: SeedItem[];
  };
  expect(JSON.stringify(exported)).toContain('Exported Link');

  await page.locator('#bookmark-import-input').setInputFiles({
    name: 'e2e-import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([{ title: 'Imported Link', url: 'https://example.com/imported' }]),
    ),
  });

  await expect
    .poll(() =>
      extensionWorker.evaluate(async (id) => {
        const children = await chrome.bookmarks.getChildren(id);
        return children.some(
          (item) => item.title === 'Imported Link' && item.url === 'https://example.com/imported',
        );
      }, folder.folderId),
    )
    .toBe(true);

  await page.reload();
  await expect(page.locator('tbody tr').filter({ hasText: 'Imported Link' })).toHaveCount(1);
});
