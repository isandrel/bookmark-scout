/**
 * The manager's cards view (Manager View): the same rows as the list, as cards in a grid, with the
 * same selection, keys, menus, and opening, kept on this device.
 */
import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { managerSearch, managerUrl, seedCover, waitForNoOverlay } from './manager-helpers';
import { DELETE_KEY, OPEN_KEY } from './manager-keys';
import { readStored, STORAGE_ITEMS, setSettings, writeStored } from './storage';
import { childrenOf, chooseExportFolder, openTools, seedFolder, toolCard } from './tool-helpers';

test.use({ viewport: { width: 1400, height: 900 } });

test('cards show the folder as the list does, with selection, keys, and menus, and stay on reload', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Cards', [
    { title: 'Inner', children: [{ title: 'Deep Link', url: 'https://deep.e2e.invalid/' }] },
    { title: 'Card One', url: 'https://one.e2e.invalid/a' },
    { title: 'Card Two', url: 'https://two.e2e.invalid/b' },
    { title: 'Card Three', url: 'https://three.e2e.invalid/c' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const cards = page.getByTestId('bookmark-cards');
  const card = (title: string) =>
    cards.locator('[data-slot="bookmark-card"]').filter({ hasText: title });
  await expect(page.getByTestId('bookmark-grid')).toBeVisible();

  const toggle = page.getByRole('group', { name: 'Manager View' });
  await expect(toggle.getByRole('button', { name: 'List' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await toggle.getByRole('button', { name: 'Cards' }).click();
  await expect(cards).toBeVisible();
  await expect(page.getByTestId('bookmark-grid')).toHaveCount(0);
  await expect(cards.locator('[data-slot="bookmark-card"]')).toHaveCount(4);
  await expect(card('Card One')).toContainText('https://one.e2e.invalid/a');

  // A click selects; Right moves to the next card and selects it, and Shift extends the selection.
  await card('Card One').click();
  await expect(card('Card One')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(card('Card Two')).toBeFocused();
  await expect(card('Card Two')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(card('Card Three')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('2 of 4 selected', { exact: true })).toBeVisible();

  // The card's menu is the row's menu.
  await card('Card Three').getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await page.keyboard.press('Escape');
  // So is its right-click menu, never the one for empty space.
  await card('Card One').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Add new folder' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Kept on this device, across a reload.
  await page.reload();
  await expect(cards).toBeVisible();
  expect(await readStored(extensionWorker, STORAGE_ITEMS.deviceSettings)).toMatchObject({
    managerViewMode: 'cards',
  });

  // A folder card opens the folder on a double click.
  await card('Inner').dblclick();
  await expect(card('Deep Link')).toBeVisible();

  await toggle.getByRole('button', { name: 'List' }).click();
  await expect(page.getByTestId('bookmark-grid')).toBeVisible();
  await expect(page.locator('tbody tr').filter({ hasText: 'Deep Link' })).toBeVisible();
});

test('cards keep the search, selection, and live changes the list has', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Cards Parity', [
    { title: 'Work Plan', url: 'https://plan.e2e.invalid/' },
    { title: 'Work Notes', url: 'https://notes.e2e.invalid/' },
    { title: 'Holiday', url: 'https://holiday.e2e.invalid/' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids['Work Plan'] as string]: { tags: ['work'] },
    [ids['Work Notes'] as string]: { tags: ['work'] },
  });
  await page.goto(`${managerUrl(extensionId, seeded.folderId)}`);
  const search = managerSearch(page);
  await search.fill('tag:work');
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: 'Work Plan' }).getByRole('checkbox').check();
  await expect(rows.filter({ hasText: 'Work Plan' })).toHaveAttribute('aria-selected', 'true');

  // The same rows, the same selection, and the same search after the switch.
  await page
    .getByRole('group', { name: 'Manager View' })
    .getByRole('button', { name: 'Cards' })
    .click();
  const cards = page.getByTestId('bookmark-cards').locator('[data-slot="bookmark-card"]');
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: 'Work Plan' })).toHaveAttribute('aria-selected', 'true');
  await expect(search).toHaveValue('tag:work');

  // Changes made in the browser show at once, as in the list.
  await extensionWorker.evaluate(
    (id) => chrome.bookmarks.update(id, { title: 'Work Plan v2' }),
    ids['Work Plan'] as string,
  );
  await expect(cards.filter({ hasText: 'Work Plan v2' })).toHaveCount(1);
  await extensionWorker.evaluate((id) => chrome.bookmarks.remove(id), ids['Work Notes'] as string);
  await expect(cards).toHaveCount(1);
});

