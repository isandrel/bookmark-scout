/**
 * The manager's History (the Bookmark Audit History) in a real browser: a deletion in the manager
 * shows as one verified record with its items, and the record is still there after the browser
 * restarts with the same profile, when the session's undo history is gone.
 */
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, launchExtension, test, toastRegion } from './fixtures';
import { managerUrl, managerRow as row } from './manager-helpers';
import { childTitles, seedFolder } from './popup-helpers';
import { setSettings } from './storage';
import { removeTempDir } from './temp-dirs';
import { childrenOf, openTools, toolCard } from './tool-helpers';

test.use({ viewport: { width: 1400, height: 900 } });

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
    ({ context, worker, extensionId } = await launchExtension(
      userDataDir,
      extensionPath,
      extensionBrowser,
    ));
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
    // Where it was, as label and value rows.
    const place = item.locator('[data-slot="history-item-place"]');
    await expect(place.locator('dt')).toHaveText(['Was in', 'Position']);
    await expect(place.locator('dd')).toHaveText([`${seeded.barTitle} / History Folder`, '2']);
    await expect(record.getByTestId('history-record-facts')).toContainText(
      'Checked after the change: the bookmarks are as it left them.',
    );
    // The session still holds the change, so it can be undone from here.
    await expect(record.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('history-expanded.png') });
    await context.close();

    // A restart ends the session (and its undo history) but not the record.
    ({ context, worker, extensionId } = await launchExtension(
      userDataDir,
      extensionPath,
      extensionBrowser,
    ));
    const after = await context.newPage();
    await after.goto(managerUrl(extensionId, seeded.folderId));
    const reopened = await openHistory(after);
    const kept = reopened.getByTestId('history-record').first();
    await expect(kept.getByTestId('history-record-label')).toHaveText('Delete "Old Projects"');
    await expect(kept.getByTestId('history-record-status')).toHaveText('Verified');
    await kept.getByRole('button', { expanded: false }).click();
    await expect(kept.getByTestId('history-item')).toContainText('2 items inside');
    // Undo is gone with the session, but the removed folder was kept as a recovery point.
    await expect(kept.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    await expect(kept.getByTestId('history-restore-hint')).toBeVisible();
    await after.screenshot({ path: testInfo.outputPath('history-after-restart.png') });
    await kept.getByRole('button', { name: 'Restore', exact: true }).click();
    await after
      .getByRole('dialog', { name: 'Restore removed items?' })
      .getByRole('button', { name: 'Restore' })
      .click();
    // Back in its place, with what was inside it (new ids, the same content).
    await expect
      .poll(() => childTitles(worker, seeded.folderId))
      .toEqual(['Keep me', 'Old Projects']);
    // The folder appears before what was inside it is created again.
    const restored = () =>
      worker.evaluate(async (parentId) => {
        const children = await chrome.bookmarks.getChildren(parentId);
        const folder = children.find((child) => child.title === 'Old Projects');
        return folder
          ? (await chrome.bookmarks.getChildren(folder.id)).map((child) => [
              child.title,
              child.url ?? null,
            ])
          : [];
      }, seeded.folderId);
    await expect.poll(restored).toEqual([
      ['Spec', 'https://e2e.invalid/spec#part-2'],
      ['Empty inside', null],
    ]);
    await expect(kept).toContainText('Undone');
    await expect(kept.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0);
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
  // Seeding through the browser API is a change from elsewhere; this test is about own changes.
  await dialog.getByRole('radio', { name: 'Bookmark Scout' }).click();
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

  // Redo brings the change back, recorded once more and linked; the change can be undone again.
  await records.nth(1).getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Second']);
  await expect(records).toHaveCount(3);
  await expect(records.first().getByTestId('history-record-label')).toHaveText(
    'Redone: Delete "First"',
  );
  const original = records.nth(2);
  await expect(original).not.toContainText('Undone');
  await expect(original.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
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
  await tool.getByRole('button', { name: /^Remove \d+ duplicates?$/ }).click();
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
  // The exact address, never normalized, as a link.
  await expect(items.nth(0).locator('[data-slot="history-item-url"]')).toHaveAttribute(
    'href',
    'https://e2e.invalid/same?sig=a%2Fb&x=1',
  );
  await expect(items.nth(0)).toContainText('https://e2e.invalid/same?sig=a%2Fb&x=1');
  await page.screenshot({ path: test.info().outputPath('history-duplicates.png') });
});

