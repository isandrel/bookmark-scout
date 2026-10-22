import { IDBFactory } from 'fake-indexeddb';
import { DOMParser as LinkedomParser } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TOOL_DEFINITIONS } from '@/components/bookmarks/tools/tool-definitions';
import { INPUT_LIMITS } from '@/lib/input-limits';
import type { JobKind } from '@/lib/job-store';
import { closeJobDb, getJob, getJobItems } from '@/lib/job-store';
import { clearPageTexts, PAGE_TEXT_LIMITS, savePageTexts } from '@/lib/page-text-store';
import type { PageTextReading } from '@/lib/quick-save-protocol';
import { QUICK_SAVE_MESSAGE } from '@/lib/quick-save-protocol';
import { pageTextReadingSchema, quickSaveHostRequestSchema } from '@/lib/quick-save-validation';
import { saveSettings } from '@/lib/settings-storage';
import { METADATA_MAX_BYTES } from '@/services/bookmark-network-tools';
import {
  resetJobCoordinatorForTests,
  runJobCommand,
  whenJobsIdle,
} from '@/services/job-coordinator';
import type { PageTextScanResult } from '@/services/page-text';
import { getPageTextCoverage } from '@/services/page-text-coverage';
import { installFakeBookmarks } from '../fake-bookmarks';
import { installFakePermissions } from '../fake-permissions';

// A service worker has no DOM parser, so it reads page heads through the AI host page; the tests
// stand in for that page and count what it was asked.
const host = vi.hoisted(() => ({
  heads: [] as string[],
  texts: [] as string[],
  open: 0,
  lostAfter: Number.POSITIVE_INFINITY,
}));
vi.mock('@/services/quick-save-ai-host', () => ({
  withAIHost: async (
    _settings: unknown,
    _options: unknown,
    work: (session: {
      readHead: (html: string) => Promise<{ title: string }>;
      readText: (html: string) => Promise<PageTextReading>;
    }) => Promise<unknown>,
  ) => {
    host.open += 1;
    return work({
      readHead: async (html) => {
        // The page closed under the job: every read after it fails.
        if (host.heads.length >= host.lostAfter) throw new Error('The host page closed');
        host.heads.push(html);
        return { title: 'Read by the host page' };
      },
      readText: async (html) => {
        if (host.texts.length >= host.lostAfter) throw new Error('The host page closed');
        host.texts.push(html);
        // The host page tells sign-in pages apart (`readPageTextHtml`); here, by a marker.
        if (html.includes('SIGN-IN')) return { status: 'signIn' };
        return { status: 'read', text: 'Text read by the host page' };
      },
    });
  },
}));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const html = (title: string, extra = '') =>
  new Response(`<html><head><title>${title}</title>${extra}</head><body></body></html>`, {
    headers: { 'content-type': 'text/html' },
  });

/** Answers by URL; an unknown URL is a refused connection. */
function stubFetch(pages: Record<string, () => Response>) {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      requests.push(String(input));
      const page = pages[String(input)];
      if (!page) throw new TypeError('Failed to fetch');
      return page();
    }),
  );
  return requests;
}

async function runToEnd(kind: JobKind, sites?: string[]) {
  const response = await runJobCommand({
    type: 'start',
    commandId: crypto.randomUUID(),
    kind,
    source: 'manager',
    scope: { mode: 'folder', folderId: 'f' },
    ...(sites ? { sites } : {}),
  });
  if (!response.ok || !response.job) throw new Error('not accepted');
  await whenJobsIdle();
  const job = await getJob(response.job.id);
  const items = await getJobItems(response.job.id);
  return { job, results: items.map((item) => item.result), outcomes: items.map((i) => i.outcome) };
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await closeJobDb();
  globalThis.indexedDB = new IDBFactory();
  resetJobCoordinatorForTests();
  // Started from a page, which asked for the bookmarks' sites first.
  installFakePermissions({ origins: [...WEB_ORIGINS] });
  host.heads = [];
  host.texts = [];
  host.open = 0;
  host.lostAfter = Number.POSITIVE_INFINITY;
  installFakeBookmarks([
    { id: 'f', title: 'Folder' },
    { id: 'b1', parentId: 'f', title: 'Old one', url: 'https://one.invalid/page' },
    { id: 'b2', parentId: 'f', title: 'Old two', url: 'https://two.invalid/page' },
    { id: 'b3', parentId: 'f', title: 'Down', url: 'https://down.invalid/page' },
    { id: 'b4', parentId: 'f', title: 'Script', url: 'javascript:void(0)' },
  ]);
});

afterEach(async () => {
  await whenJobsIdle().catch(() => undefined);
  vi.unstubAllGlobals();
});