test('a row the search matched outside its title says where, in the list and on the card', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Match Reasons', [
    { title: 'Weekly plan', url: 'https://plans.e2e.invalid/week' },
    { title: 'Soup', url: 'https://kitchen.e2e.invalid/soup' },
    { title: 'Kitchen notes', url: 'https://notes.e2e.invalid/' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids.Soup as string]: { tags: ['dinner'] },
  });
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const reason = (title: string) =>
    page.locator('tbody tr').filter({ hasText: title }).getByTestId('row-search-reason');

  await managerSearch(page).fill('dinner');
  await expect(reason('Soup')).toHaveText('tag: dinner');
  await managerSearch(page).fill('kitchen');
  // The title says it already; only the address match is named.
  await expect(reason('Kitchen notes')).toHaveCount(0);
  await expect(reason('Soup')).toHaveText('in URL');

  await page
    .getByRole('group', { name: 'Manager View' })
    .getByRole('button', { name: 'Cards' })
    .click();
  await expect(
    page
      .locator('[data-slot="bookmark-card"]')
      .filter({ hasText: 'Soup' })
      .getByTestId('row-search-reason'),
  ).toHaveText('in URL');
});

/** The bookmark IDs the page shows, in order: the list's rows or the cards. */
function shownIds(page: Page, view: 'list' | 'cards') {
  const selector =
    view === 'list' ? 'tbody tr[data-row-id]' : '[data-slot="bookmark-card"][data-row-id]';
  return page
    .locator(selector)
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-row-id')));
}

const viewToggle = (page: Page) => page.getByRole('group', { name: 'Manager View' });
const cardOf = (page: Page, title: string) =>
  page.locator('[data-slot="bookmark-card"]').filter({ hasText: title });

async function historyDepths(page: Page) {
  const history = await readStored<{ undo: unknown[]; redo: unknown[] }>(
    page,
    STORAGE_ITEMS.bookmarkHistory,
  );
  return { undo: history?.undo.length ?? 0, redo: history?.redo.length ?? 0 };
}

