/**
 * The bookmark hover card: a bookmark's details where the pointer rests on its row, or keyboard
 * focus reaches it, in the popup (Show Details on Hover), and a summary the manager's Summary
 * column cuts short. WCAG 1.4.13: it waits for the open delay, Escape dismisses it without moving
 * the pointer or focus, the pointer can move onto it, and it never takes focus.
 */
import type { Locator, Page } from '@playwright/test';
import { readConfigToml } from '../config-files';
import { expect, test } from './fixtures';
import { managerRow, managerUrl, seedCover } from './manager-helpers';
import { bookmarkRow, openPopup, seedFolder } from './popup-helpers';
import { readStored, STORAGE_ITEMS, setSettings, writeStored } from './storage';

const hoverConfig = readConfigToml('ui/hover-card.toml') as {
  open_delay_ms: number;
  close_delay_ms: number;
};
/** Long enough that a card due to open has opened: the open delay and a margin for a busy run. */
const PAST_OPEN_DELAY_MS = hoverConfig.open_delay_ms * 2;

const SUMMARY = [
  'A summary long enough to need more than two lines in a narrow column of the manager table.',
  'Its second paragraph keeps going so the hover card has to show the whole text, which the',
  'table cell cuts short after a couple of lines.',
].join('\n');

const searchBox = (page: Page) =>
  page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });

const hoverCard = (page: Page) => page.getByTestId('bookmark-hover-card');

/** No page-level horizontal scroll, and the card inside the window. */
async function expectCardFits(page: Page, card: Locator) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  const box = await card.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('No card box or viewport');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

/** Seeds a folder with one described bookmark and one without details, and opens the popup on it. */
async function openPopupOnSeed(
  page: Page,
  extensionId: string,
  extensionWorker: Parameters<typeof seedFolder>[0],
  settings: Record<string, unknown> = {},
) {
  await setSettings(extensionWorker, { language: 'en', ...settings });
  const seeded = await seedFolder(extensionWorker, 'E2E Hover Folder', [
    {
      title: 'Hovercard release notes',
      url: 'https://docs.hover.e2e.invalid/releases/2026/a-very-long-path-segment?tab=notes',
    },
    { title: 'Hovercard plain link', url: 'https://plain.hover.e2e.invalid/' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids['Hovercard release notes'] as string]: {
      tags: ['release', 'docs', 'weekly'],
      summary: SUMMARY,
    },
  });
  await page.setViewportSize({ width: 420, height: 600 });
  await openPopup(page, extensionId);
  await searchBox(page).fill('Hovercard');
  await expect(bookmarkRow(page, 'Hovercard release notes')).toBeVisible();
  await expect(bookmarkRow(page, 'Hovercard plain link')).toBeVisible();
  return { ids, barTitle: seeded.barTitle as string };
}

test('popup: resting on a bookmark shows its details after the delay, Escape closes it in place, and the pointer can move onto it', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { barTitle } = await openPopupOnSeed(page, extensionId, extensionWorker);
  const row = bookmarkRow(page, 'Hovercard release notes');
  const link = row.getByRole('treeitem');
  const card = hoverCard(page);

  // Not at once: the card waits for the open delay.
  const startedAt = Date.now();
  await row.hover();
  await expect(card).toHaveCount(0);
  await expect(card).toBeVisible();
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(hoverConfig.open_delay_ms);

  await expect(card.getByTestId('bookmark-hover-card-title')).toHaveText('Hovercard release notes');
  await expect(card.getByTestId('bookmark-hover-card-url')).toHaveText(
    'https://docs.hover.e2e.invalid/releases/2026/a-very-long-path-segment?tab=notes',
  );
  await expect(card.getByTestId('bookmark-hover-card-folder')).toHaveText(
    `${barTitle} / E2E Hover Folder`,
  );
  await expect(card.getByRole('list', { name: 'Tags' }).getByRole('listitem')).toHaveText([
    'release',
    'docs',
    'weekly',
  ]);
  // The whole summary, line breaks kept.
  await expect(card.getByTestId('bookmark-hover-card-summary')).toHaveText(SUMMARY, {
    useInnerText: true,
  });
  // The row names the card, and the search box keeps focus.
  const contentId = await card.locator('[id]').first().getAttribute('id');
  await expect(link).toHaveAttribute('aria-describedby', contentId ?? '');
  await expect(searchBox(page)).toBeFocused();
  // The plain tooltip would repeat the card.
  await expect(link).not.toHaveAttribute('title');
  await expectCardFits(page, card);

  // Escape closes it without moving the pointer, and does not also clear the search.
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(searchBox(page)).toHaveValue('Hovercard');
  await expect(searchBox(page)).toBeFocused();
  await expect(link).not.toHaveAttribute('aria-describedby');
  // It stays closed while the pointer stays on the row.
  await page.waitForTimeout(PAST_OPEN_DELAY_MS);
  await expect(card).toBeHidden();

  // Leaving the row and coming back opens it again.
  await page.mouse.move(2, 2);
  await row.hover();
  await expect(card).toBeVisible();

  // The pointer can move from the row onto the card, and the card stays.
  const cardBox = await card.boundingBox();
  if (!cardBox) throw new Error('No card box');
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, {
    steps: 8,
  });
  await page.waitForTimeout(hoverConfig.close_delay_ms * 3);
  await expect(card).toBeVisible();
  // Leaving both closes it.
  await page.mouse.move(2, 2);
  await expect(card).toBeHidden();

  // A bookmark without tags or a summary still shows its address and folder, without empty parts.
  await bookmarkRow(page, 'Hovercard plain link').hover();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('bookmark-hover-card-title')).toHaveText('Hovercard plain link');
  await expect(card.getByTestId('bookmark-hover-card-folder')).toBeVisible();
  await expect(card.getByRole('list', { name: 'Tags' })).toHaveCount(0);
  await expect(card.getByTestId('bookmark-hover-card-summary')).toHaveCount(0);
});

