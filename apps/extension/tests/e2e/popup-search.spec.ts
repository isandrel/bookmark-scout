import { expect, test } from './fixtures';
import {
  bookmarkRow,
  folderRow,
  openPopup,
  otherBookmarksTitle,
  seedFolder,
  setSettings,
  toggleSearchOption,
} from './popup-helpers';
import { readSettings, readStored, STORAGE_ITEMS, seedAIServices, writeStored } from './storage';

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
  await page
    .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
    .fill('Needle Link');
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

test('search finds bookmarks by address, tag, and summary, and says where each matched', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { ids } = await seedFolder(extensionWorker, 'E2E Unified Search', [
    { title: 'Quarterly plan', url: 'https://docs.e2e.invalid/roadmap-q3' },
    { title: 'Soup', url: 'https://food.e2e.invalid/soup' },
    { title: 'Standup notes', url: 'https://e2e.invalid/standup' },
  ]);
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids.Soup]: { tags: ['Dinner'] },
    [ids['Standup notes']]: { summary: 'Daily sync for the platform team' },
  });

  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  const reasons = page.locator('[data-slot="search-reason"]');

  await search.fill('roadmap');
  await expect(bookmarkRow(page, 'Quarterly plan')).toBeVisible();
  await expect(page.locator('.bookmark-item')).toHaveCount(1);
  await expect(reasons).toHaveText(['in URL']);

  await search.fill('tag:dinner');
  await expect(bookmarkRow(page, 'Soup')).toBeVisible();
  await expect(page.locator('.bookmark-item')).toHaveCount(1);
  await expect(reasons).toHaveText(['tag: Dinner']);

  await search.fill('platform');
  await expect(bookmarkRow(page, 'Standup notes')).toBeVisible();
  await expect(reasons).toHaveText(['in summary']);

  // Every word must match somewhere; a title match needs no note.
  await search.fill('soup dinner');
  await expect(page.locator('.bookmark-item')).toHaveCount(1);
  await expect(bookmarkRow(page, 'Soup').locator('mark')).toHaveText('Soup');
  await expect(reasons).toHaveCount(0);

  // Match case searches titles only, as before.
  await toggleSearchOption(page, 'Match case');
  await search.fill('roadmap');
  await expect(page.getByText('No bookmarks found')).toBeVisible();
});

test('OR and parentheses find either term, say only the branch each result matched, and flag an unclosed group', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { ids } = await seedFolder(extensionWorker, 'E2E Search OR', [
    { title: 'Soup', url: 'https://food.e2e.invalid/soup' },
    { title: 'Salad', url: 'https://food.e2e.invalid/salad' },
    { title: 'Cake', url: 'https://food.e2e.invalid/cake' },
    { title: 'Notes', url: 'https://e2e.invalid/notes' },
  ]);
  await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
    [ids.Soup]: { tags: ['Dinner'] },
    [ids.Salad]: { tags: ['Lunch'] },
    [ids.Cake]: { tags: ['Dinner', 'Archived'] },
  });

  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  const reason = (title: string) => bookmarkRow(page, title).locator('[data-slot="search-reason"]');

  await search.fill('(tag:dinner OR tag:lunch) -tag:archived');
  await expect(page.locator('.bookmark-item')).toHaveCount(2);
  // Each result names the branch it matched, never the other one.
  await expect(reason('Soup')).toHaveText('tag: Dinner');
  await expect(reason('Salad')).toHaveText('tag: Lunch');
  await expect(page.getByTestId('search-query-problem')).toHaveCount(0);

  await search.fill('soup OR salad');
  await expect(page.locator('.bookmark-item')).toHaveCount(2);
  await expect(bookmarkRow(page, 'Soup').locator('mark')).toHaveText('Soup');
  await expect(bookmarkRow(page, 'Salad').locator('mark')).toHaveText('Salad');

  // A lowercase or is a word to find, as before.
  await search.fill('soup or salad');
  await expect(page.getByText('No bookmarks found')).toBeVisible();

  // An unclosed group says so, and still searches what it holds.
  await search.fill('(soup OR salad');
  await expect(page.getByTestId('search-query-problem')).toHaveText(
    'A parenthesis is not closed, so the group runs to the end.',
  );
  await expect(page.locator('.bookmark-item')).toHaveCount(2);
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
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  await search.fill('bar');
  await expect(bookmarkRow(page, 'Bar Chart Tools')).toBeVisible();
  await expect(page.getByText('Plain Entry', { exact: true })).toHaveCount(0);

  await search.fill('other');
  await expect(page.getByText('No bookmarks found')).toBeVisible();

  await toggleSearchOption(page, 'Advanced pattern search');
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
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  await toggleSearchOption(page, 'Match whole word');

  await search.fill('ブックマーク');
  await expect(bookmarkRow(page, '日本語のブックマーク').locator('mark')).toHaveText(
    'ブックマーク',
  );
  await search.fill('C++');
  await expect(bookmarkRow(page, 'Learn C++ today')).toBeVisible();
  await search.fill('C#');
  await expect(bookmarkRow(page, 'C# notes')).toBeVisible();
  await search.fill('Java');
  await expect(page.getByText('No bookmarks found')).toBeVisible();

  await toggleSearchOption(page, 'Match whole word');
  await toggleSearchOption(page, 'Advanced pattern search');
  await search.fill('[x');
  await expect(page.getByRole('alert')).toContainText('Invalid regular expression');
  await search.fill('[x]');
  await expect(page.getByRole('alert')).toHaveCount(0);
  // A pattern that repeats a repeating group could freeze the popup: it is searched as text.
  await search.fill('(a+)+$');
  await expect(page.getByRole('alert')).toContainText('could take too long');
});