test('cards show tags, a summary, folder counts, and a room for the cover that never changes size', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Card Content', [
    {
      title: 'Inner',
      children: [
        { title: 'Inner A', url: 'https://inner.e2e.invalid/a' },
        { title: 'Inner B', url: 'https://inner.e2e.invalid/b' },
      ],
    },
    { title: 'Empty', children: [] },
    { title: 'Tagged', url: 'https://tagged.e2e.invalid/' },
    { title: 'Plain', url: 'https://plain.e2e.invalid/' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  const summary = `A summary long enough to need more lines than a card shows. ${'More words. '.repeat(30)}`;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids.Tagged as string]: { tags: ['work', 'reading', 'design', 'later', 'misc'], summary },
  });
  // Showing cards fetches nothing.
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await setSettings(extensionWorker, { managerViewMode: 'cards' });
  await page.goto(managerUrl(extensionId, seeded.folderId));

  // A folder card counts what the folder holds, in words.
  await expect(cardOf(page, 'Inner').getByTestId('bookmark-card-count')).toHaveText('2 items');
  await expect(cardOf(page, 'Empty').getByTestId('bookmark-card-count')).toHaveText('0 items');

  // At most three tag chips, then one chip for the rest that names them.
  const tags = cardOf(page, 'Tagged').getByRole('list', { name: 'Tags' });
  await expect(tags.getByRole('listitem')).toHaveText([
    'work',
    'reading',
    'design',
    '+22 more tags: later and misc',
  ]);
  await expect(tags.getByText('+2', { exact: true })).toBeVisible();
  await expect(tags.getByText('2 more tags: later and misc', { exact: true })).toHaveClass(
    /sr-only/,
  );
  // The summary is cut to two lines on screen, with the whole text in the page.
  const summaryText = cardOf(page, 'Tagged').getByTestId('bookmark-card-summary');
  await expect(summaryText).toHaveText(summary.trim());
  await expect(summaryText).toHaveCSS('-webkit-line-clamp', '2');
  expect(
    await summaryText.evaluate((element) => element.scrollHeight > element.clientHeight + 1),
  ).toBe(true);
  await expect(cardOf(page, 'Plain').getByRole('list', { name: 'Tags' })).toHaveCount(0);
  await expect(cardOf(page, 'Plain').getByTestId('bookmark-card-summary')).toHaveCount(0);

  // Every card but a separator keeps the same room at the cover's ratio, with an icon and no cover.
  const media = page.getByTestId('bookmark-cards').getByTestId('bookmark-card-media');
  await expect(media).toHaveCount(4);
  const boxes = await media.evaluateAll((frames) =>
    frames.map((frame) => {
      const box = frame.getBoundingClientRect();
      return { ratio: box.width / box.height, cover: frame.getAttribute('data-cover') };
    }),
  );
  for (const box of boxes) {
    expect(box.ratio).toBeCloseTo(1.91, 1);
    expect(box.cover).toBe('none');
  }
  await expect(page.getByTestId('bookmark-cover')).toHaveCount(0);

  // Tags, summaries, and folder contents changed from elsewhere show at once (V12).
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids.Tagged as string]: { tags: ['work'] },
    [ids.Plain as string]: { tags: ['fresh'], summary: 'Now summarized.' },
  });
  await expect(cardOf(page, 'Plain').getByRole('list', { name: 'Tags' })).toHaveText('fresh');
  await expect(cardOf(page, 'Plain').getByTestId('bookmark-card-summary')).toHaveText(
    'Now summarized.',
  );
  await expect(tags.getByRole('listitem')).toHaveText(['work']);
  await expect(cardOf(page, 'Tagged').getByTestId('bookmark-card-summary')).toHaveCount(0);
  await extensionWorker.evaluate(
    (parentId) =>
      chrome.bookmarks.create({ parentId, title: 'Inner C', url: 'https://inner.e2e.invalid/c' }),
    ids.Inner as string,
  );
  await expect(cardOf(page, 'Inner').getByTestId('bookmark-card-count')).toHaveText('3 items');
  expect(requests).toEqual([]);
});

