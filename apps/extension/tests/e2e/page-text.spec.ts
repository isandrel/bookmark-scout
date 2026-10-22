/**
 * Index Page Text: off until turned on, then a run reads the pages of its scope, the review keeps
 * the text only when saved, search finds words only the page has, and Options deletes the index.
 */
import { expect, test } from './fixtures';
import { managerUrl } from './manager-helpers';
import { openPopup } from './popup-helpers';
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

const ARTICLE = `<!doctype html><html><head><title>Field trip</title></head><body><article>
<h1>Field trip</h1><p>On the island we finally saw a quokka resting under a peppermint tree.</p>
<p>${'Plenty of other notes about the trip. '.repeat(20)}</p></article></body></html>`;

test.describe('with website access granted', () => {
  test.use({ grantWebHostAccess: true });

  test('indexed page text is searchable after the review saves it, and Options deletes it', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Page Text', [
      { title: 'Trip notes', url: 'https://trip.e2e.invalid/notes' },
      { title: 'Broken page', url: 'https://down.e2e.invalid/' },
    ]);
    await page.context().route('https://*.e2e.invalid/**', async (route) => {
      if (route.request().url().startsWith('https://down.')) return route.abort('failed');
      return route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE });
    });

    // Off until the user turns it on.
    await openTools(page, extensionId, seeded.folderId);
    await expect(toolCard(page, 'Index Page Text')).toHaveCount(0);
    await setSettings(extensionWorker, { pageTextEnabled: true });
    await openTools(page, extensionId, seeded.folderId);
    await toolCard(page, 'Index Page Text')
      .getByRole('button', { name: 'Index', exact: true })
      .click();
    const review = page.getByRole('dialog', { name: 'Index Page Text' });
    await expect(review.getByRole('radio', { name: 'Text found (1)' })).toBeVisible();
    await expect(review.getByRole('radio', { name: 'Failed (1)' })).toBeVisible();
    await expect(
      review.getByTestId('page-text-item').filter({ hasText: 'Trip notes' }),
    ).toContainText('quokka');

    // Nothing is kept before the review is saved.
    const indexedCount = () =>
      extensionWorker.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const open = indexedDB.open('bookmark-scout-page-text');
            open.onsuccess = () => {
              const db = open.result;
              if (!db.objectStoreNames.contains('pages')) return resolve(0);
              const count = db.transaction('pages').objectStore('pages').count();
              count.onsuccess = () => resolve(count.result);
            };
          }),
      );
    expect(await indexedCount()).toBe(0);
    await review.getByRole('button', { name: 'Save text of 1 page' }).click();
    await expect(review).toHaveCount(0);
    await expect.poll(indexedCount).toBe(1);

    // The manager and the popup find the bookmark by a word only its page has.
    await page.goto(`${managerUrl(extensionId)}?q=${encodeURIComponent('content:quokka')}`);
    await expect(page.locator('tbody tr').filter({ hasText: 'Trip notes' })).toBeVisible();
    await openPopup(page, extensionId);
    await page
      .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
      .fill('quokka');
    const hit = page.locator('.bookmark-item').filter({ hasText: 'Trip notes' });
    await expect(hit).toContainText('page:');
    await expect(hit).toContainText('quokka');

    // Options says what the index keeps and deletes it.
    await page.goto(`chrome-extension://${extensionId}/options.html?category=metadataContent`);
    const panel = page.getByTestId('page-text-index');
    await expect(panel).toContainText('1 page indexed');
    await panel.getByRole('button', { name: 'Delete page text' }).click();
    await expect(panel).toContainText('0 pages indexed');
    await page.goto(`${managerUrl(extensionId)}?q=${encodeURIComponent('content:quokka')}`);
    await expect(page.locator('tbody tr').filter({ hasText: 'Trip notes' })).toHaveCount(0);
  });
});