test('a query the operators cannot use says so under the search box', async ({
  extensionId,
  page,
}) => {
  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  const problem = page.getByTestId('search-query-problem');
  await search.fill('is:bogus recipe');
  await expect(problem).toHaveText('is:bogus is not a known value, so it is left out.');
  await search.fill('after:yesterday recipe');
  await expect(problem).toContainText('is not a date in the form YYYY-MM-DD');
  await search.fill('recipe');
  await expect(problem).toHaveCount(0);
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
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  await expect(search).toBeFocused();
  await expect(page.getByTestId('search-history')).toHaveCount(0);

  await page.keyboard.type('Scroll Item');
  const notice = page.getByRole('status').filter({ hasText: 'first 20 of 40' });
  await expect(notice).toBeVisible();
  const lastResult = page.locator('.bookmark-item').last();
  await expect(lastResult).not.toBeInViewport();
  await page.getByRole('tree').hover();
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
  const storedHistory = () => readStored<string[]>(extensionWorker, STORAGE_ITEMS.searchHistory);

  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });

  await search.fill('Abandoned One');
  await toggleSearchOption(page, 'Match case');
  await toggleSearchOption(page, 'Match case');
  await page.getByRole('button', { name: 'Clear search' }).first().click();
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

  await search.press('Alt+ArrowDown');
  await expect(history).toBeVisible();
  await search.press('ArrowDown');
  await expect(history.getByRole('option', { name: 'Keyboard Target' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await search.press('Enter');
  await expect(search).toHaveValue('Keyboard Target');
  await expect(bookmarkRow(page, 'Keyboard Target')).toBeVisible();
});

test('ArrowDown enters the tree even with search history, which Alt+ArrowDown opens', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E History Tree', []);
  await writeStored(extensionWorker, STORAGE_ITEMS.searchHistory, ['Older Query', 'Newer Query']);

  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  const history = page.getByTestId('search-history');
  await expect(search).toBeFocused();

  // The key hints promise that ↓ moves into the tree.
  await search.press('ArrowDown');
  await expect(page.locator(`[data-folder-trigger="${seeded.barId}"]`)).toBeFocused();
  await expect(history).toHaveCount(0);

  await page.keyboard.press('ArrowUp');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('title', /(Alt|⌥)\+↓ show recent searches/);
  await search.press('Alt+ArrowDown');
  await expect(history.getByRole('option')).toHaveText(['Older Query', 'Newer Query']);

  // Clear is reachable from the keyboard, and the list stays open while it has focus.
  await page.keyboard.press('Tab');
  const clear = history.getByRole('button', { name: 'Clear', exact: true });
  await expect(clear).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(history).toHaveCount(0);
  await expect(search).toBeFocused();
  await expect.poll(() => readStored(extensionWorker, STORAGE_ITEMS.searchHistory)).toBeUndefined();
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
  await expect.poll(async () => (await readSettings(extensionWorker)).theme).toBe('light');

  // The AI buttons show once a service is set up; a local server needs no key.
  await seedAIServices(extensionWorker, [{ provider: 'ollama' }]);
  await setSettings(extensionWorker, { aiEnabled: true });
  await expect(page.getByRole('button', { name: 'AI folder recommendation' })).toBeVisible();
  await expect(folderRow(page, await otherBookmarksTitle(extensionWorker))).toBeVisible();
});

