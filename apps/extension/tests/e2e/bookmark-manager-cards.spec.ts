/**
 * The manager's cards view (Manager View): the same rows as the list, as cards in a grid, with the
 * same selection, keys, menus, and opening, kept on this device.
 */
import { expect, test } from './fixtures';
import { managerSearch, managerUrl } from './manager-helpers';
import { readStored, STORAGE_ITEMS, writeStored } from './storage';
import { seedFolder } from './tool-helpers';

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