describe('Metadata Fetcher as a background job', () => {
  // Overwrite titles is off by default, so a bookmark with a title is not marked changed.
  it('suggests titles, counts a page that could not be loaded as not checked, and skips non-web links', async () => {
    vi.stubGlobal('DOMParser', LinkedomParser);
    stubFetch({
      'https://one.invalid/page': () => html('New one'),
      'https://two.invalid/page': () => new Response('Not here', { status: 404 }),
    });
    const { job, results, outcomes } = await runToEnd('metadataFetcher');
    expect(job).toMatchObject({ state: 'partial', done: { succeeded: 2, skipped: 1, failed: 1 } });
    expect(outcomes).toEqual(['succeeded', 'succeeded', 'failed', 'skipped']);
    expect(results).toMatchObject([
      { id: 'b1', status: 'ok', suggestedTitle: 'New one', changed: false },
      { id: 'b2', status: 'httpError', statusCode: 404 },
      { id: 'b3', status: 'error' },
      { id: 'b4', status: 'skipped' },
    ]);
    // A background page parses heads itself.
    expect(host.open).toBe(0);
  });

  it('reads heads through the AI host page where there is no DOM parser, once per slice', async () => {
    vi.stubGlobal('DOMParser', undefined);
    stubFetch({
      'https://one.invalid/page': () => html('New one'),
      'https://two.invalid/page': () => html('New two'),
    });
    const { results } = await runToEnd('metadataFetcher');
    expect(host.open).toBe(1);
    expect(host.heads).toHaveLength(2);
    expect(results.slice(0, 2)).toMatchObject([
      { suggestedTitle: 'Read by the host page' },
      { suggestedTitle: 'Read by the host page' },
    ]);
  });
});

describe('the AI host page lost mid-slice (J59)', () => {
  it('pauses with what it read, and reads the rest when resumed', async () => {
    vi.stubGlobal('DOMParser', undefined);
    stubFetch({
      'https://one.invalid/page': () => html('New one'),
      'https://two.invalid/page': () => html('New two'),
    });
    host.lostAfter = 1;
    const { job, outcomes } = await runToEnd('metadataFetcher');
    expect(job).toMatchObject({ state: 'paused', lastError: { code: 'slice-setup' } });
    // The page whose head could not be read is still to do, not reported as unreadable.
    expect(outcomes.slice(0, 2)).toEqual(['succeeded', undefined]);

    host.lostAfter = Number.POSITIVE_INFINITY;
    if (!job) throw new Error('no job');
    await runJobCommand({ type: 'resume', jobId: job.id });
    await whenJobsIdle();
    const items = await getJobItems(job.id);
    expect((await getJob(job.id))?.state).not.toBe('paused');
    expect(items.slice(0, 2).map((item) => item.outcome)).toEqual(['succeeded', 'succeeded']);
  });
});

describe('Refresh Site Icons as a background job', () => {
  it('downloads one icon per site, and keeps the scope counts for the review', async () => {
    stubFetch({
      'https://one.invalid/page': () => html('One', '<link rel="icon" href="/icon.png">'),
      'https://one.invalid/icon.png': () =>
        new Response(PNG, { headers: { 'content-type': 'image/png' } }),
      'https://two.invalid/page': () => html('Two'),
    });
    const { job, results, outcomes } = await runToEnd('siteIcons');
    expect(job).toMatchObject({
      state: 'partial',
      total: 3,
      summary: { scannedBookmarks: 4, skippedBookmarks: 1 },
    });
    expect(outcomes).toEqual(['succeeded', 'succeeded', 'failed']);
    expect(results).toMatchObject([
      { origin: 'https://one.invalid', status: 'updated', iconUrl: 'https://one.invalid/icon.png' },
      { origin: 'https://two.invalid', status: 'noIcon' },
      { origin: 'https://down.invalid', status: 'failed' },
    ]);
  });
});

