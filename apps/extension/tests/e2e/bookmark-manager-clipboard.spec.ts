/**
 * The manager's clipboard and small commands across tabs and reloads: Cut or Copy in one tab
 * pastes in another and after a reload, a paste that moves nothing keeps the cut and says why,
 * Copy Bookmark ID confirms, Add new bookmark completes a typed host to https, and dropped text
 * without a link says so.
 */
import type { Locator } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { managerUrl, managerRow as row, treeFolder, waitForNoOverlay } from './manager-helpers';
import { childTitles, seedFolder, setSettings } from './popup-helpers';

const ROW_CLICK = { position: { x: 200, y: 10 } };

test.use({ viewport: { width: 1400, height: 900 } });

test.beforeEach(async ({ extensionWorker }) => {
  await setSettings(extensionWorker, { confirmBeforeDelete: false, sortOrder: 'alphabetical' });
});

test('Copy in one manager tab pastes in another, and Cut survives a reload', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const seeded = await seedFolder(extensionWorker, 'E2E Clip Tabs', [
    { title: 'Tab Target', children: [] },
    { title: 'Tab Link', url: 'https://e2e.invalid/tab-link' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await row(page, 'Tab Link').click(ROW_CLICK);
  await page.keyboard.press('ControlOrMeta+c');
  await expect(toastRegion(page).getByText(/^✓ Copied .?Tab Link.?$/)).toBeVisible();

  // Another manager tab pastes it.
  const other = await context.newPage();
  await other.goto(managerUrl(extensionId, seeded.ids['Tab Target']));
  await expect(other.getByText('No results.')).toBeVisible();
  await other.keyboard.press('ControlOrMeta+v');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Tab Target']))
    .toEqual(['Tab Link']);
  await other.close();

  // Cut, reload, and paste: it moves once.
  await row(page, 'Tab Link').click(ROW_CLICK);
  await page.keyboard.press('ControlOrMeta+x');
  await expect(toastRegion(page).getByText(/^✓ Cut .?Tab Link.?$/)).toBeVisible();
  await page.reload();
  await treeFolder(page, 'Tab Target').focus();
  await page.keyboard.press('ControlOrMeta+v');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids['Tab Target']))
    .toEqual(['Tab Link', 'Tab Link']);
  await expect.poll(() => childTitles(extensionWorker, seeded.folderId)).toEqual(['Tab Target']);
});

test('a paste that moves nothing keeps the cut and says why', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const seeded = await seedFolder(extensionWorker, 'E2E Clip Fail', [
    { title: 'Parent Box', children: [{ title: 'Child Box', children: [] }] },
    { title: 'Elsewhere', children: [] },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));
  await row(page, 'Parent Box').click(ROW_CLICK);
  await page.keyboard.press('ControlOrMeta+x');
  await expect(toastRegion(page).getByText(/^✓ Cut .?Parent Box.?$/)).toBeVisible();

  // A folder cannot go inside itself: nothing moves, and the toast is not a success.
  await treeFolder(page, 'Parent Box').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(treeFolder(page, 'Child Box')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+v');
  const notice = toastRegion(page).getByText('Nothing was pasted', { exact: true });
  await expect(notice).toBeVisible();
  await expect(
    toastRegion(page).getByText(
      'Skipped because they were deleted or would go inside themselves: 1.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(toastRegion(page).getByText(/Pasted 0/)).toHaveCount(0);

  // The cut is kept, so it still pastes somewhere it can go.
  await treeFolder(page, 'Elsewhere').focus();
  await page.keyboard.press('ControlOrMeta+v');
  await expect
    .poll(() => childTitles(extensionWorker, seeded.ids.Elsewhere))
    .toEqual(['Parent Box']);
});

test('Copy Bookmark ID confirms, Add new bookmark completes a host, and text drops say so', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const seeded = await seedFolder(extensionWorker, 'E2E Small Commands', [
    { title: 'Id Link', url: 'https://e2e.invalid/id' },
  ]);
  await page.goto(managerUrl(extensionId, seeded.folderId));

  await row(page, 'Id Link').click({ button: 'right', ...ROW_CLICK });
  await page.getByRole('menuitem', { name: 'Copy Bookmark ID' }).click();
  await expect(toastRegion(page).getByText('✓ Copied ID', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(seeded.ids['Id Link']);
  await waitForNoOverlay(page);

  // A host without a scheme gets https://, as in the browser's own add dialog.
  await page.getByTestId('organize-menu').click();
  await page.getByRole('menuitem', { name: 'Add new bookmark' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add bookmark' });
  await dialog.getByLabel('Name').fill('Typed Host');
  await dialog.getByLabel('URL').fill('example.com/path');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (id) =>
          (await chrome.bookmarks.getChildren(id)).find((child) => child.title === 'Typed Host')
            ?.url,
        seeded.folderId,
      ),
    )
    .toBe('https://example.com/path');

  // A script address is still refused.
  await page.getByTestId('organize-menu').click();
  await page.getByRole('menuitem', { name: 'Add new bookmark' }).click();
  await dialog.getByLabel('URL').fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toContainText('javascript:');
  await page.keyboard.press('Escape');
  await waitForNoOverlay(page);

  // Text with no web address dropped from another app adds nothing, and says so.
  await dropText(page.getByTestId('bookmark-table-menu-area'), 'just some words');
  await expect(
    toastRegion(page).getByText('No links to add: the dropped text has no web address.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(await childTitles(extensionWorker, seeded.folderId)).toEqual(['Id Link', 'Typed Host']);
});

/** Drops plain text from another app on `target`, as the browser's drag events would. */
async function dropText(target: Locator, text: string) {
  await target.evaluate((element, value) => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', value);
    const box = element.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
      clientX: box.left + box.width / 2,
      clientY: box.bottom - 10,
    };
    element.dispatchEvent(new DragEvent('dragenter', init));
    element.dispatchEvent(new DragEvent('dragover', init));
    element.dispatchEvent(new DragEvent('drop', init));
  }, text);
}
