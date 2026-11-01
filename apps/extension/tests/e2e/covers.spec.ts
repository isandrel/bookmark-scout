/**
 * Fetch Covers: off until turned on, then a run reads the head of each page in scope and the image
 * it names, the review keeps covers only when saved, the cards show the stored copy without
 * downloading anything again, and Options deletes them.
 */
import { solidPng } from '../solid-png';
import { libraryState, settledLibraryState, waitForAuditBaseline } from './audit-helpers';
import { expect, test, toastRegion } from './fixtures';
import { managerUrl, readCoverInfos, seedCover } from './manager-helpers';
import { STORAGE_ITEMS, writeStored } from './storage';
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

const STORY = `<!doctype html><html><head><title>Story</title>
<meta property="og:image" content="/images/cover.png"></head><body><p>Story</p></body></html>`;
const PLAIN = '<!doctype html><html><head><title>Plain</title></head><body></body></html>';
const headNaming = (image: string) =>
  `<!doctype html><html><head><meta property="og:image" content="${image}"></head></html>`;

test.describe('with website access granted', () => {
  test.use({ grantWebHostAccess: true });

  test('a fetched cover shows on its card after the review saves it, and Options deletes it, leaving bookmarks, tags, and the History unchanged (V32)', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    await waitForAuditBaseline(extensionWorker);
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
    await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
      [seeded.ids['Story page'] ?? '']: { tags: ['news'] },
    });
    // What fetching covers, showing them, and deleting them must leave as it is.
    const before = await settledLibraryState(extensionWorker, seeded.folderId);

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
    expect(await libraryState(extensionWorker, seeded.folderId)).toEqual(before);
  });

  test('an unusable image and a redirecting page get their own tabs, and the redirect is never followed (V24, V25)', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Covers Problems', [
      { title: 'Story page', url: 'https://news.e2e.invalid/story' },
      { title: 'Wrong type', url: 'https://wrongtype.e2e.invalid/' },
      { title: 'Broken image', url: 'https://broken.e2e.invalid/' },
      { title: 'Moved page', url: 'https://moved.e2e.invalid/' },
    ]);
    const leaked: string[] = [];
    await page.context().route('http://10.0.0.77/**', (route) => {
      leaked.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/html', body: STORY });
    });
    await page.context().route('https://*.e2e.invalid/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'moved.e2e.invalid') {
        return route.fulfill({ status: 302, headers: { location: 'http://10.0.0.77/' } });
      }
      if (url.pathname === '/images/cover.png') {
        return route.fulfill({ status: 200, contentType: 'image/png', body: solidPng(1200, 630) });
      }
      // An error page where the image should be, and a PNG the browser cannot decode.
      if (url.pathname === '/images/missing.png') {
        return route.fulfill({ status: 200, contentType: 'text/html', body: PLAIN });
      }
      if (url.pathname === '/images/broken.png') {
        const broken = Buffer.concat([solidPng(1200, 630).subarray(0, 40), Buffer.alloc(200, 7)]);
        return route.fulfill({ status: 200, contentType: 'image/png', body: broken });
      }
      if (url.hostname === 'wrongtype.e2e.invalid') {
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: headNaming('/images/missing.png'),
        });
      }
      if (url.hostname === 'broken.e2e.invalid') {
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: headNaming('/images/broken.png'),
        });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: STORY });
    });
    await setSettings(extensionWorker, { coversEnabled: true });
    await openTools(page, extensionId, seeded.folderId);
    await toolCard(page, 'Fetch Covers')
      .getByRole('button', { name: 'Fetch', exact: true })
      .click();
    const review = page.getByRole('dialog', { name: 'Fetch Covers' });
    await expect(review.getByRole('radio', { name: 'Cover found (1)' })).toBeVisible();
    await review.getByRole('radio', { name: 'Unusable image (2)' }).click();
    await expect(review.getByTestId('cover-item')).toHaveText([/Wrong type/, /Broken image/]);
    await review.getByRole('radio', { name: 'Redirected (1)' }).click();
    await expect(review.getByTestId('cover-item').filter({ hasText: 'Moved page' })).toContainText(
      'This address redirects to another one, which is not opened, so a site you have not allowed is never contacted. Bookmark the address it leads to, then run the tool again.',
    );
    expect(leaked).toEqual([]);
  });

  test('a cover picked while the review is open is kept when the review is saved over it (media review 2)', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const url = 'https://picked.e2e.invalid/story';
    const seeded = await seedFolder(extensionWorker, 'E2E Covers Picked', [
      { title: 'Story page', url },
    ]);
    await page.context().route('https://*.e2e.invalid/**', async (route) => {
      if (route.request().url().endsWith('/images/cover.png')) {
        return route.fulfill({ status: 200, contentType: 'image/png', body: solidPng(1200, 630) });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: STORY });
    });
    await setSettings(extensionWorker, { coversEnabled: true, coversWidthPx: 320 });
    await openTools(page, extensionId, seeded.folderId);
    await toolCard(page, 'Fetch Covers')
      .getByRole('button', { name: 'Fetch', exact: true })
      .click();
    const review = page.getByRole('dialog', { name: 'Fetch Covers' });
    // One bookmark: the review shows its row alone, without category tabs.
    await expect(review.getByTestId('cover-item')).toHaveCount(1);
    // The found image is drawn from the bytes the run keeps.
    await expect(review.getByTestId('cover-review-image')).toHaveAttribute('src', /^blob:/);

    // Meanwhile the user picks the view of the page as its cover (Use this view as the cover).
    const id = seeded.ids['Story page'] ?? '';
    await seedCover(extensionWorker, id, url, undefined, { source: 'tab' });
    await review.getByRole('button', { name: 'Save 1 cover' }).click();
    await expect(review).toHaveCount(0);
    expect(await readCoverInfos(extensionWorker)).toEqual([
      expect.objectContaining({ bookmarkId: id, source: 'tab', width: 600 }),
    ]);
  });
});