describe('Index Page Text as a background job (S25-S27)', () => {
  beforeEach(async () => {
    await saveSettings({ pageTextEnabled: true });
  });

  const article = (words: string) =>
    new Response(
      `<html><head><title>T</title></head><body><article><h1>Heading</h1><p>${words}</p></article></body></html>`,
      { headers: { 'content-type': 'text/html' } },
    );

  // The text reader stays out of the background's code, so even a background page with a DOM
  // parser (Firefox) reads text in the AI host page.
  it("keeps each page's text, read in the AI host page, skips non-web links, and counts unreachable pages as not read", async () => {
    vi.stubGlobal('DOMParser', LinkedomParser);
    stubFetch({
      'https://one.invalid/page': () => article('Words inside the first page. '.repeat(20)),
      'https://two.invalid/page': () => new Response('Not here', { status: 404 }),
    });
    const { job, results, outcomes } = await runToEnd('pageText');
    expect(job).toMatchObject({ summary: { overLimit: 0 } });
    expect(outcomes).toEqual(['succeeded', 'succeeded', 'failed', 'skipped']);
    expect(results).toMatchObject([
      { id: 'b1', status: 'read', text: 'Text read by the host page' },
      { id: 'b2', status: 'empty' },
      { id: 'b3', status: 'failed' },
      { id: 'b4', status: 'skipped' },
    ]);
    // Only the page that loaded is read; one host page for the slice.
    expect(host.texts).toEqual([expect.stringContaining('Words inside the first page.')]);
    expect(host.open).toBe(1);
  });

  it('lists sign-in pages on their own without text: an HTTP 401 unread, a password page as the host reads it (S12)', async () => {
    vi.stubGlobal('DOMParser', undefined);
    stubFetch({
      'https://one.invalid/page': () => article('SIGN-IN'),
      'https://two.invalid/page': () =>
        new Response('<html><body>Please sign in</body></html>', {
          status: 401,
          headers: { 'content-type': 'text/html' },
        }),
    });
    const { results, outcomes } = await runToEnd('pageText');
    expect(outcomes.slice(0, 2)).toEqual(['succeeded', 'succeeded']);
    expect(results.slice(0, 2)).toEqual([
      expect.objectContaining({ id: 'b1', status: 'signIn' }),
      expect.objectContaining({ id: 'b2', status: 'signIn' }),
    ]);
    expect(results.slice(0, 2).map((result) => (result as { text?: string }).text)).toEqual([
      undefined,
      undefined,
    ]);
    // The 401 page is never handed to the reader.
    expect(host.texts).toEqual([expect.stringContaining('SIGN-IN')]);
  });

  it('downloads only from the sites chosen before the run, frozen with the job, and lists the rest as not chosen (S03)', async () => {
    vi.stubGlobal('DOMParser', undefined);
    const requests = stubFetch({
      'https://one.invalid/page': () => article('One'),
      'https://two.invalid/page': () => article('Two'),
    });
    const { job, results, outcomes } = await runToEnd('pageText', ['two.invalid']);
    expect(job?.options).toMatchObject({ sites: ['two.invalid'] });
    expect(requests).toEqual(['https://two.invalid/page']);
    expect(outcomes).toEqual(['skipped', 'succeeded', 'skipped', 'skipped']);
    expect(results).toMatchObject([
      { id: 'b1', status: 'notChosen' },
      { id: 'b2', status: 'read' },
      { id: 'b3', status: 'notChosen' },
      { id: 'b4', status: 'skipped' },
    ]);
  });

  it('pauses when the AI host page is lost, and reads the rest when resumed', async () => {
    vi.stubGlobal('DOMParser', undefined);
    stubFetch({
      'https://one.invalid/page': () => article('One'),
      'https://two.invalid/page': () => article('Two'),
    });
    host.lostAfter = 1;
    const { job, results, outcomes } = await runToEnd('pageText');
    expect(job).toMatchObject({ state: 'paused', lastError: { code: 'slice-setup' } });
    expect(outcomes.slice(0, 2)).toEqual(['succeeded', undefined]);
    expect(results[0]).toMatchObject({ status: 'read', text: 'Text read by the host page' });

    host.lostAfter = Number.POSITIVE_INFINITY;
    if (!job) throw new Error('no job');
    await runJobCommand({ type: 'resume', jobId: job.id });
    await whenJobsIdle();
    const items = await getJobItems(job.id);
    expect(items.slice(0, 2).map((item) => item.outcome)).toEqual(['succeeded', 'succeeded']);
    expect(host.texts).toHaveLength(2);
  });

  it('downloads an address once for every bookmark of it, and each bookmark gets the text (S19)', async () => {
    installFakeBookmarks([
      { id: 'f', title: 'Folder' },
      { id: 'd1', parentId: 'f', title: 'Copy one', url: 'https://one.invalid/page' },
      { id: 'd2', parentId: 'f', title: 'Copy two', url: 'https://one.invalid/page' },
      { id: 'd3', parentId: 'f', title: 'Copy three', url: 'https://one.invalid/page' },
    ]);
    const requests = stubFetch({ 'https://one.invalid/page': () => article('One') });
    const { job, results } = await runToEnd('pageText');
    expect(requests).toEqual(['https://one.invalid/page']);
    if (!job) throw new Error('no job');
    const shown = TOOL_DEFINITIONS.pageText.job?.result(job, results) as PageTextScanResult;
    expect(shown.items.map((item) => [item.id, item.status, item.text])).toEqual([
      ['d1', 'read', 'Text read by the host page'],
      ['d2', 'read', 'Text read by the host page'],
      ['d3', 'read', 'Text read by the host page'],
    ]);
    // The shared download is stored once, with the bookmark that made it.
    expect(results.filter((result) => (result as { text?: string }).text)).toHaveLength(1);
  });

  it('is refused while Index Page Text is off, even with AI page reading on (S49)', async () => {
    await saveSettings({ pageTextEnabled: false, aiReadPageContent: true });
    const requests = stubFetch({});
    const response = await runJobCommand({
      type: 'start',
      commandId: crypto.randomUUID(),
      kind: 'pageText',
      source: 'manager',
      scope: { mode: 'folder', folderId: 'f' },
    });
    expect(response.ok).toBe(false);
    await whenJobsIdle();
    expect(requests).toEqual([]);
  });

  it('says what the index covers and what the last run could not read, and retries only those', async () => {
    await clearPageTexts();
    stubFetch({
      'https://one.invalid/page': () => article('One'),
      'https://two.invalid/page': () => article('Two'),
    });
    await runToEnd('pageText');
    // One page saved; another kept from an earlier address of its bookmark.
    await savePageTexts([
      { bookmarkId: 'b1', url: 'https://one.invalid/page', text: 'one' },
      { bookmarkId: 'b2', url: 'https://two.invalid/old', text: 'two' },
    ]);
    const coverage = await getPageTextCoverage();
    expect(coverage).toMatchObject({ eligible: 3, indexed: 1, stale: 1 });
    expect(coverage.failed.map((item) => item.id)).toEqual(['b3']);

    const requests = stubFetch({ 'https://down.invalid/page': () => article('Back') });
    const response = await runJobCommand({
      type: 'start',
      commandId: crypto.randomUUID(),
      kind: 'pageText',
      source: 'options',
      scope: { mode: 'all' },
      sites: ['down.invalid'],
      bookmarkIds: ['b3'],
    });
    if (!response.ok || !response.job) throw new Error('not accepted');
    await whenJobsIdle();
    const items = await getJobItems(response.job.id);
    expect(items.map((item) => item.result)).toMatchObject([{ id: 'b3', status: 'read' }]);
    expect(requests).toEqual(['https://down.invalid/page']);
    expect((await getPageTextCoverage()).failed).toEqual([]);
  });
});

