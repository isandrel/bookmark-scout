/**
 * Locators and gestures for the bookmark manager page, shared by specs that drive it.
 */
import type { Locator, Page, Worker } from '@playwright/test';
import { solidPng } from '../solid-png';
import { expect } from './fixtures';
import { STORAGE_ITEMS, type StorageTarget, writeStored } from './storage';

/** The manager's address, showing `folderId` when given. */
export function managerUrl(extensionId: string, folderId?: string) {
  const base = `chrome-extension://${extensionId}/bookmarks.html`;
  return folderId ? `${base}?id=${folderId}` : base;
}

/**
 * Shows these table columns as a user who turned them on under View would; a new view shows only
 * Title, URL, and Date Added. Call before the manager opens.
 */
export async function showTableColumns(target: StorageTarget, columnIds: readonly string[]) {
  await writeStored(target, STORAGE_ITEMS.tableView, {
    columnVisibility: Object.fromEntries(columnIds.map((id) => [id, true])),
  });
}

/** Sets this device's rows per page (the default is 50). Call before the manager opens. */
export async function setTablePageSize(target: StorageTarget, pageSize: number) {
  await writeStored(target, STORAGE_ITEMS.tableLayout, { pageSize });
}

/** The manager's search box, which reads the search query language. */
export function managerSearch(page: Page) {
  return page.getByRole('textbox', { name: 'Search titles, addresses, folders, and tags' });
}

/** The toolbar's Filters menu, which this opens first when it is closed. */
export async function tableFilters(page: Page): Promise<Locator> {
  // A panel still closing (a click outside it, such as Reset) is visible during its exit
  // animation; only an open one counts, or the menu would be gone before it is used.
  const panel = page.locator('[data-testid="table-filters-panel"][data-open]');
  if (!(await panel.isVisible())) await page.getByTestId('table-filters').click();
  await expect(panel).toBeVisible();
  return panel;
}

/** The address filter in the Filters menu. */
export async function addressFilter(page: Page): Promise<Locator> {
  return (await tableFilters(page)).getByPlaceholder('Filter URLs...');
}

/** The Current folder only checkbox in the Filters menu. */
export async function currentFolderOnly(page: Page): Promise<Locator> {
  return (await tableFilters(page)).getByRole('checkbox', { name: 'Current folder only' });
}

/** The chips under the toolbar that name the filters in use. */
export function filterChips(page: Page) {
  return page.getByTestId('table-filter-chips').getByRole('listitem');
}

/**
 * Shows the folder in the browser's order with the toolbar button, for specs that set another
 * Sort Order first (with the default, Browser order, the table already is and the button is off).
 */
export async function showBrowserOrder(page: Page) {
  const button = page.getByRole('button', { name: 'Browser order' });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** The table row whose text includes `title`. */
export function managerRow(page: Page, title: string) {
  return page.locator('tbody tr').filter({ hasText: title });
}

/** A folder in the manager's folder tree, by its exact title. */
export function treeFolder(page: Page, title: string) {
  return page.getByTestId('folder-tree').getByRole('treeitem', { name: title, exact: true });
}

/** The folder the manager shows: the last breadcrumb. */
export function breadcrumbCurrent(page: Page) {
  return page.getByTestId('breadcrumb').locator('[aria-current="page"]');
}

/**
 * Shortcuts wait while a dialog or menu is in the page, and Base UI removes one a frame after it
 * closes (hidden by then, so role queries no longer see it).
 */
export async function waitForNoOverlay(page: Page) {
  await expect(page.locator('[role="dialog"], [role="menu"], [role="listbox"]')).toHaveCount(0);
}

/** Drags `source` onto `target` at `fraction` of the target's height. */
export async function dragOnto(source: Locator, target: Locator, fraction: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Drop target is not visible');
  await source.dragTo(target, {
    sourcePosition: { x: 200, y: 10 },
    targetPosition: { x: Math.min(200, box.width / 2), y: box.height * fraction },
  });
}

/** Where a seeded cover came from and when it was saved, as the cover store records it. */
type SeedCoverInfo = { source: 'page' | 'tab' | 'browse'; savedAt: number };

/**
 * Stores a cover for the bookmark in the extension's covers database, by default as Fetch Covers
 * would (a page's preview image, saved now).
 */
export async function seedCover(
  worker: Worker,
  bookmarkId: string,
  url: string,
  size: { width: number; height: number } = { width: 600, height: 314 },
  info: Partial<SeedCoverInfo> = {},
) {
  const png = solidPng(size.width, size.height).toString('base64');
  await worker.evaluate(
    async ({ id, address, data, width, height, source, savedAt }) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('bookmark-scout-covers', 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore('info', { keyPath: 'bookmarkId' });
          open.result.createObjectStore('images', { keyPath: 'bookmarkId' });
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['info', 'images'], 'readwrite');
        transaction.objectStore('info').put({
          bookmarkId: id,
          url: address,
          width,
          height,
          bytes: bytes.byteLength,
          savedAt: savedAt ?? Date.now(),
          version: 1,
          source,
        });
        transaction
          .objectStore('images')
          .put({ bookmarkId: id, type: 'image/png', data: bytes.buffer });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    },
    {
      id: bookmarkId,
      address: url,
      data: png,
      ...size,
      source: info.source ?? 'page',
      savedAt: info.savedAt ?? null,
    },
  );
}

/** Every stored cover's record (`CoverInfo` in `src/lib/cover-store.ts`), by bookmark id order. */
export async function readCoverInfos(
  worker: Worker,
): Promise<{ bookmarkId: string; url: string; width: number; source: string; savedAt: number }[]> {
  return worker.evaluate(async () => {
    // Opening a database that does not exist would create it empty, without its stores.
    const names = (await indexedDB.databases()).map((db) => db.name);
    if (!names.includes('bookmark-scout-covers')) return [];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('bookmark-scout-covers');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    if (!db.objectStoreNames.contains('info')) {
      db.close();
      return [];
    }
    const records = await new Promise<
      { bookmarkId: string; url: string; width: number; source: string; savedAt: number }[]
    >((resolve, reject) => {
      const request = db.transaction('info').objectStore('info').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records.map(({ bookmarkId, url, width, source, savedAt }) => ({
      bookmarkId,
      url,
      width,
      source,
      savedAt,
    }));
  });
}
