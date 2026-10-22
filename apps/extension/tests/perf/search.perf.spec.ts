/**
 * Search in the query language on the full library (U37), then with indexed page text (S36): how
 * long each query takes in the manager's search box until its results settle, and how much heap
 * the search documents and their caches keep, measured in the popup, which loads the search only
 * on the first query. Queries and the page text corpus are `[search]` and `[page_text]` in
 * perf.toml.
 */
import type { BrowserContext, Worker } from '@playwright/test';
import { z } from 'zod';
import { INDEXED_DATABASES } from '../../src/lib/storage/registry';
import { expect, test } from '../e2e/fixtures';
import { setSettings } from '../e2e/storage';
import {
  closeMeasured,
  measureHeap,
  measureSettled,
  openMeasured,
  PerfReport,
  perfConfig,
  readExtensionConfig,
  seedLibrary,
} from './harness';

const POPUP = { width: 400, height: 600 };

/**
 * The index as Index Page Text keeps it: the corpus stays within what it would store, and is
 * stored with its extractor version.
 */
const pageTextLimits = readExtensionConfig(
  'bookmarks/page-text',
  z.looseObject({
    max_pages: z.number().int().positive(),
    max_chars_per_page: z.number().int().positive(),
    extractor_version: z.number().int().positive(),
  }),
);
if (
  perfConfig.page_text.pages > pageTextLimits.max_pages ||
  perfConfig.page_text.chars_per_page > pageTextLimits.max_chars_per_page
) {
  throw new Error('[page_text] in perf.toml is past what Index Page Text keeps');
}

/**
 * Stores `[page_text]`'s corpus in the page text index, as Index Page Text leaves it: one record
 * per bookmark, spread evenly over the library, read from the bookmark's own address. Returns how
 * many pages were stored.
 */
