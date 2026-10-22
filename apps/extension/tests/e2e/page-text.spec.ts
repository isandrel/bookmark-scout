/**
 * Index Page Text: off until turned on, then a run reads the pages of its scope, lists sign-in
 * pages on their own and never saves them, the review keeps the text only when saved, search
 * finds words only the page has, and Options deletes the index. Before a run the user chooses its
 * sites: only those are asked for website access and requested, and the rest are listed as not
 * chosen. The popup indexes the current tab's text only after its preview is saved, and never when
 * the tab moved on while it was read.
 */
import type { Page, Worker } from '@playwright/test';
import { expect, test, toastRegion } from './fixtures';
import { latestJob } from './job-helpers';
import { managerUrl } from './manager-helpers';
import { openPopup } from './popup-helpers';
import { openTools, seedFolder, setSettings, toolCard } from './tool-helpers';

const ARTICLE = `<!doctype html><html><head><title>Field trip</title></head><body><article>
<h1>Field trip</h1><p>On the island we finally saw a quokka resting under a peppermint tree.</p>
<p>${'Plenty of other notes about the trip. '.repeat(20)}</p></article></body></html>`;
const SIGN_IN = `<!doctype html><html><head><title>Sign in</title></head><body><main>
<h1>Sign in to keep reading</h1><form><input name="user"><input type="password" name="pw">
<button>Sign in</button></form></main></body></html>`;

/** Six bookmarks on five sites, two on the first: what the site choice lists before a run. */
const SITE_CHOICE_BOOKMARKS = [
  { title: 'Alpha one', url: 'https://www.s03-alpha.invalid/1' },
  { title: 'Alpha two', url: 'https://docs.s03-alpha.invalid/2' },
  { title: 'Beta', url: 'https://s03-beta.invalid/' },
  { title: 'Gamma', url: 'https://s03-gamma.invalid/' },
  { title: 'Delta', url: 'https://s03-delta.invalid/' },
  { title: 'Epsilon', url: 'https://s03-epsilon.invalid/' },
];

/** How many pages the page text index keeps, read in the background. */
const indexedCount = (worker: Worker) =>
  worker.evaluate(async () => {
    // Opening a database that does not exist would create it empty, without its stores.
    const names = (await indexedDB.databases()).map((db) => db.name);
    if (!names.includes('bookmark-scout-page-text')) return 0;
    return new Promise<number>((resolve) => {
      const open = indexedDB.open('bookmark-scout-page-text');
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('pages')) return resolve(0);
        const count = db.transaction('pages').objectStore('pages').count();
        count.onsuccess = () => resolve(count.result);
      };
    });
  });

