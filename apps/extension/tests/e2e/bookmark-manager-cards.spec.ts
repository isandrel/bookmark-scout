/**
 * The manager's cards view (Manager View): the same rows as the list, as cards in a grid, with the
 * same selection, keys, menus, and opening, kept on this device.
 */
import { expect, test } from './fixtures';
import { managerUrl } from './manager-helpers';
import { readStored, STORAGE_ITEMS } from './storage';
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