test('popup: keyboard focus on a bookmark row shows its card without taking focus', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await openPopupOnSeed(page, extensionId, extensionWorker);
  // Keep the pointer out of the list.
  await page.mouse.move(2, 2);
  const card = hoverCard(page);
  const link = bookmarkRow(page, 'Hovercard release notes').getByRole('treeitem');

  // Arrow keys from the search box down to the bookmark.
  await searchBox(page).focus();
  for (
    let step = 0;
    step < 10 && !(await link.evaluate((el) => el === document.activeElement));
    step++
  ) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(link).toBeFocused();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('bookmark-hover-card-title')).toHaveText('Hovercard release notes');
  await expect(link).toBeFocused();
  const contentId = await card.locator('[id]').first().getAttribute('id');
  await expect(link).toHaveAttribute('aria-describedby', contentId ?? '');

  // Escape closes the card; focus stays on the row.
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(link).toBeFocused();

  // The next row gets its own card.
  await page.keyboard.press('ArrowDown');
  const next = bookmarkRow(page, 'Hovercard plain link').getByRole('treeitem');
  await expect(next).toBeFocused();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('bookmark-hover-card-title')).toHaveText('Hovercard plain link');
});

test('Show Details on Hover off shows no card and keeps the plain tooltip', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await openPopupOnSeed(page, extensionId, extensionWorker, { showHoverDetails: false });
  const row = bookmarkRow(page, 'Hovercard release notes');
  await row.hover();
  await page.waitForTimeout(PAST_OPEN_DELAY_MS);
  await expect(hoverCard(page)).toHaveCount(0);
  await expect(row.getByRole('treeitem')).toHaveAttribute(
    'title',
    'Hovercard release notes\nhttps://docs.hover.e2e.invalid/releases/2026/a-very-long-path-segment?tab=notes',
  );

  // Turned on while the popup is open, it applies at once.
  await setSettings(extensionWorker, { showHoverDetails: true });
  await expect(row.getByRole('treeitem')).not.toHaveAttribute('title');
  await page.mouse.move(2, 2);
  await row.hover();
  await expect(hoverCard(page)).toBeVisible();
});

test('popup: the card reads in dark mode and fits the narrowest popup', async ({
  extensionId,
  extensionWorker,
  page,
}, testInfo) => {
  const { ids } = await openPopupOnSeed(page, extensionId, extensionWorker, {
    theme: 'dark',
    popupWidth: 300,
  });
  await seedCover(
    extensionWorker,
    ids['Hovercard release notes'] as string,
    'https://docs.hover.e2e.invalid/releases/2026/a-very-long-path-segment?tab=notes',
    undefined,
    { source: 'tab' },
  );
  await page.setViewportSize({ width: 300, height: 600 });
  await page.reload();
  await searchBox(page).fill('Hovercard');
  await bookmarkRow(page, 'Hovercard release notes').hover();
  const card = hoverCard(page);
  await expect(card).toBeVisible();
  // The stored cover shows as a thumbnail; nothing is fetched for it.
  await expect(card.getByTestId('bookmark-cover')).toBeVisible();
  // With where it came from.
  await expect(card.getByTestId('bookmark-hover-card-cover-source')).toContainText(
    'Picture of your tab, saved ',
  );
  await expectCardFits(page, card);
  const background = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(dark).toBe(true);
  // The card uses the dark popover surface, not white.
  expect(background).not.toBe('rgb(255, 255, 255)');
  await card.screenshot({ path: testInfo.outputPath('hover-card-dark.png') });
});

