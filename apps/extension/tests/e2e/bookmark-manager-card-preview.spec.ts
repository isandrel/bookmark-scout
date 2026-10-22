/**
 * A bookmark's preview in the manager's cards (Visual Cards V18): the preview key on a focused
 * card and the card's menu open it; it shows the stored cover, folder, tags, and summary without
 * any network request, keeps focus inside while open, closes with Escape, and gives focus back to
 * the card. Its buttons are the registry's actions.
 */
import type { Page, Worker } from '@playwright/test';
import { solidPng } from '../solid-png';
import { expect, test } from './fixtures';
import { managerUrl, waitForNoOverlay } from './manager-helpers';
import { STORAGE_ITEMS, setSettings, writeStored } from './storage';
import { seedFolder } from './tool-helpers';

test.use({ viewport: { width: 1400, height: 900 } });

/** Stores a cover for the bookmark as Fetch Covers would, in the extension's covers database. */
async function seedCover(worker: Worker, bookmarkId: string, url: string) {
  const png = solidPng(600, 314).toString('base64');
  await worker.evaluate(
    async ({ id, address, data }) => {
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
          width: 600,
          height: 314,
          bytes: bytes.byteLength,
          savedAt: Date.now(),
          version: 1,
        });
        transaction
          .objectStore('images')
          .put({ bookmarkId: id, type: 'image/png', data: bytes.buffer });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    },
    { id: bookmarkId, address: url, data: png },
  );
}

const cardsOf = (page: Page) => page.getByTestId('bookmark-cards');
const card = (page: Page, title: string) =>
  cardsOf(page).locator('[data-slot="bookmark-card"]').filter({ hasText: title });

/** Whether keyboard focus is inside the preview dialog. */
const focusInside = (page: Page) =>
  page
    .getByTestId('bookmark-preview')
    .evaluate((dialog) => dialog.contains(document.activeElement));

test('the preview key opens a card preview from this device that keeps focus, and Escape gives it back', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Preview', [
    { title: 'Inner', children: [] },
    { title: 'Card One', url: 'https://one.e2e.invalid/a' },
    { title: 'Card Two', url: 'https://two.e2e.invalid/b' },
    { title: 'Card Three', url: 'https://three.e2e.invalid/c' },
  ]);
  const twoId = seeded.ids['Card Two'];
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [twoId]: { tags: ['reading', 'design'], summary: 'A short summary of the second card.' },
  });
  await seedCover(extensionWorker, twoId, 'https://two.e2e.invalid/b');
  await setSettings(extensionWorker, { managerViewMode: 'cards' });
  // Nothing the preview shows comes from the network.
  const webRequests: string[] = [];
  context.on('request', (request) => {
    if (/^https?:/.test(request.url())) webRequests.push(request.url());
  });

  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(cardsOf(page)).toBeVisible();
  await card(page, 'Card One').click();
  await page.keyboard.press('ArrowRight');
  await expect(card(page, 'Card Two')).toBeFocused();

  await page.keyboard.press('p');
  const dialog = page.getByRole('dialog', { name: 'Card Two' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('bookmark-cover')).toHaveAttribute('src', /^blob:/);
  await expect(dialog).toContainText('https://two.e2e.invalid/b');
  await expect(dialog.getByTestId('bookmark-preview-folder')).toContainText('E2E Preview');
  await expect(dialog.getByTestId('bookmark-preview-tags').getByRole('listitem')).toHaveText([
    'reading',
    'design',
  ]);
  await expect(dialog.getByTestId('bookmark-preview-summary')).toHaveText(
    'A short summary of the second card.',
  );
  await expect(dialog.getByRole('button')).toContainText([
    'Open in new tab',
    'Copy',
    'Edit',
    'Close',
  ]);

  // Focus starts inside and stays there, forward and back: past the last control it wraps to the
  // first. The trap's edge catches focus for a moment before moving it, so each check waits.
  await expect.poll(() => focusInside(page)).toBe(true);
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab');
    await expect.poll(() => focusInside(page)).toBe(true);
  }
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => focusInside(page)).toBe(true);
  }
  const address = dialog.getByRole('link', { name: 'https://two.e2e.invalid/b' });
  await address.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(address).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(card(page, 'Card Two')).toBeFocused();
  // The preview leaves the selection as it was.
  await expect(card(page, 'Card Two')).toHaveAttribute('aria-selected', 'true');
  expect(webRequests).toEqual([]);

  // A folder has nothing to preview, and the key leaves it alone.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('p');
  await expect(page.getByTestId('bookmark-preview')).toHaveCount(0);
});

test("a card's menu opens its preview from the keyboard, and its buttons run the registry's actions", async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Preview Menu', [
    { title: 'Menu Card', url: 'https://menu.e2e.invalid/card' },
  ]);
  await setSettings(extensionWorker, { managerViewMode: 'cards' });
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const menuCard = card(page, 'Menu Card');
  await menuCard.click();
  await expect(menuCard).toBeFocused();

  // The card's ⋯ button is reachable with Tab, and its menu offers Preview.
  const menuButton = menuCard.getByRole('button', { name: 'Open menu' });
  for (let step = 0; step < 4; step += 1) {
    if (await menuButton.evaluate((button) => button === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(menuButton).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Preview' }).press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Menu Card' });
  await expect(dialog).toBeVisible();
  // No stored cover: none is drawn, and nothing is downloaded for one.
  await expect(dialog.getByTestId('bookmark-cover')).toHaveCount(0);
  await expect(dialog.getByTestId('bookmark-preview-tags')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Back on the card, although the menu that opened the preview is gone.
  await expect(menuCard).toBeFocused();

  // Edit is the registry's Edit: the preview closes, the edit dialog opens, and closing it
  // returns to the card.
  await page.keyboard.press('p');
  await dialog.getByRole('button', { name: 'Edit' }).click();
  await expect(dialog).toBeHidden();
  const edit = page.getByRole('dialog', { name: 'Edit bookmark' });
  await expect(edit).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(edit).toBeHidden();
  await expect(menuCard).toBeFocused();

  // Open in new tab opens the bookmark, as the menu's Open in new tab does.
  await waitForNoOverlay(page);
  await page.keyboard.press('p');
  await context.route('https://menu.e2e.invalid/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Menu</title>' }),
  );
  const opened = context.waitForEvent('page');
  await dialog.getByRole('button', { name: 'Open in new tab' }).click();
  await expect.poll(async () => (await opened).url()).toBe('https://menu.e2e.invalid/card');
  await expect(dialog).toBeHidden();
});
