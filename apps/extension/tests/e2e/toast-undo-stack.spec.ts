import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { bookmarkRow, childTitles, openPopup, seedFolder, setSettings } from './popup-helpers';

const TITLES = ['Stack One', 'Stack Two', 'Stack Three', 'Stack Four', 'Stack Five'];

function toastFor(page: Page, title: string) {
  return page.locator('ol > li').filter({ hasText: `Deleted "${title}". Undo within 10 seconds.` });
}

async function toastStackHeight(page: Page) {
  return page.locator('ol:has(> li)').evaluate((list) => list.getBoundingClientRect().height);
}

test('manager keeps every deletion undoable when several land within the undo window', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await setSettings(extensionWorker, { confirmBeforeDelete: false });
  const seeded = await seedFolder(
    extensionWorker,
    'E2E Undo Stack',
    TITLES.map((title) => ({ title, url: `https://e2e.invalid/${title.replace(' ', '-')}` })),
  );
  await page.goto(`chrome-extension://${extensionId}/bookmarks.html?id=${seeded.folderId}`);

  for (const title of TITLES.slice(0, 4)) {
    const row = page.locator('tbody tr').filter({ hasText: title });
    await row.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(row).toHaveCount(0);
  }
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Stack Five']);

  // The first deletion still has its own Undo after three more arrived.
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(4);
  await toastFor(page, 'Stack One').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['Stack One', 'Stack Five']);
});

test('popup stacks undo toasts compactly and keeps the oldest undoable', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 500 });
  await setSettings(extensionWorker, { confirmBeforeDelete: false });
  const seeded = await seedFolder(
    extensionWorker,
    'E2E Popup Undo Stack',
    TITLES.map((title) => ({ title, url: `https://e2e.invalid/${title.replace(' ', '-')}` })),
  );

  await openPopup(page, extensionId);
  await page.getByPlaceholder('Search bookmarks...').fill('Stack');
  for (const title of TITLES) {
    const row = bookmarkRow(page, title);
    await row.hover();
    await row.getByTitle('Delete bookmark').click();
    await expect(row).toHaveCount(0);
  }
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual([]);

  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(5);
  // Older toasts collapse to one line and the stack never covers more than half the popup.
  await expect(page.locator('ol > li[data-compact]')).toHaveCount(4);
  expect(await toastStackHeight(page)).toBeLessThanOrEqual(250);

  const oldest = toastFor(page, 'Stack One');
  await oldest.scrollIntoViewIfNeeded();
  await oldest.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Stack One']);
});