test('two bookmarks on one site show their own covers, never the shared site icon as one (V36)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Card Covers', [
    { title: 'Same Site A', url: 'https://same.e2e.invalid/a' },
    { title: 'Same Site B', url: 'https://same.e2e.invalid/b' },
    { title: 'Same Site C', url: 'https://same.e2e.invalid/c' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await seedCover(extensionWorker, ids['Same Site A'] as string, 'https://same.e2e.invalid/a', {
    width: 600,
    height: 314,
  });
  await seedCover(extensionWorker, ids['Same Site B'] as string, 'https://same.e2e.invalid/b', {
    width: 382,
    height: 200,
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) requests.push(request.url());
  });
  await setSettings(extensionWorker, { managerViewMode: 'cards' });
  await page.goto(managerUrl(extensionId, seeded.folderId));

  const cover = (title: string) => cardOf(page, title).getByTestId('bookmark-cover');
  await expect(cover('Same Site A')).toHaveAttribute('src', /^blob:/);
  await expect(cover('Same Site B')).toHaveAttribute('src', /^blob:/);
  const width = (title: string) =>
    cover(title).evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      return image.naturalWidth;
    });
  expect(await width('Same Site A')).toBe(600);
  expect(await width('Same Site B')).toBe(382);
  expect(await cover('Same Site A').getAttribute('src')).not.toBe(
    await cover('Same Site B').getAttribute('src'),
  );
  // The third has no cover of its own: its room shows the site's icon, not another page's cover.
  await expect(cover('Same Site C')).toHaveCount(0);
  await expect(cardOf(page, 'Same Site C').getByTestId('bookmark-card-media')).toHaveAttribute(
    'data-cover',
    'none',
  );

  // A cover belongs to its address: after the address changes elsewhere, the card shows none.
  await extensionWorker.evaluate(
    (id) => chrome.bookmarks.update(id, { url: 'https://same.e2e.invalid/moved' }),
    ids['Same Site A'] as string,
  );
  await expect(cardOf(page, 'Same Site A')).toContainText('https://same.e2e.invalid/moved');
  await expect(cover('Same Site A')).toHaveCount(0);
  await expect(cover('Same Site B')).toHaveCount(1);
  expect(requests).toEqual([]);
});

test('cards keep the list sort and columns, show the same order, and never move bookmarks (V02, V05)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Card Order', [
    { title: 'Bravo', url: 'https://bravo.e2e.invalid/' },
    { title: 'Delta', url: 'https://delta.e2e.invalid/' },
    { title: 'Alpha', url: 'https://alpha.e2e.invalid/' },
    { title: 'Charlie', url: 'https://charlie.e2e.invalid/' },
  ]);
  const browserOrder = ['Bravo', 'Delta', 'Alpha', 'Charlie'];
  const childTitles = async () =>
    (await childrenOf(extensionWorker, seeded.folderId)).map((child) => child.title);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('tbody tr')).toHaveCount(4);

  // The browser's order first: the same in both views.
  const listBrowserOrder = await shownIds(page, 'list');
  await viewToggle(page).getByRole('button', { name: 'Cards' }).click();
  await expect(page.locator('[data-slot="bookmark-card"]')).toHaveCount(4);
  expect(await shownIds(page, 'cards')).toEqual(listBrowserOrder);
  await viewToggle(page).getByRole('button', { name: 'List' }).click();

  // Hide URL and sort by title, descending, in the list.
  await page.getByRole('button', { name: 'Customize table view' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'url' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Title', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Desc' }).click();
  const sorted = ['Delta', 'Charlie', 'Bravo', 'Alpha'].map(
    (title) => (seeded.ids as Record<string, string>)[title],
  );
  await expect.poll(() => shownIds(page, 'list')).toEqual(sorted);
  await viewToggle(page).getByRole('button', { name: 'Cards' }).click();
  await expect.poll(() => shownIds(page, 'cards')).toEqual(sorted);
  expect(await childTitles()).toEqual(browserOrder);

  // Back in the list: the same sort, columns, and folder (the search is kept as in
  // "cards keep the search, selection, and live changes the list has").
  await viewToggle(page).getByRole('button', { name: 'List' }).click();
  await expect.poll(() => shownIds(page, 'list')).toEqual(sorted);
  await expect(page.getByRole('columnheader', { name: 'URL' })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`id=${seeded.folderId}`));
  expect(await childTitles()).toEqual(browserOrder);
});

