import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { openPopup, seedFolder, setSettings } from './popup-helpers';

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

  const search = page.getByRole('combobox', { name: 'Search bookmarks...' });
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

test('folder matches put exact names first, forgive one typo, and rank recent folders higher', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedLibrary(extensionWorker);
  const { deep } = await hooksFolders(extensionWorker);
  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks...' });

  await search.fill('rect');
  await expect(matches(page)).toHaveCount(1);
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

test('folder match settings hide the list, limit its length, and turn off typo matching', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedLibrary(extensionWorker);
  const search = page.getByRole('combobox', { name: 'Search bookmarks...' });

  await setSettings(extensionWorker, { folderMatchesMax: 1 });
  await openPopup(page, extensionId);
  await search.fill('hooks');
  await expect(matches(page)).toHaveCount(1);

  await setSettings(extensionWorker, { folderMatchesTypos: false });
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