describe('the AI host page reading a page', () => {
  it('accepts a page as long as Index Page Text downloads, and no longer', () => {
    expect(INPUT_LIMITS.chars.page_html).toBe(PAGE_TEXT_LIMITS.maxBytes);
    const request = (length: number) => ({
      type: QUICK_SAVE_MESSAGE.hostReadText,
      token: 'token',
      html: 'x'.repeat(length),
      maxChars: PAGE_TEXT_LIMITS.maxCharsPerPage,
    });
    const max = PAGE_TEXT_LIMITS.maxBytes;
    expect(quickSaveHostRequestSchema.safeParse(request(max)).success).toBe(true);
    expect(quickSaveHostRequestSchema.safeParse(request(max + 1)).success).toBe(false);
    // Text no longer than the index keeps is asked for.
    const longer = { ...request(1), maxChars: PAGE_TEXT_LIMITS.maxCharsPerPage + 1 };
    expect(quickSaveHostRequestSchema.safeParse(longer).success).toBe(false);
  });

  it('answers with text no longer than the index keeps, or a status without text', () => {
    const text = (length: number) => ({ status: 'read', text: 'x'.repeat(length) });
    expect(pageTextReadingSchema.safeParse(text(PAGE_TEXT_LIMITS.maxCharsPerPage)).success).toBe(
      true,
    );
    expect(
      pageTextReadingSchema.safeParse(text(PAGE_TEXT_LIMITS.maxCharsPerPage + 1)).success,
    ).toBe(false);
    expect(pageTextReadingSchema.safeParse(text(0)).success).toBe(false);
    expect(pageTextReadingSchema.safeParse({ status: 'signIn' }).success).toBe(true);
    // A sign-in page never carries text.
    expect(pageTextReadingSchema.safeParse({ status: 'signIn', text: 'x' }).success).toBe(false);
    expect(pageTextReadingSchema.safeParse({ status: 'other' }).success).toBe(false);
  });
});

describe('the AI host page reading a head', () => {
  it('accepts a head as long as the Metadata Fetcher reads, and no longer', () => {
    expect(INPUT_LIMITS.chars.page_head).toBe(METADATA_MAX_BYTES);
    const request = (length: number) => ({
      type: QUICK_SAVE_MESSAGE.hostReadHead,
      token: 'token',
      html: 'x'.repeat(length),
      descriptions: false,
    });
    expect(quickSaveHostRequestSchema.safeParse(request(METADATA_MAX_BYTES)).success).toBe(true);
    expect(quickSaveHostRequestSchema.safeParse(request(METADATA_MAX_BYTES + 1)).success).toBe(
      false,
    );
  });
});