test('a saved search opens in cards with its filter and order (V07)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Card Saved', [
    { title: 'Plan Alpha', url: 'https://alpha.e2e.invalid/' },
    { title: 'Notes', url: 'https://notes.e2e.invalid/' },
    { title: 'Plan Charlie', url: 'https://charlie.e2e.invalid/' },
    { title: 'Plan Bravo', url: 'https://bravo.e2e.invalid/' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.savedSearches, [
    {
      id: 'plans',
      name: 'Plans',
      createdAt: 1,
      query: {
        filters: { title: 'Plan' },
        syntaxVersion: 2,
        sorting: [{ id: 'title', desc: true }],
      },
    },
  ]);
  await setSettings(extensionWorker, { managerViewMode: 'cards' });
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await expect(page.locator('[data-slot="bookmark-card"]')).toHaveCount(4);

  await page
    .getByTestId('bookmark-table-toolbar')
    .getByRole('button', { name: 'Saved searches' })
    .click();
  await page
    .getByRole('dialog', { name: 'Saved searches' })
    .getByRole('button', { name: 'Plans', exact: true })
    .click();
  const expected = [ids['Plan Charlie'], ids['Plan Bravo'], ids['Plan Alpha']];
  await expect.poll(() => shownIds(page, 'cards')).toEqual(expected);
  await page.keyboard.press('Escape');
  await viewToggle(page).getByRole('button', { name: 'List' }).click();
  await expect.poll(() => shownIds(page, 'list')).toEqual(expected);
});

test('cards keep duplicates apart and wrap long, CJK, and right-to-left titles without overflow (V10, V11)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const long = `Unbroken${'x'.repeat(160)}`;
  const titles = [
    long,
    '日本語のブックマークのとても長いタイトルが折り返されるかどうかを確認するテスト',
    'عنوان عربي طويل جدا للتحقق من الالتفاف في البطاقات 123',
    'Emoji title 🧭🔖✨ with a long tail of words that keeps going and going',
  ];
  const seeded = await seedFolder(extensionWorker, 'E2E Card Text', [
    { title: 'Copy One', url: 'https://dup.e2e.invalid/page' },
    { title: 'Copy Two', url: 'https://dup.e2e.invalid/page' },
    ...titles.map((title, index) => ({
      title,
      url: `https://text.e2e.invalid/${index}/${'segment/'.repeat(20)}?query=${'v'.repeat(80)}`,
    })),
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids['Copy One'] as string]: { tags: ['first'] },
    [ids['Copy Two'] as string]: { tags: ['second'] },
  });
  await setSettings(extensionWorker, { managerViewMode: 'cards' });

  for (const width of [1400, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(managerUrl(extensionId, seeded.folderId));
    const cards = page.locator('[data-slot="bookmark-card"]');
    await expect(cards).toHaveCount(6);
    // The same address twice: two cards, each with its own tags.
    await expect(cardOf(page, 'Copy One').getByRole('list', { name: 'Tags' })).toHaveText('first');
    await expect(cardOf(page, 'Copy Two').getByRole('list', { name: 'Tags' })).toHaveText('second');
    await expect
      .poll(() =>
        cards.evaluateAll((items) =>
          items
            .filter((card) => card.scrollWidth > card.clientWidth)
            .map((card) => card.textContent),
        ),
      )
      .toEqual([]);
    const frame = page.getByTestId('bookmark-cards');
    expect(await frame.evaluate((grid) => grid.scrollWidth <= grid.clientWidth)).toBe(true);
    // A cut title keeps its whole text for pointers and screen readers.
    for (const title of titles) {
      await expect(cards.locator(`span[title="${title}"]`)).toHaveText(title);
    }
  }
});

