import { expect, test } from './fixtures';
import {
  bookmarkRow,
  folderRow,
  openPopup,
  SEARCH_HISTORY_KEY,
  seedFolder,
  setSettings,
} from './popup-helpers';

test('expand all during a search keeps the filter and the result limit', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Expand Search', [
    { title: 'Needle Nested', children: [{ title: 'Hay Inside', url: 'https://e2e.invalid/hay' }] },
    { title: 'Needle Link', url: 'https://e2e.invalid/needle' },
    { title: 'Unrelated Link', url: 'https://e2e.invalid/unrelated' },
  ]);

  await openPopup(page, extensionId);
  await page.getByPlaceholder('Search bookmarks...').fill('Needle Link');
  await expect(bookmarkRow(page, 'Needle Link')).toBeVisible();
  await expect(page.locator('.bookmark-item')).toHaveCount(1);

  // The search already opened every result folder, so the toggle starts as Collapse all.
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await expect(page.locator('.bookmark-item')).toHaveCount(0);

  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await expect(bookmarkRow(page, 'Needle Link')).toBeVisible();
  await expect(page.getByText('Unrelated Link', { exact: true })).toHaveCount(0);
  await expect(page.locator('.bookmark-item')).toHaveCount(1);

  await page.getByRole('button', { name: 'Collapse all', exact: true }).click();
  await expect(page.getByText('Unrelated Link', { exact: true })).toHaveCount(0);
});

test('permanent folder names and empty-title regexes do not return the whole tree', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Permanent Search', [
    { title: 'Plain Entry', url: 'https://e2e.invalid/plain' },
    { title: 'Bar Chart Tools', url: 'https://e2e.invalid/bar-chart' },
  ]);

  await openPopup(page, extensionId);
  const search = page.getByPlaceholder('Search bookmarks...');
  await search.fill('bar');
  await expect(bookmarkRow(page, 'Bar Chart Tools')).toBeVisible();
  await expect(page.getByText('Plain Entry', { exact: true })).toHaveCount(0);

  await search.fill('other');
  await expect(page.getByText('No bookmarks found')).toBeVisible();

  await page.getByRole('button', { name: 'Use regular expression' }).click();
  await search.fill('^$');
  await expect(page.getByText('No bookmarks found')).toBeVisible();
  await expect(page.getByText('Plain Entry', { exact: true })).toHaveCount(0);
});

test('whole-word search matches CJK and symbol-edged terms, and invalid regex warns', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E Whole Word', [
    { title: '日本語のブックマーク', url: 'https://e2e.invalid/ja' },
    { title: 'Learn C++ today', url: 'https://e2e.invalid/cpp' },
    { title: 'C# notes', url: 'https://e2e.invalid/cs' },
    { title: 'JavaScript guide', url: 'https://e2e.invalid/js' },
    { title: 'Bracket [x] item', url: 'https://e2e.invalid/bracket' },
  ]);

  await openPopup(page, extensionId);
  const search = page.getByPlaceholder('Search bookmarks...');
  await page.getByRole('button', { name: 'Match whole word' }).click();

  await search.fill('ブックマーク');
  await expect(bookmarkRow(page, '日本語のブックマーク').locator('mark')).toHaveText('ブックマーク');
  await search.fill('C++');
  await expect(bookmarkRow(page, 'Learn C++ today')).toBeVisible();
  await search.fill('C#');
  await expect(bookmarkRow(page, 'C# notes')).toBeVisible();
  await search.fill('Java');
  await expect(page.getByText('No bookmarks found')).toBeVisible();

  await page.getByRole('button', { name: 'Match whole word' }).click();
  await page.getByRole('button', { name: 'Use regular expression' }).click();
  await search.fill('[x');
  await expect(page.getByRole('alert')).toContainText('Invalid regular expression');
  await search.fill('[x]');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('search box is focused on open and the result limit notice stays visible', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(
    extensionWorker,
    'E2E Many Results',
    Array.from({ length: 40 }, (_, index) => ({
      title: `Scroll Item ${index + 1}`,
      url: `https://e2e.invalid/scroll-${index + 1}`,
    })),
  );
  await setSettings(extensionWorker, { maxSearchResults: 20 });

  await page.setViewportSize({ width: 400, height: 600 });
  await openPopup(page, extensionId);
  const search = page.getByPlaceholder('Search bookmarks...');
  await expect(search).toBeFocused();
  await expect(page.getByTestId('search-history')).toHaveCount(0);

  await page.keyboard.type('Scroll Item');
  const notice = page.getByRole('status').filter({ hasText: 'first 20 of 40' });
  await expect(notice).toBeVisible();
  const lastResult = page.locator('.bookmark-item').last();
  await expect(lastResult).not.toBeInViewport();
  await page.locator('.accordion-container').hover();
  await page.mouse.wheel(0, 5_000);
  await expect(lastResult).toBeInViewport();
  await expect(notice).toBeInViewport();
});

test('search history ignores abandoned queries and supports the keyboard', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'E2E History Keys', [
    { title: 'Keyboard Target', url: 'https://e2e.invalid/keys' },
  ]);
  const storedHistory = () =>
    extensionWorker.evaluate(
      async (key) => (await chrome.storage.local.get(key))[key] as string[] | undefined,
      SEARCH_HISTORY_KEY,
    );

  await openPopup(page, extensionId);
  const search = page.getByPlaceholder('Search bookmarks...');

  await search.fill('Abandoned One');
  await page.getByRole('button', { name: 'Match case' }).click();
  await page.getByRole('button', { name: 'Match case' }).click();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  expect(await storedHistory()).toBeUndefined();

  await search.fill('Keyboard Target');
  await search.press('Enter');
  await expect.poll(storedHistory).toEqual(['Keyboard Target']);

  await search.fill('');
  const history = page.getByTestId('search-history');
  await expect(history).toBeVisible();
  await search.press('Escape');
  await expect(history).toHaveCount(0);

  await search.press('ArrowDown');
  await expect(history.getByRole('option', { name: 'Keyboard Target' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await search.press('Enter');
  await expect(search).toHaveValue('Keyboard Target');
  await expect(bookmarkRow(page, 'Keyboard Target')).toBeVisible();
});

test('theme toggle follows the system theme and AI button hides when AI is off', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openPopup(page, extensionId);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('button', { name: 'AI folder recommendation' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Light mode' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect
    .poll(() =>
      extensionWorker.evaluate(async () => {
        const stored = await chrome.storage.sync.get('bookmark-scout-settings');
        return stored['bookmark-scout-settings']?.theme;
      }),
    )
    .toBe('light');

  await setSettings(extensionWorker, { aiEnabled: true });
  await expect(page.getByRole('button', { name: 'AI folder recommendation' })).toBeVisible();
  await expect(folderRow(page, 'Other bookmarks')).toBeVisible();
});
