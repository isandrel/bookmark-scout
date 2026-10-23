/**
 * Index Page Text: off until turned on, then a run reads the pages of its scope, lists sign-in
 * pages on their own and never saves them, the review keeps the text only when saved, search
 * finds words only the page has, and Options deletes the index. Before a run the user chooses its
 * sites: only those are asked for website access and requested, and the rest are listed as not
 * chosen. The popup indexes the current tab's text only after its preview is saved, and never when
 * the tab moved on while it was read.
 */
import type { Page, Worker } from '@playwright/test';
import { libraryState, settledLibraryState, waitForAuditBaseline } from './audit-helpers';
import { expect, test, toastRegion } from './fixtures';
import { latestJob } from './job-helpers';
import { managerSearch, managerUrl } from './manager-helpers';
import { openPopup } from './popup-helpers';
import { readSettings, STORAGE_ITEMS, writeStored } from './storage';
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

/**
 * Stores page text records the way Index Page Text saves them, from the background: downloaded,
 * from the bookmark's own address, uncut (the fingerprint is a placeholder of the right shape).
 */
function seedPageTexts(
  worker: Worker,
  pages: { bookmarkId: string; url: string; text: string; source?: 'download' | 'tab' }[],
) {
  return worker.evaluate(async (records) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // The database version that keeps provenance; an index not made yet is made as it is.
      const open = indexedDB.open('bookmark-scout-page-text', 2);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('pages')) {
          open.result.createObjectStore('pages', { keyPath: 'bookmarkId' });
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const transaction = db.transaction('pages', 'readwrite');
    for (const { source = 'download', ...record } of records) {
      transaction.objectStore('pages').put({
        ...record,
        indexedAt: Date.now(),
        extractorVersion: 2,
        provenance: { source, readFrom: record.url, fingerprint: '0'.repeat(64), truncated: false },
      });
    }
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    // Open pages read the index again, as after a save.
    const channel = new BroadcastChannel('bookmark-scout-page-text');
    channel.postMessage('changed');
    channel.close();
  }, pages);
}

/** Whether each result of a run still holds page text, by bookmark title, read from the job store. */
function runTexts(worker: Worker, jobId: string) {
  return worker.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('bookmark-scout-jobs');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const items = await new Promise<{ result: { title: string; text?: string } | null }[]>(
        (resolve, reject) => {
          const request = db
            .transaction('items')
            .objectStore('items')
            .getAll(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );
      return Object.fromEntries(
        items.flatMap(({ result }) => (result ? [[result.title, result.text !== undefined]] : [])),
      );
    } finally {
      db.close();
    }
  }, jobId);
}

/**
 * Takes back one site's website access as Chrome reports it. This build declares website access as
 * required, which cannot be removed, so the browser's report is dispatched from the worker, and the
 * access check answers as it then would, in the worker and in `pages`.
 */
async function revokeSite(worker: Worker, pages: Page[], site: string) {
  const fakeCheck = (removed: string) => {
    const contains = chrome.permissions.contains.bind(chrome.permissions);
    Object.defineProperty(chrome.permissions, 'contains', {
      configurable: true,
      value: async (request: chrome.permissions.Permissions) =>
        !request.origins?.some((origin) => origin.includes(removed)) && contains(request),
    });
  };
  for (const page of pages) await page.evaluate(fakeCheck, site);
  await worker.evaluate(fakeCheck, site);
  await worker.evaluate((removed) => {
    const origins = [`http://*.${removed}/*`, `https://*.${removed}/*`];
    (
      chrome.permissions.onRemoved as unknown as {
        dispatch: (permissions: chrome.permissions.Permissions) => void;
      }
    ).dispatch({ origins, permissions: [] });
  }, site);
}