test('cards follow moves made elsewhere, undo a delete, and run bulk actions on the selection (V13-V15)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Card Actions', [
    { title: 'Target Box', children: [] },
    { title: 'Elsewhere', children: [] },
    { title: 'Act One', url: 'https://one.e2e.invalid/' },
    { title: 'Act Two', url: 'https://two.e2e.invalid/' },
    { title: 'Act Three', url: 'https://three.e2e.invalid/' },
    { title: 'Act Four', url: 'https://four.e2e.invalid/' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids['Act One'] as string]: { tags: ['keep-me'] },
  });
  const childTitles = async (folderId: string) =>
    (await childrenOf(extensionWorker, folderId)).map((child) => child.title);
  await setSettings(extensionWorker, { managerViewMode: 'cards' });
  await page.goto(managerUrl(extensionId, seeded.folderId));
  const cards = page.locator('[data-slot="bookmark-card"]');
  await expect(cards).toHaveCount(6);

  // V13: a selected card moved away elsewhere leaves the selection with what is still shown.
  await cardOf(page, 'Act Three').click();
  await cardOf(page, 'Act Four').click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByText('2 of 6 selected', { exact: true })).toBeVisible();
  await extensionWorker.evaluate(({ id, parentId }) => chrome.bookmarks.move(id, { parentId }), {
    id: ids['Act Four'] as string,
    parentId: ids.Elsewhere as string,
  });
  await expect(cards).toHaveCount(5);
  await expect(page.getByText('1 of 5 selected', { exact: true })).toBeVisible();
  await expect(cardOf(page, 'Act Three')).toHaveAttribute('aria-selected', 'true');
  await expect(cardOf(page, 'Elsewhere').getByTestId('bookmark-card-count')).toHaveText('1 item');

  // V14: delete from a card, then undo with the keyboard; the bookmark and its tags come back.
  await cardOf(page, 'Act One').click();
  await page.keyboard.press(DELETE_KEY);
  await page
    .getByRole('dialog', { name: 'Delete bookmark' })
    .getByRole('button', { name: 'Delete bookmark' })
    .click();
  await expect.poll(() => childTitles(seeded.folderId)).not.toContain('Act One');
  await expect(cards).toHaveCount(4);
  await expect.poll(() => historyDepths(page)).toEqual({ undo: 1, redo: 0 });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(toastRegion(page).getByText(/^✓ Undone: Delete/)).toBeVisible();
  await expect
    .poll(() => childTitles(seeded.folderId))
    .toEqual(['Target Box', 'Elsewhere', 'Act One', 'Act Two', 'Act Three']);
  await expect(cardOf(page, 'Act One').getByRole('list', { name: 'Tags' })).toHaveText('keep-me');

  // V15: a bulk move of selected cards, as from the list's selection.
  await waitForNoOverlay(page);
  await cardOf(page, 'Act Two').click();
  await cardOf(page, 'Act Three').click({ modifiers: ['Shift'] });
  await expect(page.getByText('2 of 5 selected', { exact: true })).toBeVisible();
  await page.getByTestId('bulk-actions').getByRole('button', { name: 'Move to folder' }).click();
  const moveDialog = page.getByRole('dialog', { name: 'Move 2 items' });
  await moveDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: /Target Box$/ }).click();
  await moveDialog.getByRole('button', { name: 'Move to folder' }).click();
  await expect
    .poll(() => childTitles(ids['Target Box'] as string))
    .toEqual(['Act Two', 'Act Three']);
  await expect(cards).toHaveCount(3);
  await expect(cardOf(page, 'Target Box').getByTestId('bookmark-card-count')).toHaveText('2 items');
});

test('cards fit a 320px window in light and dark with large text, with no sideways scrolling (V19)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Card Narrow', [
    { title: 'Folder With A Long Name That Wraps', children: [] },
    { title: 'Narrow One', url: `https://narrow.e2e.invalid/${'long/'.repeat(30)}` },
    { title: 'Narrow Two', url: 'https://two.e2e.invalid/' },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids['Narrow One'] as string]: {
      tags: ['a-really-long-tag-name-that-must-not-push-the-card-wider', 'two', 'three', 'four'],
      summary: 'A summary that wraps inside the card. '.repeat(6),
    },
  });
  await page.setViewportSize({ width: 320, height: 800 });
  for (const theme of ['light', 'dark'] as const) {
    await setSettings(extensionWorker, { managerViewMode: 'cards', theme });
    await page.goto(managerUrl(extensionId, seeded.folderId));
    // Large text: the browser's text size at 24px (Chrome's Very large) instead of 16px.
    await page.addStyleTag({ content: 'html { font-size: 24px !important; }' });
    await expect(page.locator('html')).toHaveClass(
      theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/,
    );
    const cards = page.locator('[data-slot="bookmark-card"]');
    await expect(cards).toHaveCount(3);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const wide = (element: Element) => element.scrollWidth > element.clientWidth;
          return {
            page: wide(document.documentElement),
            grid: wide(document.querySelector('[data-testid="bookmark-cards"]') as Element),
            cards: [...document.querySelectorAll('[data-slot="bookmark-card"]')].filter(wide)
              .length,
            toolbar: wide(
              document.querySelector('[data-testid="bookmark-table-toolbar"]') as Element,
            ),
          };
        }),
      )
      .toEqual({ page: false, grid: false, cards: 0, toolbar: false });
    // Each card fits the window.
    for (const box of await cards.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().right),
    )) {
      expect(box).toBeLessThanOrEqual(320);
    }
  }
});

