/**
 * The manager's History (the Bookmark Audit History) in a real browser: a deletion in the manager
 * shows as one verified record with its items, and the record is still there after the browser
 * restarts with the same profile, when the session's undo history is gone.
 */
import { type BrowserContext, chromium, type Page, type Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { managerUrl, managerRow as row } from './manager-helpers';
import { childTitles, seedFolder } from './popup-helpers';
import { setSettings } from './storage';
import { removeTempDir } from './temp-dirs';
import { childrenOf, openTools, toolCard } from './tool-helpers';

test.use({ viewport: { width: 1400, height: 900 } });

async function launch(userDataDir: string, extensionPath: string, channel: string) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel,
    headless: true,
    reducedMotion: 'reduce',
    viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  return { context, worker, extensionId: new URL(worker.url()).host };
}

async function openHistory(page: Page) {
  await page.getByRole('button', { name: 'Bookmark history' }).click();
  const dialog = page.getByTestId('history-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function deleteRow(page: Page, title: string) {
  await row(page, title).click({ position: { x: 200, y: 10 } });
  await page.keyboard.press('Delete');
  await expect(row(page, title)).toHaveCount(0);
}

test('a manager deletion is one verified record that survives a browser restart (H01, H03, H08)', async ({
  extensionPath,
  extensionBrowser,
}, testInfo) => {
  const userDataDir = testInfo.outputPath('history-profile');
  let context: BrowserContext | undefined;
  try {
    let worker: Worker;
    let extensionId: string;
    ({ context, worker, extensionId } = await launch(userDataDir, extensionPath, extensionBrowser));
    await setSettings(worker, { confirmBeforeDelete: false, sortOrder: 'browser' });
    const seeded = await seedFolder(worker, 'History Folder', [
      { title: 'Keep me', url: 'https://e2e.invalid/keep?b=2&a=1' },
      {
        title: 'Old Projects',
        children: [
          { title: 'Spec', url: 'https://e2e.invalid/spec#part-2' },
          { title: 'Empty inside', children: [] },
        ],
      },
    ]);
    const page = await context.newPage();
    await page.goto(managerUrl(extensionId, seeded.folderId));
    await deleteRow(page, 'Old Projects');
    expect(await childTitles(worker, seeded.folderId)).toEqual(['Keep me']);

    const dialog = await openHistory(page);
    const record = dialog.getByTestId('history-record').first();
    await expect(record.getByTestId('history-record-label')).toHaveText('Delete "Old Projects"');
    await expect(record.getByTestId('history-record-status')).toHaveText('Verified');
    await expect(record).toContainText('Manager');
    await record.getByRole('button', { expanded: false }).click();
    const item = record.getByTestId('history-item');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Deleted');
    await expect(item).toContainText('Old Projects');
    await expect(item).toContainText('2 items inside');
    await expect(item).toContainText('History Folder, position 2');
    await expect(record.getByTestId('history-record-facts')).toContainText(
      'Checked after the change: the bookmarks are as it left them.',
    );
    // The session still holds the change, so it can be undone from here.
    await expect(record.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('history-expanded.png') });
    await context.close();

    // A restart ends the session (and its undo history) but not the record.
    ({ context, worker, extensionId } = await launch(userDataDir, extensionPath, extensionBrowser));
    const after = await context.newPage();
    await after.goto(managerUrl(extensionId, seeded.folderId));
    const reopened = await openHistory(after);
    const kept = reopened.getByTestId('history-record').first();
    await expect(kept.getByTestId('history-record-label')).toHaveText('Delete "Old Projects"');
    await expect(kept.getByTestId('history-record-status')).toHaveText('Verified');
    await kept.getByRole('button', { expanded: false }).click();
    await expect(kept.getByTestId('history-item')).toContainText('2 items inside');
    await expect(kept.getByTestId('history-undo-unavailable')).toBeVisible();
    await expect(kept.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    await after.screenshot({ path: testInfo.outputPath('history-after-restart.png') });
  } finally {
    await context?.close();
    removeTempDir(userDataDir);
  }
});

test('undo from History is recorded once, linked to the change (H04, H05)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { confirmBeforeDelete: false, sortOrder: 'browser' });
  const seeded = await seedFolder(extensionWorker, 'History Undo', [
    { title: 'First', url: 'https://e2e.invalid/1' },
    { title: 'Second', url: 'https://e2e.invalid/2' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await deleteRow(page, 'First');

  const dialog = await openHistory(page);
  const record = dialog.getByTestId('history-record').first();
  await record.getByRole('button', { expanded: false }).click();
  await record.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(() => childTitles(extensionWorker, seeded.folderId))
    .toEqual(['First', 'Second']);

  const records = dialog.getByTestId('history-record');
  await expect(records).toHaveCount(2);
  await expect(records.first().getByTestId('history-record-label')).toHaveText(
    'Undone: Delete "First"',
  );
  await expect(records.nth(1)).toContainText('Undone');
  // The undone change offers no second undo.
  await expect(records.nth(1).getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('history-undo.png') });
});

test('a Duplicate Cleaner result opens its record in History, with the removed copies (H01)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const folder = await seedFolder(extensionWorker, 'History Duplicates', [
    { title: 'Copy one', url: 'https://e2e.invalid/same?sig=a%2Fb&x=1' },
    { title: 'Copy two', url: 'https://e2e.invalid/same?sig=a%2Fb&x=1' },
    { title: 'Copy three', url: 'https://e2e.invalid/same?sig=a%2Fb&x=1' },
    { title: 'Unique', url: 'https://e2e.invalid/unique' },
  ]);
  await setSettings(extensionWorker, {
    duplicatesKeepRule: 'first',
    duplicatesDefaultScope: 'all',
  });
  await openTools(page, extensionId, folder.folderId);
  await toolCard(page, 'Duplicate Cleaner').getByRole('button', { name: 'Scan' }).click();
  const tool = page.getByRole('dialog', { name: 'Duplicate Cleaner' });
  await tool.getByRole('button', { name: 'Remove duplicates' }).click();
  await expect
    .poll(async () =>
      (await childrenOf(extensionWorker, folder.folderId)).map((item) => item.title),
    )
    .toEqual(['Copy one', 'Unique']);

  await toastRegion(page).getByTestId('view-in-history').click();
  const history = page.getByTestId('history-dialog');
  await expect(history).toBeVisible();
  const record = history.locator('[data-testid="history-record"]').first();
  await expect(record.getByTestId('history-record-label')).toHaveText(
    'Delete 2 items (Duplicate Cleaner)',
  );
  await expect(record).toContainText('Tools');
  // View in History opens the record.
  const items = record.getByTestId('history-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Copy two');
  await expect(items.nth(1)).toContainText('Copy three');
  // The exact address, never normalized.
  await expect(items.nth(0)).toContainText('https://e2e.invalid/same?sig=a%2Fb&x=1');
  await page.screenshot({ path: test.info().outputPath('history-duplicates.png') });
});