/** Waits until the background has taken its first baseline of the bookmarks. */
async function waitForBaseline(worker: Worker) {
  await expect
    .poll(() =>
      worker.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('bookmark-scout-audit');
            open.onsuccess = () => {
              const db = open.result;
              if (!db.objectStoreNames.contains('meta')) return resolve(false);
              const read = db.transaction('meta').objectStore('meta').get('observer');
              read.onsuccess = () => resolve(read.result !== undefined);
              read.onerror = () => resolve(false);
            };
            open.onerror = () => resolve(false);
          }),
      ),
    )
    .toBe(true);
}

test('a change made outside Bookmark Scout shows as from an unknown source, its own changes do not (X01, X07, H22)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await setSettings(extensionWorker, { confirmBeforeDelete: false, sortOrder: 'browser' });
  await waitForBaseline(extensionWorker);
  // Seeded through the browser API: itself a change from elsewhere, in the same burst.
  const seeded = await seedFolder(extensionWorker, 'History Outside', [
    { title: 'Mine to delete', url: 'https://e2e.invalid/mine' },
  ]);
  // With no Bookmark Scout page open, something else adds and renames bookmarks through the
  // browser (here the API itself, as another extension would).
  await extensionWorker.evaluate(async (parentId) => {
    const added = await chrome.bookmarks.create({
      parentId,
      title: 'Added elsewhere',
      url: 'https://e2e.invalid/elsewhere?x=1',
    });
    await chrome.bookmarks.update(added.id, { title: 'Renamed elsewhere' });
  }, seeded.folderId);

  await page.goto(managerUrl(extensionId, seeded.folderId));
  await deleteRow(page, 'Mine to delete');
  const dialog = await openHistory(page);
  const records = dialog.getByTestId('history-record');
  // Bookmark Scout's own deletion is one record, never also an unknown one.
  await dialog.getByRole('radio', { name: 'Bookmark Scout' }).click();
  await expect(records).toHaveCount(1);
  await expect(records.first().getByTestId('history-record-label')).toHaveText(
    'Delete "Mine to delete"',
  );
  await expect(records.first()).toContainText('Manager');
  // Everything else came from outside, as one burst.
  await dialog.getByRole('radio', { name: 'From elsewhere' }).click();
  await expect(records).toHaveCount(1);
  const outside = records.first();
  await expect(outside).toContainText('Source unknown (observed browser event)');
  await expect(outside.getByTestId('history-record-status')).toHaveText('Observed');
  await outside.getByRole('button', { expanded: false }).click();
  await expect(outside.getByTestId('history-undo-unavailable')).toHaveText(
    'Not made by Bookmark Scout, so it cannot be undone here.',
  );
  const items = outside.getByTestId('history-item');
  // The seeded folder and bookmark, then the addition and the rename.
  await expect(items).toHaveCount(4);
  await expect(items.nth(2)).toContainText('Added elsewhere');
  await expect(items.nth(2)).toContainText('https://e2e.invalid/elsewhere?x=1');
  await expect(items.nth(3)).toContainText('Added elsewhere');
  await expect(items.nth(3)).toContainText('Renamed elsewhere');
  await page.screenshot({ path: test.info().outputPath('history-outside.png') });
});

test('changes made while recording was paused show as one difference after a gap (X10, X16)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  await waitForBaseline(extensionWorker);
  const seeded = await seedFolder(extensionWorker, 'History Gap', [
    { title: 'Before the gap', url: 'https://e2e.invalid/gap' },
  ]);
  await setSettings(extensionWorker, { historyRecordOutsideChanges: false });
  await extensionWorker.evaluate(async (parentId) => {
    const [first] = await chrome.bookmarks.getChildren(parentId);
    await chrome.bookmarks.update(first.id, { title: 'Changed during the gap' });
    await chrome.bookmarks.create({ parentId, title: 'Added during the gap' });
  }, seeded.folderId);
  await setSettings(extensionWorker, { historyRecordOutsideChanges: true });

  await page.goto(managerUrl(extensionId, seeded.folderId));
  const dialog = await openHistory(page);
  const record = dialog.getByTestId('history-record').first();
  await expect(record).toContainText('Detected after a gap (net difference)');
  await record.getByRole('button', { expanded: false }).click();
  await expect(record.getByTestId('history-record-facts')).toContainText('exact times unknown');
  await expect(record.getByTestId('history-item')).toHaveCount(2);
  await expect(record.getByTestId('history-item').first()).toContainText('Changed during the gap');
});