test.describe('with website access granted', () => {
  test.use({ grantWebHostAccess: true });

  test('indexed page text is searchable after the review saves it, sign-in pages are not saved, and Options deletes it (S12)', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Page Text', [
      { title: 'Trip notes', url: 'https://trip.e2e.invalid/notes' },
      { title: 'Broken page', url: 'https://down.e2e.invalid/' },
      { title: 'Members only', url: 'https://login.e2e.invalid/story' },
      { title: 'Locked page', url: 'https://locked.e2e.invalid/' },
    ]);
    await page.context().route('https://*.e2e.invalid/**', async (route) => {
      const url = route.request().url();
      if (url.startsWith('https://down.')) return route.abort('failed');
      // An HTTP 200 sign-in wall, and an HTTP 401 that shows the article anyway.
      if (url.startsWith('https://login.')) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: SIGN_IN });
      }
      const status = url.startsWith('https://locked.') ? 401 : 200;
      return route.fulfill({ status, contentType: 'text/html', body: ARTICLE });
    });

    // Off until the user turns it on.
    await openTools(page, extensionId, seeded.folderId);
    await expect(toolCard(page, 'Index Page Text')).toHaveCount(0);
    await setSettings(extensionWorker, { pageTextEnabled: true });
    await openTools(page, extensionId, seeded.folderId);
    await toolCard(page, 'Index Page Text')
      .getByRole('button', { name: 'Index', exact: true })
      .click();
    // Every page is on one site, which starts chosen.
    await page
      .getByRole('dialog', { name: 'Choose sites to read' })
      .getByRole('button', { name: 'Start with 1 site' })
      .click();
    const review = page.getByRole('dialog', { name: 'Index Page Text' });
    await expect(review.getByRole('radio', { name: 'Text found (1)' })).toBeVisible();
    await expect(review.getByRole('radio', { name: 'Failed (1)' })).toBeVisible();
    // Sign-in pages have their own tab, start on Skip, and cannot be saved.
    await review.getByRole('radio', { name: 'Sign-in page (2)' }).click();
    const walls = review.getByTestId('page-text-item');
    await expect(walls).toHaveCount(2);
    await expect(walls.filter({ hasText: 'Members only' })).not.toContainText('Sign in to keep');
    await review.getByRole('radio', { name: 'Text found (1)' }).click();
    await expect(
      review.getByTestId('page-text-item').filter({ hasText: 'Trip notes' }),
    ).toContainText('quokka');

    // Nothing is kept before the review is saved.
    expect(await indexedCount(extensionWorker)).toBe(0);
    await review.getByRole('button', { name: 'Save text of 1 page' }).click();
    await expect(review).toHaveCount(0);
    await expect.poll(() => indexedCount(extensionWorker)).toBe(1);

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

    // Turned off, search leaves page text out without deleting it; turned on, it is back.
    await page.goto(`${managerUrl(extensionId)}?q=${encodeURIComponent('content:quokka')}`);
    await expect(page.locator('tbody tr').filter({ hasText: 'Trip notes' })).toBeVisible();
    await setSettings(extensionWorker, { pageTextEnabled: false });
    await expect(page.locator('tbody tr').filter({ hasText: 'Trip notes' })).toHaveCount(0);
    await setSettings(extensionWorker, { pageTextEnabled: true });
    await expect(page.locator('tbody tr').filter({ hasText: 'Trip notes' })).toBeVisible();
    expect(await indexedCount(extensionWorker)).toBe(1);

    // Options says what the index keeps and deletes it.
    await page.goto(`chrome-extension://${extensionId}/options.html?category=metadataContent`);
    const panel = page.getByTestId('page-text-index');
    await expect(panel).toContainText('1 page indexed');
    await panel.getByRole('button', { name: 'Delete page text' }).click();
    await expect(panel).toContainText('0 pages indexed');
    await page.goto(`${managerUrl(extensionId)}?q=${encodeURIComponent('content:quokka')}`);
    await expect(page.locator('tbody tr').filter({ hasText: 'Trip notes' })).toHaveCount(0);
  });

  test('with 2 of 5 sites chosen, only they are requested, the job keeps the choice after its page closes, and the rest are listed as not chosen (S03)', async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    const { folderId } = await seedFolder(
      extensionWorker,
      'E2E Site Choice',
      SITE_CHOICE_BOOKMARKS,
    );
    await setSettings(extensionWorker, { pageTextEnabled: true, pageTextDefaultScope: 'folder' });
    // Each page is held until the page that started the run has closed.
    const requested: string[] = [];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await context.route('https://*.invalid/**', async (route) => {
      requested.push(new URL(route.request().url()).hostname);
      await held;
      await route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE });
    });

    try {
      await openTools(page, extensionId, folderId);
      await toolCard(page, 'Index Page Text')
        .getByRole('button', { name: 'Index', exact: true })
        .click();
      const choice = page.getByRole('dialog', { name: 'Choose sites to read' });
      // Each site once, with its bookmarks, most first; all start chosen.
      const rows = choice.getByTestId('site-choice-row');
      await expect(rows).toHaveText([
        /^s03-alpha\.invalid2 bookmarks$/,
        /^s03-beta\.invalid1 bookmark$/,
        /^s03-delta\.invalid1 bookmark$/,
        /^s03-epsilon\.invalid1 bookmark$/,
        /^s03-gamma\.invalid1 bookmark$/,
      ]);
      await expect(choice.getByText('5 of 5 sites chosen', { exact: true })).toBeVisible();
      await choice.getByRole('button', { name: 'Select none' }).click();
      await expect(choice.getByRole('button', { name: 'Start with 0 sites' })).toBeDisabled();
      // By keyboard: a site's checkbox toggles with Space.
      await choice.getByRole('checkbox', { name: /s03-alpha\.invalid/ }).press('Space');
      await choice.getByRole('checkbox', { name: /s03-gamma\.invalid/ }).press('Space');
      await expect(choice.getByText('2 of 5 sites chosen', { exact: true })).toBeVisible();
      await choice.getByRole('button', { name: 'Start with 2 sites' }).click();
      await expect(choice).toHaveCount(0);

      await expect.poll(() => requested.length).toBeGreaterThan(0);
      await page.close();
      release();
      await expect
        .poll(async () => (await latestJob(extensionWorker, 'pageText'))?.state)
        .toBe('succeeded');
      const job = await latestJob(extensionWorker, 'pageText');
      expect(job?.options).toMatchObject({ sites: ['s03-alpha.invalid', 's03-gamma.invalid'] });
      // Only the chosen sites were requested, each page once.
      expect(requested.sort()).toEqual([
        'docs.s03-alpha.invalid',
        's03-gamma.invalid',
        'www.s03-alpha.invalid',
      ]);
    } finally {
      release();
    }

    const manager = await context.newPage();
    await openTools(manager, extensionId, folderId);
    await toolCard(manager, 'Index Page Text')
      .getByTestId('job-status')
      .getByRole('button', { name: 'Review results' })
      .click();
    const review = manager.getByRole('dialog', { name: 'Index Page Text' });
    await expect(review.getByRole('radio', { name: 'Text found (3)' })).toBeVisible();
    await review.getByRole('radio', { name: 'Not chosen (3)' }).click();
    await expect(review.getByTestId('page-text-item')).toHaveText([/Beta/, /Delta/, /Epsilon/]);
  });

  test("the popup indexes the current tab's text only after its preview is saved (S17)", async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const url = 'https://news.e2e.invalid/members-story';
    await seedFolder(extensionWorker, 'E2E Tab Text', [{ title: 'Members story', url }]);
    await page
      .context()
      .route('https://*.e2e.invalid/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE }),
      );
    await openPopupOnTab(page, extensionId, extensionWorker, url);

    // Only while Index Page Text is on.
    const button = page.getByRole('button', { name: "Index this page's text" });
    await expect(page.getByTestId('current-page-saved-in')).toBeVisible();
    await expect(button).toHaveCount(0);
    await setSettings(extensionWorker, { pageTextEnabled: true });
    await button.click();
    const dialog = page.getByRole('dialog', { name: "Index this page's text?" });
    await expect(dialog.getByTestId('index-tab-text-preview')).toContainText('quokka');
    await expect(dialog).toContainText('check that it holds nothing private');

    // Discarding keeps nothing.
    await dialog.getByRole('button', { name: 'Discard' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await indexedCount(extensionWorker)).toBe(0);

    await button.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save text' }).click();
    await expect(toastRegion(page).getByText('✓ Page text saved', { exact: true })).toBeVisible();
    await expect.poll(() => indexedCount(extensionWorker)).toBe(1);
    await page
      .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
      .fill('peppermint');
    await expect(page.locator('.bookmark-item').filter({ hasText: 'Members story' })).toContainText(
      'page:',
    );
  });

  test('the popup keeps no text when the tab moved to another page while it was read (S18)', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const url = 'https://news.e2e.invalid/members-story';
    const nextUrl = 'https://news.e2e.invalid/next-story';
    await seedFolder(extensionWorker, 'E2E Tab Moved', [{ title: 'Members story', url }]);
    await setSettings(extensionWorker, { pageTextEnabled: true });
    await page
      .context()
      .route('https://*.e2e.invalid/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE }),
      );
    // The tab really goes to another page right after its text was read.
    await page.addInitScript((next) => {
      const execute = chrome.scripting.executeScript.bind(chrome.scripting);
      chrome.scripting.executeScript = (async (
        injection: chrome.scripting.ScriptInjection<unknown[], unknown>,
      ) => {
        const results = await execute(injection);
        const { tabId } = injection.target;
        await chrome.tabs.update(tabId, { url: next });
        while ((await chrome.tabs.get(tabId)).url !== next) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return results;
      }) as unknown as typeof chrome.scripting.executeScript;
    }, nextUrl);
    await openPopupOnTab(page, extensionId, extensionWorker, url);

    await page.getByRole('button', { name: "Index this page's text" }).click();
    const toast = toastRegion(page);
    await expect(toast.getByText('× No text indexed', { exact: true })).toBeVisible();
    await expect(
      toast.getByText(
        'The tab changed while its text was read. Open the bookmarked page and try again.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await indexedCount(extensionWorker)).toBe(0);
  });
});