test('exporting from the cards view gives the same file as from the list, with no covers (V34)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Card Export', [
    { title: 'Export One', url: 'https://one.e2e.invalid/' },
    {
      title: 'Export Folder',
      children: [{ title: 'Export Inner', url: 'https://in.e2e.invalid/' }],
    },
  ]);
  const ids = seeded.ids as Record<string, string>;
  await seedCover(extensionWorker, ids['Export One'] as string, 'https://one.e2e.invalid/');
  await setSettings(extensionWorker, {
    dataDefaultExportFormat: 'json',
    exportIncludeDates: false,
  });
  const exportOnce = async () => {
    const downloadPromise = page.waitForEvent('download');
    await toolCard(page, 'Export Bookmarks').getByRole('button', { name: 'Export' }).click();
    return readFile(await (await downloadPromise).path(), 'utf8');
  };

  await openTools(page, extensionId, seeded.folderId);
  await chooseExportFolder(page, 'E2E Card Export');
  const fromList = await exportOnce();
  await viewToggle(page).getByRole('button', { name: 'Cards' }).click();
  await expect(cardOf(page, 'Export One').getByTestId('bookmark-cover')).toBeVisible();
  const fromCards = await exportOnce();

  expect(fromCards).toBe(fromList);
  expect(fromCards).toContain('Export Inner');
  expect(fromCards).not.toMatch(/blob:|data:image|cover/i);
});

