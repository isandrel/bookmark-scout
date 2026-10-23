/**
 * The manager list's Cover column: hidden at first and turned on under View, right after the
 * checkbox; a stored cover shows as a thumbnail that keeps the row's height, rows without one show
 * nothing, and nothing is downloaded. Resting the pointer on a thumbnail, or keyboard focus on it,
 * shows the cover larger after the hover card's open delay (never wider than stored), with the
 * title and where the cover came from; Escape closes it without moving focus, and a click opens
 * the bookmark's preview. Hiding the column under View is kept after a reload.
 */
import type { Page } from '@playwright/test';
import { readConfigToml } from '../config-files';
import { expect, test } from './fixtures';
import { managerRow, managerUrl, seedCover, showTableColumns } from './manager-helpers';
import { readStored, STORAGE_ITEMS, setSettings } from './storage';
import { seedFolder } from './tool-helpers';

const hoverConfig = readConfigToml('ui/hover-card.toml') as {
  open_delay_ms: number;
  cover_preview_max_width_px: number;
};
const tableConfig = readConfigToml('ui/manager-table.toml') as {
  cover_thumbnail_height_px: number;
};

test.use({ viewport: { width: 1400, height: 900 } });

const coverHeader = (page: Page) => page.getByRole('columnheader', { name: 'Cover' });
const previewCard = (page: Page) => page.getByTestId('cover-preview-card');
const thumbnail = (page: Page, title: string) =>
  page.getByRole('button', { name: `Cover of "${title}"`, exact: true });

/**
 * The synced view's Cover column: whether it shows and the column before it. A view back at the
 * defaults is not stored, and the default hides it.
 */
async function storedCoverColumn(page: Page) {
  const view = (await readStored(page, STORAGE_ITEMS.tableView)) as
    | { columnVisibility: Record<string, boolean>; columnOrder: string[] }
    | undefined;
  if (!view) return { shown: false };
  return {
    shown: view.columnVisibility.cover ?? false,
    after: view.columnOrder[view.columnOrder.indexOf('cover') - 1],
  };
}