test('website access is asked for the chosen sites only, and nothing is requested when it is declined (S03)', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  const { folderId } = await seedFolder(extensionWorker, 'E2E Site Access', SITE_CHOICE_BOOKMARKS);
  await setSettings(extensionWorker, { pageTextEnabled: true, pageTextDefaultScope: 'folder' });
  const requested: string[] = [];
  await context.route('https://*.invalid/**', async (route) => {
    requested.push(route.request().url());
    await route.abort('failed');
  });
  // The real browser prompt cannot be answered headlessly; record it and decline.
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { permissionRequests: unknown[] }).permissionRequests = calls;
    Object.defineProperty(chrome.permissions, 'request', {
      configurable: true,
      value: (request: unknown) => {
        calls.push(request);
        return Promise.resolve(false);
      },
    });
  });

  await openTools(page, extensionId, folderId);
  await toolCard(page, 'Index Page Text')
    .getByRole('button', { name: 'Index', exact: true })
    .click();
  const choice = page.getByRole('dialog', { name: 'Choose sites to read' });
  for (const site of ['s03-beta.invalid', 's03-delta.invalid', 's03-epsilon.invalid']) {
    await choice.getByTestId('site-choice-row').filter({ hasText: site }).click();
  }
  // At a narrow window the list still fits without scrolling sideways.
  await page.setViewportSize({ width: 420, height: 800 });
  await expect
    .poll(() =>
      choice.evaluate(
        (dialog) =>
          dialog.scrollWidth <= dialog.clientWidth &&
          dialog.getBoundingClientRect().right <= window.innerWidth,
      ),
    )
    .toBe(true);
  await choice.getByRole('button', { name: 'Start with 2 sites' }).click();

  const prompt = page.getByRole('dialog', { name: 'Allow access to websites?' });
  await expect(prompt).toContainText('s03-alpha.invalid');
  await expect(prompt).toContainText('s03-gamma.invalid');
  await expect(prompt).not.toContainText('s03-beta.invalid');
  await prompt.getByRole('button', { name: 'Allow access' }).click();
  await expect(
    toastRegion(page).getByText('× Website access not granted', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { permissionRequests: unknown[] }).permissionRequests,
    ),
  ).toEqual([
    {
      origins: [
        'http://*.s03-alpha.invalid/*',
        'https://*.s03-alpha.invalid/*',
        'http://*.s03-gamma.invalid/*',
        'https://*.s03-gamma.invalid/*',
      ],
    },
  ]);
  expect(requested).toEqual([]);
});

/**
 * Opens `url` in a tab of its own, then the popup in `page`, which takes that tab as the current
 * one, as the toolbar button would. The injection into the tab is real: the build has website
 * access, which stands in for the click's activeTab.
 */
async function openPopupOnTab(page: Page, extensionId: string, worker: Worker, url: string) {
  const site = await page.context().newPage();
  await site.goto(url);
  const tabId = await worker.evaluate(
    async (pageUrl) => (await chrome.tabs.query({ url: pageUrl }))[0]?.id,
    url,
  );
  if (tabId === undefined) throw new Error('The page has no tab');
  await page.addInitScript((id) => {
    const get = chrome.tabs.get.bind(chrome.tabs);
    chrome.tabs.query = (async () => [
      { ...(await get(id)), active: true },
    ]) as unknown as typeof chrome.tabs.query;
  }, tabId);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
}
