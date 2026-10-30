import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { openPopup, seedFolder, setSettings } from './popup-helpers';
import { readStored, STORAGE_ITEMS } from './storage';

// The harness opens the popup as a tab, which gets no activeTab (the toolbar button grants it),
// so these tests grant the optional tabs permission to read the current page.
test.use({ grantPermissions: ['tabs'] });

const ROOT = 'E2E Folder Match';

async function seedLibrary(worker: Worker) {
  return seedFolder(worker, ROOT, [
    {
      title: 'Dev',
      children: [
        { title: 'Frontend', children: [{ title: 'React', children: [{ title: 'Hooks' }] }] },
      ],
    },
    { title: 'Reading', children: [{ title: 'Hooks' }] },
  ]);
}

async function childCount(worker: Worker, folderId: string): Promise<number> {
  return worker.evaluate(
    async (id) => (await chrome.bookmarks.getChildren(id)).filter((node) => node.url).length,
    folderId,
  );
}

/** Folder ids by path, since both seeded folders are called "Hooks". */
async function hooksFolders(worker: Worker): Promise<{ deep: string; reading: string }> {
  return worker.evaluate(async () => {
    const [hooks, react, reading] = await Promise.all([
      chrome.bookmarks.search({ title: 'Hooks' }),
      chrome.bookmarks.search({ title: 'React' }),
      chrome.bookmarks.search({ title: 'Reading' }),
    ]);
    const under = (parentId: string) => hooks.find((node) => node.parentId === parentId)?.id ?? '';
    return { deep: under(react[0].id), reading: under(reading[0].id) };
  });
}

function matches(page: Page) {
  return page.getByTestId('folder-matches').locator('[data-slot="folder-match"]');
}

test('typing words from a folder path lists the folder, and ArrowDown then Enter saves there', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedLibrary(extensionWorker);
  const { deep } = await hooksFolders(extensionWorker);
  await openPopup(page, extensionId);

  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  await search.fill('react hooks');
  await expect(matches(page)).toHaveCount(1);
  await expect(matches(page).first()).toContainText('Hooks');
  await expect(matches(page).first()).toContainText('Frontend / React');

  await search.press('ArrowDown');
  await expect(matches(page).first()).toBeFocused();
  await expect(page.getByTestId('popup-hint-bar')).toContainText('Save here');
  await page.keyboard.press('Enter');

  await expect.poll(() => childCount(extensionWorker, deep)).toBe(1);
  await expect(toastRegion(page).getByText(/Bookmark Added$/)).toBeVisible();
});

test('a query with operators finds bookmarks only, so Enter never saves into a folder', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedLibrary(extensionWorker);
  const { deep } = await hooksFolders(extensionWorker);
  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });

  await search.fill('react hooks');
  await expect(matches(page)).toHaveCount(1);
  await search.fill('folder:react hooks');
  await expect(matches(page)).toHaveCount(0);
  await search.press('Enter');

  // Enter without a folder match records the search instead.
  await expect
    .poll(() => readStored<string[]>(extensionWorker, STORAGE_ITEMS.searchHistory))
    .toEqual(['folder:react hooks']);
  expect(await childCount(extensionWorker, deep)).toBe(0);
});

test('folder matches put exact names first, match a word spelled a little differently, and rank recent folders higher', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedLibrary(extensionWorker);
  const { deep } = await hooksFolders(extensionWorker);
  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });

  // React first; the folders inside it follow, found by its name in their path.
  await search.fill('rect');
  await expect(matches(page).first()).toContainText('React');

  // Two folders named Hooks: the shallower one first, until the deeper one is used.
  await search.fill('hooks');
  await expect(matches(page)).toHaveCount(2);
  await expect(matches(page).first()).toContainText('Reading');
  await matches(page).nth(1).click();
  await expect.poll(() => childCount(extensionWorker, deep)).toBe(1);

  await search.fill('');
  await search.fill('hooks');
  await expect(matches(page).first()).toContainText('Frontend / React');
});

