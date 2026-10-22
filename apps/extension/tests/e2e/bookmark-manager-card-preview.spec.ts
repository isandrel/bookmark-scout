/**
 * A bookmark's preview in the manager's cards (Visual Cards V18): the preview key on a focused
 * card and the card's menu open it; it shows the stored cover, folder, tags, and summary without
 * any network request, keeps focus inside while open, closes with Escape, and gives focus back to
 * the card. Its buttons are the registry's actions. The arrow keys and its Previous and Next buttons
 * step through the page's bookmarks, and closing returns to the card last shown.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { managerUrl, seedCover, waitForNoOverlay } from './manager-helpers';
import { STORAGE_ITEMS, setSettings, writeStored } from './storage';
import { seedFolder } from './tool-helpers';

test.use({ viewport: { width: 1400, height: 900 } });

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

test('the arrow keys and Previous and Next step the preview through the bookmarks, past folders, and Escape returns to the last one', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Preview Steps', [
    { title: 'Step One', url: 'https://one.e2e.invalid/step' },
    { title: 'Step Folder', children: [] },
    { title: 'Step Two', url: 'https://two.e2e.invalid/step' },
    { title: 'Step Three', url: 'https://three.e2e.invalid/step' },
  ]);
  await setSettings(extensionWorker, { managerViewMode: 'cards' });
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await card(page, 'Step One').click();
  await expect(card(page, 'Step One')).toBeFocused();
  await page.keyboard.press('p');

  const preview = page.getByTestId('bookmark-preview');
  const shows = (title: string) => expect(page.getByRole('dialog', { name: title })).toBeVisible();
  const previous = preview.getByRole('button', { name: 'Previous bookmark' });
  const next = preview.getByRole('button', { name: 'Next bookmark' });
  await shows('Step One');
  // The first bookmark has nothing before it.
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await page.keyboard.press('ArrowLeft');
  await shows('Step One');

  // Right goes past the folder to the next bookmark, with its own address and buttons.
  await page.keyboard.press('ArrowRight');
  await shows('Step Two');
  await expect(preview).toContainText('https://two.e2e.invalid/step');
  await expect(previous).toBeEnabled();

  // Next by pointer, to the last bookmark, where Next is disabled but keeps focus.
  await next.click();
  await shows('Step Three');
  await expect(next).toBeDisabled();
  await expect(next).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await shows('Step Three');

  // Left from the disabled button, and Previous, go back, again past the folder.
  await page.keyboard.press('ArrowLeft');
  await shows('Step Two');
  await previous.click();
  await shows('Step One');
  await page.keyboard.press('ArrowRight');
  await shows('Step Two');

  // Escape returns to the card last shown, which the manager now has focused and selected, so
  // the preview key opens it again.
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  await expect(card(page, 'Step Two')).toBeFocused();
  await expect(card(page, 'Step Two')).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, 'Step One')).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('p');
  await shows('Step Two');
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  await expect(card(page, 'Step Two')).toBeFocused();
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