test('deleting a bookmark deletes its cover and leaves the others (media review 4)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Covers Deleted', [
    { title: 'Gone page', url: 'https://gone.e2e.invalid/' },
    { title: 'Kept page', url: 'https://kept.e2e.invalid/' },
  ]);
  const goneId = seeded.ids['Gone page'] ?? '';
  const keptId = seeded.ids['Kept page'] ?? '';
  await seedCover(extensionWorker, goneId, 'https://gone.e2e.invalid/');
  await seedCover(extensionWorker, keptId, 'https://kept.e2e.invalid/');
  await setSettings(extensionWorker, { coversEnabled: true });
  await page.goto(`chrome-extension://${extensionId}/options.html?category=metadataContent`);
  await expect(page.getByTestId('covers-store')).toContainText('2 covers');

  // Deleted however it is deleted: the background hears the browser's removal.
  await extensionWorker.evaluate((id) => chrome.bookmarks.remove(id), goneId);
  await expect
    .poll(async () => (await readCoverInfos(extensionWorker)).map((info) => info.bookmarkId))
    .toEqual([keptId]);
  await expect(page.getByTestId('covers-store')).toContainText('1 cover');
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

test.describe('Fetch cover from a card', () => {
  test.use({ grantWebHostAccess: true });

  test('Fetch covers on a folder card fetches every web bookmark inside it, nested folders too', async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Fetch Folder', [
      {
        title: 'Reading',
        children: [
          { title: 'Inside story', url: 'https://inside.e2e.invalid/story' },
          {
            title: 'Notes',
            children: [{ title: 'Nested story', url: 'https://nested.e2e.invalid/story' }],
          },
          { title: 'Local file', url: 'file:///notes.html' },
        ],
      },
      { title: 'Outside story', url: 'https://outside.e2e.invalid/story' },
    ]);
    const requested: string[] = [];
    await context.route('https://*.e2e.invalid/**', async (route) => {
      const url = new URL(route.request().url());
      requested.push(url.hostname);
      if (url.pathname === '/images/cover.png') {
        return route.fulfill({ status: 200, contentType: 'image/png', body: solidPng(1200, 630) });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: STORY });
    });
    await setSettings(extensionWorker, {
      managerViewMode: 'cards',
      coversEnabled: true,
      coversWidthPx: 320,
    });
    await page.goto(`${managerUrl(extensionId)}?id=${seeded.folderId}`);
    await page
      .locator('[data-slot="bookmark-card"]')
      .filter({ hasText: 'Reading' })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Fetch covers (2)' }).click();
    const review = page.getByRole('dialog', { name: 'Fetch Covers' });
    await expect(review.getByTestId('cover-item')).toHaveCount(2);
    await review.getByRole('button', { name: 'Save 2 covers' }).click();
    await expect(review).toHaveCount(0);
    expect((await readCoverInfos(extensionWorker)).map((info) => info.bookmarkId).sort()).toEqual(
      [seeded.ids['Inside story'], seeded.ids['Nested story']].sort(),
    );
    expect(new Set(requested)).toEqual(new Set(['inside.e2e.invalid', 'nested.e2e.invalid']));
  });

  test("a right-click Fetch cover on one card saves that bookmark's cover and leaves the others untouched", async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Fetch One', [
      { title: 'Chosen story', url: 'https://chosen.e2e.invalid/story' },
      { title: 'Other story', url: 'https://other.e2e.invalid/story' },
      { title: 'Third story', url: 'https://third.e2e.invalid/story' },
    ]);
    const requested: string[] = [];
    await context.route('https://*.e2e.invalid/**', async (route) => {
      const url = new URL(route.request().url());
      requested.push(url.hostname);
      if (url.pathname === '/images/cover.png') {
        return route.fulfill({ status: 200, contentType: 'image/png', body: solidPng(1200, 630) });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: STORY });
    });
    // Off: no Fetch cover in the menu.
    await setSettings(extensionWorker, { managerViewMode: 'cards' });
    await page.goto(`${managerUrl(extensionId)}?id=${seeded.folderId}`);
    const card = (title: string) =>
      page.locator('[data-slot="bookmark-card"]').filter({ hasText: title });
    await card('Chosen story').click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Fetch cover' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await setSettings(extensionWorker, { coversEnabled: true, coversWidthPx: 320 });
    await card('Chosen story').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Fetch cover' }).click();
    const review = page.getByRole('dialog', { name: 'Fetch Covers' });
    await expect(review.getByTestId('cover-item')).toHaveCount(1);
    await expect(review.getByTestId('cover-item')).toContainText('Chosen story');
    // One item: its own action is the review; no checkbox, tabs, or "Set selected to…".
    await expect(review.getByRole('checkbox')).toHaveCount(0);
    await expect(review.getByRole('radio')).toHaveCount(0);
    await expect(review.locator('[data-slot="review-batch"]')).toBeHidden();
    await review.getByRole('button', { name: 'Save 1 cover' }).click();
    await expect(review).toHaveCount(0);

    await expect(card('Chosen story').getByTestId('bookmark-cover')).toHaveAttribute(
      'src',
      /^blob:/,
    );
    await expect(card('Other story').getByTestId('bookmark-card-placeholder')).toBeVisible();
    await expect(card('Third story').getByTestId('bookmark-card-placeholder')).toBeVisible();
    expect((await readCoverInfos(extensionWorker)).map((info) => info.bookmarkId)).toEqual([
      seeded.ids['Chosen story'],
    ]);
    expect(new Set(requested)).toEqual(new Set(['chosen.e2e.invalid']));

    // With Review a Single Cover off, the cover it finds is saved without the review.
    await setSettings(extensionWorker, { coversReviewSingle: false });
    await card('Other story').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Fetch cover' }).click();
    await expect(card('Other story').getByTestId('bookmark-cover')).toHaveAttribute(
      'src',
      /^blob:/,
    );
    await expect(review).toHaveCount(0);
    expect((await readCoverInfos(extensionWorker)).map((info) => info.bookmarkId).sort()).toEqual(
      [seeded.ids['Chosen story'], seeded.ids['Other story']].sort(),
    );
  });
});