async function seedPageTexts(worker: Worker): Promise<number> {
  return worker.evaluate(
    async ({ corpus, dbName, version }) => {
      const bookmarks: { id: string; url: string }[] = [];
      const walk = (node: chrome.bookmarks.BookmarkTreeNode) => {
        if (node.url) bookmarks.push({ id: node.id, url: node.url });
        for (const child of node.children ?? []) walk(child);
      };
      for (const root of await chrome.bookmarks.getTree()) walk(root);
      const step = Math.max(1, Math.floor(bookmarks.length / corpus.pages));
      const chosen = bookmarks.filter((_, index) => index % step === 0).slice(0, corpus.pages);

      // A fixed linear congruential sequence, so every run stores the same text.
      let seed = 1;
      const nextWord = () => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return corpus.words[seed % corpus.words.length];
      };
      const textOf = (index: number) => {
        const words: string[] = [];
        let length = 0;
        while (length < corpus.chars_per_page) {
          const word = nextWord();
          words.push(word);
          length += word.length + 1;
        }
        if (index % corpus.rare_every === 0) words.splice(words.length >> 1, 0, corpus.rare_word);
        return words.join(' ').slice(0, corpus.chars_per_page);
      };

      // Opened without a version: an index the extension has not made yet is made as it makes it.
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onupgradeneeded = () =>
          request.result.createObjectStore('pages', { keyPath: 'bookmarkId' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction('pages', 'readwrite');
      const store = transaction.objectStore('pages');
      const indexedAt = Date.now();
      for (const [index, bookmark] of chosen.entries()) {
        store.put({
          bookmarkId: bookmark.id,
          url: bookmark.url,
          text: textOf(index),
          indexedAt,
          extractorVersion: version,
        });
      }
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
      return chosen.length;
    },
    {
      corpus: perfConfig.page_text,
      dbName: INDEXED_DATABASES.pageText.name,
      version: pageTextLimits.extractor_version,
    },
  );
}

/**
 * Times each query in the manager's search box, from putting it in the box until the results
 * stop changing, as `<prefix>.query.<name>`. The first query after the page opens is timed on its
 * own as `<prefix>.firstQuery`: it also builds whatever search documents the page has not built
 * while idle. Returns false when a query timed out.
 */
async function timeManagerQueries(
  context: BrowserContext,
  extensionId: string,
  report: PerfReport,
  prefix: string,
  queries: Record<string, string>,
): Promise<boolean> {
  const { page } = await openMeasured(context, `chrome-extension://${extensionId}/bookmarks.html`, [
    'tbody tr',
  ]);
  const box = page.getByPlaceholder('Search titles, addresses, folders, and tags');
  const entries = Object.entries(queries);
  const clear = () => measureSettled(page, () => box.fill(''), 'main');
  const [, firstQuery] = entries[0] ?? [];
  if (firstQuery) {
    const first = await measureSettled(page, () => box.fill(firstQuery), 'main');
    if (!report.addInteraction(`${prefix}.firstQuery`, first)) {
      await closeMeasured(page);
      return false;
    }
    await clear();
  }
  for (const [name, query] of entries) {
    const searched = await measureSettled(page, () => box.fill(query), 'main');
    if (!report.addInteraction(`${prefix}.query.${name}`, searched)) {
      await closeMeasured(page);
      return false;
    }
    await clear();
  }
  await closeMeasured(page);
  return true;
}

/**
 * The heap the popup's search keeps after running every query, as `<prefix>.heapKiB`: its search
 * documents (with their folded text, and page text when indexed) and match caches. The popup
 * loads the search on the first query, so the heap before it has none of them.
 */
async function measureSearchHeap(
  context: BrowserContext,
  extensionId: string,
  report: PerfReport,
  prefix: string,
  queries: Record<string, string>,
): Promise<void> {
  const { page } = await openMeasured(
    context,
    `chrome-extension://${extensionId}/popup.html`,
    ['.folder-item'],
    { size: POPUP },
  );
  const search = page.getByRole('combobox', { name: /^Search bookmarks/ });
  const before = await measureHeap(page);
  report.add(`${prefix}.heapBeforeKiB`, before, 'KiB');
  for (const query of Object.values(queries)) {
    await measureSettled(page, () => search.fill(query), '#root');
  }
  await measureSettled(page, () => search.fill(''), '#root');
  report.add(`${prefix}.heapKiB`, (await measureHeap(page)) - before, 'KiB');
  await closeMeasured(page);
}

/** Runs both measurements `repeats` times, each page on its own so the heap is only its own. */
async function measureSearch(
  context: BrowserContext,
  extensionId: string,
  report: PerfReport,
  prefix: string,
  queries: Record<string, string>,
) {
  for (let run = 0; run < perfConfig.run.repeats; run++) {
    if (!(await timeManagerQueries(context, extensionId, report, prefix, queries))) continue;
    await measureSearchHeap(context, extensionId, report, prefix, queries);
  }
}

test('search: operator queries and the memory of search documents on 19,500 bookmarks', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  await seedLibrary(extensionWorker);
  const report = new PerfReport();
  await measureSearch(context, extensionId, report, 'search', perfConfig.search.queries);
  await report.write(testInfo);
});

test('search: page text queries and memory with an indexed corpus', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  await seedLibrary(extensionWorker);
  await setSettings(extensionWorker, { pageTextEnabled: true });
  const stored = await seedPageTexts(extensionWorker);
  testInfo.annotations.push({ type: 'page text', description: `${stored} pages indexed` });
  // The corpus is searched: the pages naming the rare word are found by their text alone.
  const check = await context.newPage();
  await check.goto(
    `chrome-extension://${extensionId}/bookmarks.html?q=${encodeURIComponent(`content:${perfConfig.page_text.rare_word}`)}`,
  );
  await expect(check.locator('main')).toContainText(
    `${Math.ceil(stored / perfConfig.page_text.rare_every)} items`,
    { timeout: 60_000 },
  );
  await check.close();
  const report = new PerfReport();
  report.add('pageText.pages', stored, 'pages');
  await measureSearch(context, extensionId, report, 'pageText', perfConfig.page_text.queries);
  await report.write(testInfo);
});