test('the Cover column shows stored covers as thumbnails, larger on hover or focus, and opens the preview on click', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const seeded = await seedFolder(extensionWorker, 'E2E Cover Column', [
    { title: 'Inner folder', children: [] },
    { title: 'Covered page', url: 'https://covered.e2e.invalid/a' },
    { title: 'Plain page', url: 'https://plain.e2e.invalid/b' },
    { title: 'Small cover page', url: 'https://small.e2e.invalid/c' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  // Wider than the preview's largest size, so the preview caps it.
  await seedCover(
    extensionWorker,
    ids['Covered page'],
    'https://covered.e2e.invalid/a',
    { width: 960, height: 503 },
    { source: 'browse' },
  );
  // Narrower than that size, so the preview keeps it as stored.
  await seedCover(extensionWorker, ids['Small cover page'], 'https://small.e2e.invalid/c', {
    width: 200,
    height: 105,
  });
  const webRequests: string[] = [];
  context.on('request', (request) => {
    if (/^https?:/.test(request.url())) webRequests.push(request.url());
  });

  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(managerRow(page, 'Covered page')).toBeVisible();
  // Hidden at first, so a new view is the plain list.
  await expect(coverHeader(page)).toHaveCount(0);
  await expect(page.getByTestId('bookmark-cover-thumbnail')).toHaveCount(0);
  const rowHeight = async (title: string) =>
    (await managerRow(page, title).boundingBox())?.height ?? 0;
  const heightBefore = await rowHeight('Covered page');

  await page.getByRole('button', { name: 'Customize table view' }).click();
  const item = page.getByRole('menuitemcheckbox', { name: 'Cover' });
  await expect(item).toHaveAttribute('aria-checked', 'false');
  await item.click();
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(coverHeader(page)).toBeVisible();
  // Right after the checkbox, kept with the synced view.
  await expect.poll(() => storedCoverColumn(page)).toEqual({ shown: true, after: 'select' });
  const headerBox = await coverHeader(page).boundingBox();
  const titleHeaderBox = await page.getByRole('columnheader', { name: 'Title' }).boundingBox();
  expect(headerBox?.x ?? 0).toBeLessThan(titleHeaderBox?.x ?? 0);

  // A thumbnail at the cover ratio for each stored cover; the row keeps its height.
  const covered = thumbnail(page, 'Covered page');
  await expect(covered).toBeVisible();
  await expect(covered.locator('img')).toHaveAttribute('src', /^blob:/);
  const box = await covered.boundingBox();
  expect(Math.round(box?.height ?? 0)).toBe(tableConfig.cover_thumbnail_height_px);
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(1.91, 1);
  expect(await rowHeight('Covered page')).toBe(heightBefore);
  await expect(thumbnail(page, 'Small cover page')).toBeVisible();
  // Rows without a cover show no image, and nothing is generated for them.
  for (const title of ['Plain page', 'Inner folder']) {
    await expect(managerRow(page, title).getByTestId('bookmark-cover-thumbnail')).toHaveCount(0);
    await expect(managerRow(page, title).locator('img')).toHaveCount(0);
  }
  expect(await rowHeight('Plain page')).toBe(heightBefore);

  // Resting on the thumbnail opens the larger cover after the hover card's delay.
  const focusedBefore = await page.evaluate(() => document.activeElement?.tagName);
  await covered.hover();
  const startedAt = Date.now();
  const card = previewCard(page);
  await expect(card).toBeVisible();
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(hoverConfig.open_delay_ms * 0.9);
  await expect(card.getByTestId('cover-preview-image')).toHaveAttribute('src', /^blob:/);
  await expect(card.getByTestId('cover-preview-title')).toHaveText('Covered page');
  await expect(card.getByTestId('cover-preview-source')).toContainText(
    'Captured while browsing, saved ',
  );
  const imageBox = await card.getByTestId('cover-preview-image').boundingBox();
  expect(Math.round(imageBox?.width ?? 0)).toBe(hoverConfig.cover_preview_max_width_px);
  // The thumbnail names the card; the card never takes focus.
  const contentId = await card.locator('[id]').first().getAttribute('id');
  await expect(covered).toHaveAttribute('aria-describedby', contentId ?? 'missing');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(focusedBefore);

  // Escape closes it with the pointer still there, and it stays closed.
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await page.waitForTimeout(hoverConfig.open_delay_ms * 2);
  await expect(card).toBeHidden();

  // A cover narrower than the largest size is never drawn wider than stored.
  await thumbnail(page, 'Small cover page').hover();
  await expect(card.getByTestId('cover-preview-title')).toHaveText('Small cover page');
  await expect(card).toBeVisible();
  const smallBox = await card.getByTestId('cover-preview-image').boundingBox();
  expect(Math.round(smallBox?.width ?? 0)).toBe(200);
  // Moving away closes it.
  await page.mouse.move(0, 0);
  await expect(card).toBeHidden();

  // Keyboard focus on a thumbnail opens it too, and Escape leaves focus where it was.
  await managerRow(page, 'Covered page').getByRole('checkbox').focus();
  await page.keyboard.press('Tab');
  await expect(covered).toBeFocused();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('cover-preview-title')).toHaveText('Covered page');
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(covered).toBeFocused();

  // A click opens the bookmark's preview, and the card stays closed.
  await covered.click();
  const dialog = page.getByRole('dialog', { name: 'Covered page' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('bookmark-cover')).toHaveAttribute('src', /^blob:/);
  await expect(card).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  expect(webRequests).toEqual([]);
});

test('the Cover column hides from View and stays hidden after a reload', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const seeded = await seedFolder(extensionWorker, 'E2E Cover Column Hide', [
    { title: 'Covered page', url: 'https://covered.e2e.invalid/hide' },
  ]);
  await seedCover(extensionWorker, seeded.ids['Covered page'], 'https://covered.e2e.invalid/hide');
  await showTableColumns(extensionWorker, ['cover']);

  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(thumbnail(page, 'Covered page')).toBeVisible();

  await page.getByRole('button', { name: 'Customize table view' }).click();
  const item = page.getByRole('menuitemcheckbox', { name: 'Cover' });
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await item.click();
  await expect(item).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await expect(coverHeader(page)).toHaveCount(0);
  await expect(page.getByTestId('bookmark-cover-thumbnail')).toHaveCount(0);
  await expect.poll(async () => (await storedCoverColumn(page)).shown).toBe(false);

  await page.reload();
  await expect(managerRow(page, 'Covered page')).toBeVisible();
  await expect(coverHeader(page)).toHaveCount(0);
  await expect(page.getByTestId('bookmark-cover-thumbnail')).toHaveCount(0);
});