test.describe('opening from a card', () => {
  // The tabs' addresses are read back from the browser, which shows them only with `tabs`.
  test.use({ grantPermissions: ['tabs'] });

  test('a card opens its bookmark by double click, Enter, and Ctrl/Cmd+Enter, and opens no script or data: address, as the list (V16)', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Cards Open', [
      { title: 'Open Card', url: 'https://open.e2e.invalid/' },
      { title: 'Script Card', url: 'javascript:void(0)' },
      { title: 'Page Data Card', url: 'data:text/html,<p>page</p>' },
    ]);
    await setSettings(extensionWorker, { managerViewMode: 'cards' });
    await page.goto(managerUrl(extensionId, seeded.folderId));
    const card = (title: string) =>
      page
        .getByTestId('bookmark-cards')
        .locator('[data-slot="bookmark-card"]')
        .filter({ hasText: title });
    /**
     * The address of every tab, read from the browser, that is not the manager. A tab opened in
     * the background has no address for a moment, so checks on addresses poll.
     */
    const opened = () =>
      extensionWorker.evaluate(async (manager) => {
        const tabs = await chrome.tabs.query({});
        return tabs
          .map((tab) => tab.pendingUrl || tab.url || '')
          .filter((url) => !url.startsWith(manager))
          .sort();
      }, `chrome-extension://${extensionId}/`);
    const before = await opened();
    const added = async () => [...new Set((await opened()).filter((url) => !before.includes(url)))];

    // A double click opens a tab in front, Enter (Cmd+O on a Mac) too, Ctrl/Cmd+Enter in the back.
    await card('Open Card').dblclick();
    await expect.poll(async () => (await opened()).length).toBe(before.length + 1);
    await page.bringToFront();
    await card('Open Card').click();
    await page.keyboard.press(OPEN_KEY);
    await expect.poll(async () => (await opened()).length).toBe(before.length + 2);
    await page.bringToFront();
    await card('Open Card').focus();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect.poll(async () => (await opened()).length).toBe(before.length + 3);
    await expect.poll(added).toEqual(['https://open.e2e.invalid/']);
    await expect
      .poll(async () => (await opened()).filter((url) => url === 'https://open.e2e.invalid/'))
      .toHaveLength(3);
    await page.bringToFront();

    // A bookmarklet or a data: address opens from no card and no row, by any gesture, alone or
    // selected with a bookmark that opens; the tab of that one shows the gestures were done.
    // A row is clicked on its title, never on its address link or checkbox.
    const refused = async (
      target: (title: string) => Locator,
      position?: { x: number; y: number },
    ) => {
      for (const title of ['Script Card', 'Page Data Card']) {
        await target(title).dblclick({ position });
        await target(title).click({ position });
        await page.keyboard.press(OPEN_KEY);
        await page.keyboard.press('ControlOrMeta+Enter');
      }
      await target('Open Card').click({ position });
      for (const title of ['Script Card', 'Page Data Card']) {
        await target(title).click({ position, modifiers: ['ControlOrMeta'] });
      }
      await expect(page.getByText('3 of 3 selected', { exact: true })).toBeVisible();
      await page.keyboard.press('ControlOrMeta+Enter');
    };
    await refused(card);
    await expect.poll(async () => (await opened()).length).toBe(before.length + 4);
    await expect.poll(added).toEqual(['https://open.e2e.invalid/']);

    await page
      .getByRole('group', { name: 'Manager View' })
      .getByRole('button', { name: 'List' })
      .click();
    const row = (title: string) => page.locator('tbody tr').filter({ hasText: title });
    await refused(row, { x: 200, y: 10 });
    await expect.poll(async () => (await opened()).length).toBe(before.length + 5);
    await expect.poll(added).toEqual(['https://open.e2e.invalid/']);
  });
});

test('a card keeps its checkbox, site icon, and menu beside the first line of a two-line title', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Card Align', [
    { title: 'Short', url: 'https://short.e2e.invalid/' },
    {
      title: 'A title long enough to wrap onto a second line inside one card of the grid',
      url: 'https://long.e2e.invalid/',
    },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await page
    .getByRole('group', { name: 'Manager View' })
    .getByRole('button', { name: 'Cards' })
    .click();
  const cards = page.locator('[data-slot="bookmark-card"]');
  await expect(cards).toHaveCount(2);

  // Each part's vertical center against the center of the title's first line.
  const offsets = (title: string) =>
    cards.filter({ hasText: title }).evaluate((card) => {
      const center = (element: Element | null) => {
        if (!element) throw new Error('missing part');
        const box = element.getBoundingClientRect();
        return box.top + box.height / 2;
      };
      const titleText = card.querySelector('[role="gridcell"] span[title]');
      if (!titleText) throw new Error('missing title');
      const lineHeight = Number.parseFloat(getComputedStyle(titleText).lineHeight);
      const firstLine = titleText.getBoundingClientRect().top + lineHeight / 2;
      return {
        lines: Math.round(titleText.getBoundingClientRect().height / lineHeight),
        checkbox: center(card.querySelector('[role="checkbox"]')) - firstLine,
        icon: center(titleText.parentElement?.previousElementSibling ?? null) - firstLine,
        menu: center(card.querySelector('button[aria-label="Open menu"]')) - firstLine,
      };
    });

  const short = await offsets('Short');
  const long = await offsets('A title long enough');
  expect(short.lines).toBe(1);
  expect(long.lines).toBe(2);
  for (const result of [short, long]) {
    for (const part of ['checkbox', 'icon', 'menu'] as const) {
      expect(Math.abs(result[part]), part).toBeLessThanOrEqual(1.5);
    }
  }
});