test('folder match settings hide the list, limit its length, and turn off fuzzy matching', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedLibrary(extensionWorker);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });

  await setSettings(extensionWorker, { folderMatchesMax: 1 });
  await openPopup(page, extensionId);
  await search.fill('hooks');
  await expect(matches(page)).toHaveCount(1);

  await setSettings(extensionWorker, { searchFuzzy: false });
  await search.fill('rect');
  await expect(page.getByTestId('folder-matches')).toHaveCount(0);
  await search.fill('react');
  await expect(matches(page)).toHaveCount(1);

  await setSettings(extensionWorker, { folderMatchesEnabled: false });
  await search.fill('hooks');
  // The bookmark results still show; only the folder list is gone.
  await expect(page.locator('.folder-item').filter({ hasText: 'Hooks' }).first()).toBeVisible();
  await expect(page.getByTestId('folder-matches')).toHaveCount(0);
});

test('Enter in the search box saves to the first folder match, which is highlighted, never while composing', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedLibrary(extensionWorker);
  const { deep, reading } = await hooksFolders(extensionWorker);
  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });

  // The first match is the combobox's default option: highlighted, and named by the key hints.
  await search.fill('hooks');
  await expect(matches(page)).toHaveCount(2);
  const first = matches(page).first();
  await expect(first).toContainText('Reading');
  await expect(first).toHaveAttribute('data-active', 'true');
  await expect(matches(page).nth(1)).not.toHaveAttribute('data-active');
  const hint = page.getByTestId('popup-hint-bar');
  await expect(hint).toContainText('Save to Hooks');
  const describedBy = await search.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toContainText('Save to Hooks');

  // An IME's Enter confirms the word being composed, so it saves nothing (Chrome marks the
  // keydown as composing, or with keyCode 229 for the one that ends the composition).
  for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
    await search.evaluate((input, extra) => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...extra }),
      );
    }, init);
  }
  await page.waitForTimeout(500);
  expect(await childCount(extensionWorker, reading)).toBe(0);
  expect(await readStored(extensionWorker, STORAGE_ITEMS.searchHistory)).toBeUndefined();

  await search.press('Enter');
  await expect.poll(() => childCount(extensionWorker, reading)).toBe(1);
  await expect(toastRegion(page).getByText(/Bookmark Added$/)).toBeVisible();
  expect(await childCount(extensionWorker, deep)).toBe(0);
  // The keyboard stays in the search box, ready for the next search.
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('hooks');

  // Enter right after typing, before the matches follow the search, uses what was typed.
  await search.fill('react hooks');
  await search.press('Enter');
  await expect.poll(() => childCount(extensionWorker, deep)).toBe(1);
  expect(await childCount(extensionWorker, reading)).toBe(1);

  // Without a folder match, Enter keeps its meaning: the search goes into recent searches.
  await search.fill('qqqq');
  await expect(page.getByTestId('folder-matches')).toHaveCount(0);
  await search.press('Enter');
  await expect
    .poll(() => readStored<string[]>(extensionWorker, STORAGE_ITEMS.searchHistory))
    .toContain('qqqq');
});

test('the side panel saves to the first folder match on Enter too', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedLibrary(extensionWorker);
  const { deep } = await hooksFolders(extensionWorker);
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  await search.fill('react hooks');
  await expect(matches(page).first()).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('popup-hint-bar')).toContainText('Save to Hooks');
  await search.press('Enter');
  await expect.poll(() => childCount(extensionWorker, deep)).toBe(1);
});

test('a page saved elsewhere says where, and a save into another folder says it is another copy', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { barTitle } = await seedLibrary(extensionWorker);
  const { deep, reading } = await hooksFolders(extensionWorker);
  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  const savedIn = page.getByTestId('current-page-saved-in');
  await expect(page.getByTestId('current-page-line')).toBeVisible();
  await expect(savedIn).toHaveCount(0);

  await search.fill('hooks');
  await search.press('Enter');
  await expect.poll(() => childCount(extensionWorker, reading)).toBe(1);
  await expect(savedIn).toHaveText(`Already saved in ${barTitle} / ${ROOT} / Reading / Hooks`);
  await expect(toastRegion(page).getByText(/another copy/)).toHaveCount(0);

  // Saving it in another folder is allowed, and says so.
  await search.fill('react hooks');
  await search.press('Enter');
  await expect.poll(() => childCount(extensionWorker, deep)).toBe(1);
  await expect(
    toastRegion(page).getByText('This is another copy: the page is also in "Hooks".'),
  ).toBeVisible();
  await expect(savedIn).toContainText('Reading / Hooks');
  await expect(savedIn).toContainText('Frontend / React / Hooks');
});
