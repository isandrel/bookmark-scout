/**
 * Fetch Covers: off until turned on, then a run reads the head of each page in scope and the image
 * it names, the review keeps covers only when saved, the cards show the stored copy without
 * downloading anything again, and Options deletes them.
 */
import { solidPng } from '../solid-png';
import { expect, test } from './fixtures';
import { managerUrl } from './manager-helpers';
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

const STORY = `<!doctype html><html><head><title>Story</title>
<meta property="og:image" content="/images/cover.png"></head><body><p>Story</p></body></html>`;
const PLAIN = '<!doctype html><html><head><title>Plain</title></head><body></body></html>';

test.describe('with website access granted', () => {
  test.use({ grantWebHostAccess: true });

  test('a fetched cover shows on its card after the review saves it, and Options deletes it', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Covers', [
      { title: 'Story page', url: 'https://news.e2e.invalid/story' },
      { title: 'Plain page', url: 'https://plain.e2e.invalid/' },
      { title: 'Broken page', url: 'https://down.e2e.invalid/' },
    ]);
    let imageRequests = 0;
    await page.context().route('https://*.e2e.invalid/**', async (route) => {
      const url = route.request().url();
      if (url.startsWith('https://down.')) return route.abort('failed');
      if (url.endsWith('/images/cover.png')) {
        imageRequests += 1;
        return route.fulfill({ status: 200, contentType: 'image/png', body: solidPng(1200, 630) });
      }
      const body = url.startsWith('https://news.') ? STORY : PLAIN;
      return route.fulfill({ status: 200, contentType: 'text/html', body });
    });

    // Off until the user turns it on.
    await openTools(page, extensionId, seeded.folderId);
    await expect(toolCard(page, 'Fetch Covers')).toHaveCount(0);
    await setSettings(extensionWorker, { coversEnabled: true, coversWidthPx: 320 });
    await openTools(page, extensionId, seeded.folderId);
    await toolCard(page, 'Fetch Covers')
      .getByRole('button', { name: 'Fetch', exact: true })
      .click();
    const review = page.getByRole('dialog', { name: 'Fetch Covers' });
    await expect(review.getByRole('radio', { name: 'Cover found (1)' })).toBeVisible();
    await expect(review.getByRole('radio', { name: 'No cover (1)' })).toBeVisible();
    await expect(review.getByRole('radio', { name: 'Failed (1)' })).toBeVisible();
    const found = review.getByTestId('cover-item').filter({ hasText: 'Story page' });
    // The review shows the shrunk copy the extension drew, at the configured width.
    await expect(found.locator('img')).toHaveAttribute('width', '320');
    await expect(found.locator('img')).toHaveAttribute('height', '168');
    await review.getByRole('button', { name: 'Save 1 cover' }).click();
    await expect(review).toHaveCount(0);
    expect(imageRequests).toBe(1);

    // The cards show the stored copy; showing them downloads nothing.
    await setSettings(extensionWorker, { managerViewMode: 'cards' });
    await page.goto(`${managerUrl(extensionId)}?id=${seeded.folderId}`);
    const cards = page.getByTestId('bookmark-cards');
    const storyCard = cards
      .locator('[data-slot="bookmark-card"]')
      .filter({ hasText: 'Story page' });
    await expect(storyCard.getByTestId('bookmark-cover')).toBeVisible();
    await expect(storyCard.getByTestId('bookmark-cover')).toHaveAttribute('src', /^blob:/);
    await expect(cards.getByTestId('bookmark-cover')).toHaveCount(1);
    expect(imageRequests).toBe(1);

    // Options says what is stored and deletes it; the card goes back to its icon.
    await page.goto(`chrome-extension://${extensionId}/options.html?category=metadataContent`);
    const panel = page.getByTestId('covers-store');
    await expect(panel).toContainText('1 cover');
    await panel.getByRole('button', { name: 'Delete covers' }).click();
    await expect(panel).toContainText('0 covers');
    await page.goto(`${managerUrl(extensionId)}?id=${seeded.folderId}`);
    await expect(page.getByTestId('bookmark-cards')).toBeVisible();
    await expect(page.getByTestId('bookmark-cover')).toHaveCount(0);
    const bookmarks = await extensionWorker.evaluate(
      (id) => chrome.bookmarks.getChildren(id),
      seeded.folderId,
    );
    expect(bookmarks).toHaveLength(3);
  });
});

test('the popup turns what the tab shows into a cover only after its preview is saved', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const url = 'https://e2e.invalid/captured-story';
  const seeded = await seedFolder(extensionWorker, 'E2E Capture', [
    { title: 'Captured story', url },
  ]);
  await setSettings(extensionWorker, { coversEnabled: true, coversWidthPx: 320 });
  // Pages open as tabs here: the current tab and its picture are stubbed, as the popup would see
  // them through activeTab.
  const picture = `data:image/png;base64,${solidPng(1280, 800).toString('base64')}`;
  await page.addInitScript(
    ({ pageUrl, png }) => {
      chrome.tabs.query = (async () => [
        {
          id: 99,
          index: 0,
          windowId: 1,
          active: true,
          incognito: false,
          title: 'Captured story',
          url: pageUrl,
        },
      ]) as unknown as typeof chrome.tabs.query;
      chrome.tabs.captureVisibleTab = (async () =>
        png) as unknown as typeof chrome.tabs.captureVisibleTab;
    },
    { pageUrl: url, png: picture },
  );
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Use this view as the cover' }).click();
  const dialog = page.getByRole('dialog', { name: 'Use this view as the cover?' });
  await expect(dialog.getByTestId('capture-cover-preview')).toHaveAttribute('src', /^data:image\//);
  const stored = () =>
    extensionWorker.evaluate(async () => {
      // Opening a database that does not exist would create it empty, without its stores.
      const names = (await indexedDB.databases()).map((db) => db.name);
      if (!names.includes('bookmark-scout-covers')) return 0;
      return new Promise<number>((resolve) => {
        const open = indexedDB.open('bookmark-scout-covers');
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('info')) return resolve(0);
          const count = db.transaction('info').objectStore('info').count();
          count.onsuccess = () => resolve(count.result);
        };
      });
    });

  // Discarding keeps nothing.
  await dialog.getByRole('button', { name: 'Discard' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await stored()).toBe(0);

  await page.getByRole('button', { name: 'Use this view as the cover' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save cover' }).click();
  await expect.poll(stored).toBe(1);

  await setSettings(extensionWorker, { managerViewMode: 'cards' });
  await page.goto(`${managerUrl(extensionId)}?id=${seeded.folderId}`);
  await expect(page.getByTestId('bookmark-cover')).toHaveAttribute('src', /^blob:/);
});