test('manager: Tags and Summary columns from View show stored values, and a cut summary shows whole on hover', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { language: 'en' });
  const seeded = await seedFolder(extensionWorker, 'E2E Summary Columns', [
    { title: 'Long summary page', url: 'https://long.summary.e2e.invalid/' },
    { title: 'Short summary page', url: 'https://short.summary.e2e.invalid/' },
    { title: 'No details page', url: 'https://none.summary.e2e.invalid/' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids['Long summary page'] as string]: { tags: ['alpha', 'beta', 'gamma'], summary: SUMMARY },
    [ids['Short summary page'] as string]: { tags: ['solo'], summary: 'Short.' },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(managerRow(page, 'Long summary page')).toBeVisible();
  // Hidden at first.
  await expect(page.getByRole('columnheader', { name: 'Tags' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Customize table view' }).click();
  for (const name of ['Tags', 'Summary']) {
    const item = page.getByRole('menuitemcheckbox', { name });
    await expect(item).toHaveAttribute('aria-checked', 'false');
    await item.click();
    await expect(item).toHaveAttribute('aria-checked', 'true');
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('columnheader', { name: 'Tags' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Summary' })).toBeVisible();
  // Kept with the synced view (only the parts changed; the order still follows the defaults),
  // and before the row menu.
  await expect
    .poll(async () => {
      const view = (await readStored(extensionWorker, STORAGE_ITEMS.tableView)) as {
        columnVisibility: Record<string, boolean>;
      };
      const headers = await page
        .locator('thead th')
        .evaluateAll((cells) => cells.map((cell) => cell.textContent?.trim() ?? ''));
      return {
        tags: view.columnVisibility.tags,
        summary: view.columnVisibility.summary,
        beforeMenu:
          headers.indexOf('Summary') >= 0 && headers.indexOf('Summary') < headers.length - 1,
      };
    })
    .toEqual({ tags: true, summary: true, beforeMenu: true });

  // Two tag chips, then "+1" naming the rest.
  const longRow = managerRow(page, 'Long summary page');
  const tags = longRow.getByRole('list', { name: 'Tags' }).getByRole('listitem');
  await expect(tags).toHaveCount(3);
  await expect(tags.nth(0)).toHaveText('alpha');
  await expect(tags.nth(1)).toHaveText('beta');
  await expect(tags.nth(2)).toContainText('+1');
  await expect(tags.nth(2)).toContainText('1 more tag: gamma');
  await expect(managerRow(page, 'Short summary page').getByRole('listitem')).toHaveText(['solo']);
  await expect(
    managerRow(page, 'No details page').getByTestId('bookmark-summary-cell'),
  ).toHaveCount(0);

  // The long summary is cut to its lines; the short one is whole.
  const longCell = longRow.getByTestId('bookmark-summary-cell');
  const shortCell = managerRow(page, 'Short summary page').getByTestId('bookmark-summary-cell');
  expect(await longCell.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await shortCell.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(false);

  // Resting on the cut summary shows it whole; a whole one shows no card.
  const card = hoverCard(page);
  await shortCell.hover();
  await page.waitForTimeout(PAST_OPEN_DELAY_MS);
  await expect(card).toHaveCount(0);
  await longCell.hover();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('bookmark-hover-card-summary')).toHaveText(SUMMARY, {
    useInnerText: true,
  });
  await expect(card.getByTestId('bookmark-hover-card-title')).toHaveText('Long summary page');
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await page.mouse.move(2, 2);

  // Keyboard focus on its row shows it too.
  await managerRow(page, 'Short summary page').click();
  await page.keyboard.press('ArrowUp');
  await expect(longRow).toBeFocused();
  await expect(card).toBeVisible();
  await expect(longRow).toHaveAttribute(
    'aria-describedby',
    (await card.locator('[id]').first().getAttribute('id')) ?? '',
  );
  await expect(longRow).toBeFocused();

  // At a narrow width the page does not scroll sideways, and the row menu stays pinned.
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 420, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await expect(longRow.getByRole('button', { name: 'Open menu' })).toBeInViewport();
});