test('Remove cover is offered only for a card with a cover, shows the placeholder at once, and Undo puts the same cover back', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const seeded = await seedFolder(extensionWorker, 'E2E Remove Cover', [
    { title: 'Covered page', url: 'https://covered.e2e.invalid/a' },
    { title: 'Bare page', url: 'https://bare.e2e.invalid/b' },
  ]);
  const coveredId = seeded.ids['Covered page'] as string;
  await seedCover(extensionWorker, coveredId, 'https://covered.e2e.invalid/a', undefined, {
    source: 'tab',
    savedAt: Date.UTC(2026, 9, 1),
  });
  const [stored] = await readCoverInfos(extensionWorker);
  await setSettings(extensionWorker, { managerViewMode: 'cards' });
  await page.goto(`${managerUrl(extensionId)}?id=${seeded.folderId}`);
  const card = (title: string) =>
    page.locator('[data-slot="bookmark-card"]').filter({ hasText: title });
  await expect(card('Covered page').getByTestId('bookmark-cover')).toHaveAttribute('src', /^blob:/);

  await card('Bare page').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Remove cover' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await card('Covered page').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove cover' }).click();
  // No confirmation: the card shows its placeholder at once.
  await expect(card('Covered page').getByTestId('bookmark-card-placeholder')).toBeVisible();
  await expect(card('Covered page').getByTestId('bookmark-cover')).toHaveCount(0);
  await expect.poll(() => readCoverInfos(extensionWorker)).toEqual([]);

  await toastRegion(page).getByRole('button', { name: 'Undo' }).first().click();
  await expect(card('Covered page').getByTestId('bookmark-cover')).toHaveAttribute('src', /^blob:/);
  // The same cover: its source and date are as they were.
  await expect.poll(() => readCoverInfos(extensionWorker)).toEqual([stored]);
});