test('search results are a tree whose rows tell a screen reader their level and place among the shown rows (U38)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Aria Search', [
    { title: 'Aria Match One', url: 'https://e2e.invalid/one' },
    { title: 'Aria Hay', url: 'https://e2e.invalid/hay' },
    {
      title: 'Aria Inner',
      children: [
        { title: 'Aria Hay Deep', url: 'https://e2e.invalid/hay-deep' },
        { title: 'Aria Match Deep', url: 'https://e2e.invalid/deep' },
      ],
    },
    { title: 'Aria Match Two', url: 'https://e2e.invalid/two' },
  ]);
  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  const tree = page.getByRole('tree', { name: 'Bookmarks' });
  const titleOf = new Map([
    [seeded.barId, seeded.barTitle],
    [seeded.folderId, 'E2E Aria Search'],
    ...Object.entries(seeded.ids).map(([title, id]) => [id, title] as const),
  ]);
  /** Every row the tree shows, in order, as a screen reader is told about it. */
  const rows = async () =>
    (
      await tree.locator('[role="treeitem"]').evaluateAll((items) =>
        items.map((item) => ({
          id: item.getAttribute('data-tree-row-id') ?? '',
          level: Number(item.getAttribute('aria-level')),
          position: Number(item.getAttribute('aria-posinset')),
          of: Number(item.getAttribute('aria-setsize')),
          expanded: item.getAttribute('aria-expanded'),
        })),
      )
    ).map(({ id, ...row }) => ({ name: titleOf.get(id) ?? id, ...row }));

  await search.fill('Aria Match');
  await expect(bookmarkRow(page, 'Aria Match Deep')).toBeVisible();
  // Positions count only the rows the search keeps: the non-matching siblings are not in the set.
  await expect.poll(rows).toEqual([
    { name: seeded.barTitle, level: 1, position: 1, of: 1, expanded: 'true' },
    { name: 'E2E Aria Search', level: 2, position: 1, of: 1, expanded: 'true' },
    // Folders come first, as without a search.
    { name: 'Aria Inner', level: 3, position: 1, of: 3, expanded: 'true' },
    { name: 'Aria Match Deep', level: 4, position: 1, of: 1, expanded: null },
    { name: 'Aria Match One', level: 3, position: 2, of: 3, expanded: null },
    { name: 'Aria Match Two', level: 3, position: 3, of: 3, expanded: null },
  ]);
  await expect(page.getByText('Aria Hay', { exact: true })).toHaveCount(0);

  // A narrower search renumbers the set.
  await search.fill('"Aria Match T"');
  await expect.poll(rows).toEqual([
    { name: seeded.barTitle, level: 1, position: 1, of: 1, expanded: 'true' },
    { name: 'E2E Aria Search', level: 2, position: 1, of: 1, expanded: 'true' },
    { name: 'Aria Match Two', level: 3, position: 1, of: 1, expanded: null },
  ]);

  // The keys move through the same rows: Down from the box enters the tree at its first row.
  await search.fill('Aria Match');
  await expect(bookmarkRow(page, 'Aria Match Deep')).toBeVisible();
  await search.press('ArrowDown');
  const focused = () =>
    page.evaluate(() => {
      const item = document.activeElement;
      return {
        role: item?.getAttribute('role'),
        level: item?.getAttribute('aria-level'),
        position: item?.getAttribute('aria-posinset'),
        of: item?.getAttribute('aria-setsize'),
      };
    });
  await expect.poll(focused).toEqual({ role: 'treeitem', level: '1', position: '1', of: '1' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(focused).toEqual({ role: 'treeitem', level: '3', position: '1', of: '3' });
  await page.keyboard.press('ArrowDown');
  await expect.poll(focused).toEqual({ role: 'treeitem', level: '4', position: '1', of: '1' });
  await page.keyboard.press('ArrowDown');
  await expect.poll(focused).toEqual({ role: 'treeitem', level: '3', position: '2', of: '3' });
});