test.describe('with website access granted', () => {
  test.use({ grantWebHostAccess: true });

  test('indexed page text is searchable after the review saves it, sign-in pages are not saved, and Options deletes it, leaving bookmarks, tags, and the History unchanged (S12, S30, S48)', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    await waitForAuditBaseline(extensionWorker);
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
    const tripId = seeded.ids['Trip notes'] ?? '';
    await writeStored(extensionWorker, STORAGE_ITEMS.bookmarkMetadata, {
      [tripId]: { tags: ['travel'] },
    });
    // What reading pages, searching them, and deleting their text must leave as it is.
    const before = await settledLibraryState(extensionWorker, seeded.folderId);

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
    // The match says the text was downloaded.
    const hit = page.locator('.bookmark-item').filter({ hasText: 'Trip notes' });
    await expect(hit).toContainText('downloaded page:');
    await expect(hit).toContainText('quokka');
    // Indexing and searching wrote nothing to the bookmarks, their tags, or the History.
    expect(await libraryState(extensionWorker, seeded.folderId)).toEqual(before);

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
    expect(await indexedCount(extensionWorker)).toBe(0);
    expect(await libraryState(extensionWorker, seeded.folderId)).toEqual(before);
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

  test('a page that redirects is listed as redirected, and where it leads is never requested; an http: page is read from its https: address (S06)', async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Page Text Redirect', [
      { title: 'Trip notes', url: 'https://trip.e2e.invalid/notes' },
      { title: 'Moved page', url: 'https://moved.e2e.invalid/' },
      { title: 'Old link', url: 'http://old.e2e.invalid/notes' },
    ]);
    // The browser hides this redirect's target; its https: address is the likely one, tried first.
    const oldRequests: string[] = [];
    await page.context().route('http://old.e2e.invalid/**', (route) => {
      oldRequests.push(route.request().url());
      return route.fulfill({ status: 301, headers: { location: 'https://old.e2e.invalid/notes' } });
    });
    // Every request the browser sends to the redirect's target, from any page or the worker.
    const leaked: string[] = [];
    await page.context().route('http://192.168.77.1/**', (route) => {
      leaked.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE });
    });
    await page
      .context()
      .route('https://*.e2e.invalid/**', (route) =>
        route.request().url().startsWith('https://moved.')
          ? route.fulfill({ status: 302, headers: { location: 'http://192.168.77.1/admin' } })
          : route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE }),
      );
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
    await expect(review.getByRole('radio', { name: 'Text found (2)' })).toBeVisible();
    await expect(
      review.getByTestId('page-text-item').filter({ hasText: 'Old link' }),
    ).toContainText('Read from https://old.e2e.invalid/notes');
    expect(oldRequests).toEqual(['http://old.e2e.invalid/notes']);
    await review.getByRole('radio', { name: 'Redirected (1)' }).click();
    const moved = review.getByTestId('page-text-item').filter({ hasText: 'Moved page' });
    await expect(moved).toContainText(
      'This address redirects to another one, which is not opened, so a site you have not allowed is never contacted. Bookmark the address it leads to, then run the tool again.',
    );
    expect(leaked).toEqual([]);
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
    // The match says the text came from the tab.
    await expect(page.locator('.bookmark-item').filter({ hasText: 'Members story' })).toContainText(
      'page from your tab:',
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

  test('bookmarks of one address are downloaded once, Options shows the coverage, and Retry failed reads only the failed pages again (S19)', async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    const { folderId } = await seedFolder(extensionWorker, 'E2E Page Text Coverage', [
      { title: 'Trip notes', url: 'https://trip.e2e.invalid/notes' },
      { title: 'Trip notes again', url: 'https://trip.e2e.invalid/notes' },
      { title: 'Flaky page', url: 'https://flaky.e2e.invalid/' },
      { title: 'Bookmarklet', url: 'javascript:void(0)' },
    ]);
    await setSettings(extensionWorker, { pageTextEnabled: true, pageTextDefaultScope: 'folder' });
    const requested: string[] = [];
    let flakyAnswers = false;
    await context.route('https://*.e2e.invalid/**', (route) => {
      const url = route.request().url();
      requested.push(url);
      if (url.startsWith('https://flaky.') && !flakyAnswers) return route.abort('failed');
      return route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE });
    });

    await openTools(page, extensionId, folderId);
    await toolCard(page, 'Index Page Text')
      .getByRole('button', { name: 'Index', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Choose sites to read' })
      .getByRole('button', { name: 'Start with 1 site' })
      .click();
    const review = page.getByRole('dialog', { name: 'Index Page Text' });
    // Both bookmarks of the address got its text from one download.
    await expect(review.getByRole('radio', { name: 'Text found (2)' })).toBeVisible();
    await expect(review.getByRole('radio', { name: 'Failed (1)' })).toBeVisible();
    expect(requested.filter((url) => url.startsWith('https://trip.'))).toEqual([
      'https://trip.e2e.invalid/notes',
    ]);
    await review.getByRole('button', { name: 'Save text of 2 pages' }).click();
    await expect(review).toHaveCount(0);
    await expect.poll(() => indexedCount(extensionWorker)).toBe(2);

    await page.goto(`chrome-extension://${extensionId}/options.html?category=metadataContent`);
    const coverage = page.getByTestId('page-text-coverage');
    await expect(coverage.getByRole('listitem')).toHaveText([
      /^Indexed: 2 of \d+ bookmarks that can be indexed$/,
      /^Out of date: 0 /,
      'Failed in the last run: 1',
      /^Last indexed: \S/,
    ]);
    const before = requested.length;
    flakyAnswers = true;
    await page.getByTestId('page-text-index').getByRole('button', { name: 'Retry failed' }).click();
    await expect(
      toastRegion(page).getByText('✓ Reading 1 page again', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await latestJob(extensionWorker, 'pageText'))?.state)
      .toBe('succeeded');
    // Only the failed page was requested again.
    expect(requested.slice(before)).toEqual(['https://flaky.e2e.invalid/']);
    expect((await latestJob(extensionWorker, 'pageText'))?.total).toBe(1);
    await expect(coverage.getByRole('listitem').nth(2)).toHaveText('Failed in the last run: 0');
  });

  test('Never Read These Sites in Options deletes the text indexed from a site and keeps runs off it, and Refresh outdated reads only out-of-date pages (S1, S2.4)', async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    const { folderId, ids } = await seedFolder(extensionWorker, 'E2E Page Text Sites', [
      { title: 'Current page', url: 'https://current-s1.e2e.invalid/' },
      { title: 'Moved page', url: 'https://moved-s1.e2e.invalid/new' },
      { title: 'Private wiki', url: 'https://wiki.private-s1.invalid/home' },
    ]);
    const id = (title: string) => ids[title] ?? '';
    await setSettings(extensionWorker, { pageTextEnabled: true, pageTextDefaultScope: 'folder' });
    await seedPageTexts(extensionWorker, [
      { bookmarkId: id('Current page'), url: 'https://current-s1.e2e.invalid/', text: 'current' },
      // Read at the address the bookmark had before: out of date.
      { bookmarkId: id('Moved page'), url: 'https://moved-s1.e2e.invalid/old', text: 'moved' },
      { bookmarkId: id('Private wiki'), url: 'https://wiki.private-s1.invalid/home', text: 'wiki' },
    ]);
    const requested: string[] = [];
    await context.route(/^https:\/\/[^/]*\.invalid\//, (route) => {
      requested.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE });
    });

    await page.goto(`chrome-extension://${extensionId}/options.html?category=metadataContent`);
    const coverage = page.getByTestId('page-text-coverage');
    await expect(coverage.getByRole('listitem').first()).toHaveText(
      /^Indexed: 2 of \d+ bookmarks that can be indexed$/,
    );
    await expect(coverage.getByRole('listitem').nth(1)).toHaveText(/^Out of date: 1 /);
    await expect(coverage.getByRole('listitem').last()).toHaveText(/^Last indexed: \S/);

    // Typing a whole address keeps its site; the text indexed from it is deleted.
    const sites = page.locator('[data-setting="pageTextExcludedSites"]');
    await sites.getByRole('textbox').fill('https://www.private-s1.invalid/anything');
    await sites.getByRole('textbox').press('Enter');
    await expect(sites.locator('[data-slot="list-chip"]')).toHaveText(['private-s1.invalid']);
    await expect
      .poll(async () => (await readSettings(extensionWorker)).pageTextExcludedSites)
      .toEqual(['private-s1.invalid']);
    await expect.poll(() => indexedCount(extensionWorker)).toBe(2);
    await expect(coverage.getByRole('listitem').first()).toHaveText(
      /^Indexed: 1 of \d+ bookmarks that can be indexed$/,
    );

    // Refresh outdated reads the out-of-date page only.
    await page
      .getByTestId('page-text-index')
      .getByRole('button', { name: 'Refresh outdated' })
      .click();
    await expect(
      toastRegion(page).getByText('✓ Reading 1 out-of-date page again', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await latestJob(extensionWorker, 'pageText'))?.state)
      .toBe('succeeded');
    expect(requested).toEqual(['https://moved-s1.e2e.invalid/new']);
    expect((await latestJob(extensionWorker, 'pageText'))?.total).toBe(1);

    // A run over the folder never requests the site, and says why.
    requested.length = 0;
    await openTools(page, extensionId, folderId);
    await toolCard(page, 'Index Page Text')
      .getByRole('button', { name: 'Index', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Choose sites to read' })
      .getByRole('button', { name: 'Start with 1 site' })
      .click();
    const review = page.getByRole('dialog', { name: 'Index Page Text' });
    await review.getByRole('radio', { name: 'Skipped (1)' }).click();
    await expect(
      review.getByTestId('page-text-item').filter({ hasText: 'Private wiki' }),
    ).toContainText('Not downloaded: the site is listed in Never Read These Sites in Settings.');
    expect(requested).toEqual(['https://moved-s1.e2e.invalid/new']);
  });

  test('addresses with sign-in details or a token are skipped unrequested until Skip Addresses with Sign-in Details or Secrets is turned off in Options', async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    const { folderId } = await seedFolder(extensionWorker, 'E2E Page Text Secrets', [
      { title: 'Trip notes', url: 'https://trip.e2e.invalid/notes' },
      { title: 'Private feed', url: 'https://feed.e2e.invalid/rss?token=abc123' },
    ]);
    await setSettings(extensionWorker, { pageTextEnabled: true, pageTextDefaultScope: 'folder' });
    const requested: string[] = [];
    await context.route('https://*.e2e.invalid/**', (route) => {
      requested.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE });
    });
    const run = async () => {
      await openTools(page, extensionId, folderId);
      await toolCard(page, 'Index Page Text')
        .getByRole('button', { name: 'Index', exact: true })
        .click();
      await page
        .getByRole('dialog', { name: 'Choose sites to read' })
        .getByRole('button', { name: 'Start with 1 site' })
        .click();
      return page.getByRole('dialog', { name: 'Index Page Text' });
    };

    // On by default: the feed is listed as skipped with the reason, and never requested.
    let review = await run();
    await expect(review.getByRole('radio', { name: 'Text found (1)' })).toBeVisible();
    await review.getByRole('radio', { name: 'Skipped (1)' }).click();
    await expect(
      review.getByTestId('page-text-item').filter({ hasText: 'Private feed' }),
    ).toContainText(
      "Not downloaded: the address holds a parameter listed in the Privacy Scanner's Sensitive Parameters, such as a token, which the site would receive.",
    );
    expect(requested).toEqual(['https://trip.e2e.invalid/notes']);

    // Turned off in Options, the next run reads the feed like any other.
    await page.goto(`chrome-extension://${extensionId}/options.html?category=metadataContent`);
    const toggle = page.getByRole('switch', {
      name: 'Skip Addresses with Sign-in Details or Secrets',
    });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect
      .poll(async () => (await readSettings(extensionWorker)).pageTextSkipSecretUrls)
      .toBe(false);
    requested.length = 0;
    review = await run();
    await expect(review.getByRole('radio', { name: 'Text found (2)' })).toBeVisible();
    expect(requested.sort()).toEqual([
      'https://feed.e2e.invalid/rss?token=abc123',
      'https://trip.e2e.invalid/notes',
    ]);
    expect((await latestJob(extensionWorker, 'pageText'))?.options).toMatchObject({
      skipSecretUrls: false,
    });
  });

  test("a run's page text is dropped from its saved results when a bookmark is deleted, a site loses access, and once the review is saved (media review 5)", async ({
    context,
    extensionId,
    extensionWorker,
    page,
  }) => {
    const seeded = await seedFolder(extensionWorker, 'E2E Run Text', [
      { title: 'Alpha', url: 'https://alpha-r5.invalid/' },
      { title: 'Beta', url: 'https://beta-r5.invalid/' },
      { title: 'Gamma', url: 'https://gamma-r5.invalid/' },
    ]);
    await setSettings(extensionWorker, { pageTextEnabled: true });
    await context.route('https://*.invalid/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE }),
    );
    await openTools(page, extensionId, seeded.folderId);
    await toolCard(page, 'Index Page Text')
      .getByRole('button', { name: 'Index', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Choose sites to read' })
      .getByRole('button', { name: 'Start with 3 sites' })
      .click();
    const review = page.getByRole('dialog', { name: 'Index Page Text' });
    await expect(review.getByRole('radio', { name: 'Text found (3)' })).toBeVisible();
    const job = await latestJob(extensionWorker, 'pageText');
    if (!job) throw new Error('no job');
    expect(await runTexts(extensionWorker, job.id)).toEqual({
      Alpha: true,
      Beta: true,
      Gamma: true,
    });

    // A deleted bookmark's text goes, from the run too.
    await extensionWorker.evaluate((id) => chrome.bookmarks.remove(id), seeded.ids.Alpha ?? '');
    await expect
      .poll(() => runTexts(extensionWorker, job.id))
      .toEqual({ Alpha: false, Beta: true, Gamma: true });
    // So does the text of a site whose access is taken back.
    await revokeSite(extensionWorker, [page], 'beta-r5.invalid');
    await expect
      .poll(() => runTexts(extensionWorker, job.id))
      .toEqual({ Alpha: false, Beta: false, Gamma: true });

    // The review still lists all three: saving keeps only Gamma's, and the run keeps no text.
    await review.getByRole('button', { name: 'Save text of 3 pages' }).click();
    await expect(review).toHaveCount(0);
    await expect.poll(() => indexedCount(extensionWorker)).toBe(1);
    expect(await runTexts(extensionWorker, job.id)).toEqual({
      Alpha: false,
      Beta: false,
      Gamma: false,
    });
  });

  test("removing the extension's website access deletes the page text it indexed (S46)", async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    const { ids } = await seedFolder(extensionWorker, 'E2E Page Text Access', [
      { title: 'Alpha page', url: 'https://alpha-s46.invalid/' },
      { title: 'Beta page', url: 'http://beta-s46.invalid/' },
    ]);
    await seedPageTexts(
      extensionWorker,
      Object.entries(ids).map(([title, bookmarkId]) => ({
        bookmarkId,
        url: title.startsWith('Alpha') ? 'https://alpha-s46.invalid/' : 'http://beta-s46.invalid/',
        text: `${title} quokka`,
      })),
    );
    expect(await indexedCount(extensionWorker)).toBe(2);
    await setSettings(extensionWorker, { pageTextEnabled: true });
    await page.goto(`chrome-extension://${extensionId}/options.html?category=metadataContent`);
    const panel = page.getByTestId('page-text-index');
    await expect(panel).toContainText(
      'Taking back website access to a site deletes the text indexed from it.',
    );
    await expect(panel).toContainText('2 pages indexed');

    // This build declares website access as required, which cannot be removed, so the browser's
    // report is dispatched as Chrome sends it when the user removes one site's access, with the
    // access check answering as it then would: alpha is gone, beta still allowed.
    const revoke = (site: string) =>
      extensionWorker.evaluate((removed) => {
        const contains = chrome.permissions.contains.bind(chrome.permissions);
        Object.defineProperty(chrome.permissions, 'contains', {
          configurable: true,
          value: async (request: chrome.permissions.Permissions) =>
            !request.origins?.some((origin) => origin.includes(removed)) && contains(request),
        });
        const origins = [`http://*.${removed}/*`, `https://*.${removed}/*`];
        (
          chrome.permissions.onRemoved as unknown as {
            dispatch: (permissions: chrome.permissions.Permissions) => void;
          }
        ).dispatch({ origins, permissions: [] });
      }, site);
    await revoke('alpha-s46.invalid');
    await expect.poll(() => indexedCount(extensionWorker)).toBe(1);
    await expect(panel).toContainText('1 page indexed');
    await revoke('beta-s46.invalid');
    await expect.poll(() => indexedCount(extensionWorker)).toBe(0);
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

test('while Index Page Text is off, content: and has:content say so in the popup and the manager instead of finding nothing (S47)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const notice =
    'Page text search is off, so content: and has:content find nothing. Turn on Index Page Text in Settings.';
  await seedFolder(extensionWorker, 'E2E Search Notice', [
    { title: 'Notice page', url: 'https://notice.e2e.invalid/' },
  ]);
  await page.goto(`${managerUrl(extensionId)}?q=${encodeURIComponent('content:quokka')}`);
  await expect(page.getByRole('status').filter({ hasText: notice })).toBeVisible();
  await openPopup(page, extensionId);
  const search = page.getByRole('combobox', { name: 'Search bookmarks, or type a folder name' });
  await search.fill('has:content');
  await expect(page.getByText(notice, { exact: true })).toBeVisible();
  // A plain word is no page text query.
  await search.fill('quokka');
  await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
  await search.fill('content:quokka');
  await expect(page.getByText(notice, { exact: true })).toBeVisible();
  // Turned on, the notice goes at once.
  await setSettings(extensionWorker, { pageTextEnabled: true });
  await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
  await page.goto(`${managerUrl(extensionId)}?q=${encodeURIComponent('content:quokka')}`);
  await expect(managerSearch(page)).toHaveValue('content:quokka');
  await expect(page.getByText(notice, { exact: true })).toHaveCount(0);
});

test('page text that looks like HTML shows as text in search results, never as markup (S35)', async ({
  extensionId,
  extensionWorker,
  page,
}) => {
  const { ids } = await seedFolder(extensionWorker, 'E2E Page Text Markup', [
    { title: 'Markup page', url: 'https://markup.e2e.invalid/' },
  ]);
  const id = ids['Markup page'];
  if (!id) throw new Error('not seeded');
  const markup = '<img src=x onerror="window.pageTextXss=1"><b>bold</b>';
  await seedPageTexts(extensionWorker, [
    { bookmarkId: id, url: 'https://markup.e2e.invalid/', text: `A quokka note ${markup}` },
  ]);
  await setSettings(extensionWorker, { pageTextEnabled: true });
  await openPopup(page, extensionId);
  await page
    .getByRole('combobox', { name: 'Search bookmarks, or type a folder name' })
    .fill('onerror');
  const hit = page.locator('.bookmark-item').filter({ hasText: 'Markup page' });
  await expect(hit).toContainText(markup);
  await expect(hit.locator('img[src="x"], b')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as { pageTextXss?: number }).pageTextXss),
  ).toBeUndefined();

  await page.goto(`${managerUrl(extensionId)}?q=${encodeURIComponent('content:onerror')}`);
  const row = page.locator('tbody tr').filter({ hasText: 'Markup page' });
  await expect(row).toContainText(markup);
  await expect(row.locator('img[src="x"], b')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as { pageTextXss?: number }).pageTextXss),
  ).toBeUndefined();
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
