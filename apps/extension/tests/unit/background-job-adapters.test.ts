import { IDBFactory } from 'fake-indexeddb';
import { DOMParser as LinkedomParser } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { INPUT_LIMITS } from '@/lib/input-limits';
import type { JobKind } from '@/lib/job-store';
import { closeJobDb, getJob, getJobItems } from '@/lib/job-store';
import { QUICK_SAVE_MESSAGE } from '@/lib/quick-save-protocol';
import { quickSaveHostRequestSchema } from '@/lib/quick-save-validation';
import { METADATA_MAX_BYTES } from '@/services/bookmark-network-tools';
import {
  resetJobCoordinatorForTests,
  runJobCommand,
  whenJobsIdle,
} from '@/services/job-coordinator';
import { installFakeBookmarks } from '../fake-bookmarks';
import { installFakePermissions } from '../fake-permissions';

// A service worker has no DOM parser, so it reads page heads through the AI host page; the tests
// stand in for that page and count what it was asked.
const host = vi.hoisted(() => ({ heads: [] as string[], open: 0 }));
vi.mock('@/services/quick-save-ai-host', () => ({
  withAIHost: async (
    _settings: unknown,
    _options: unknown,
    work: (session: { readHead: (html: string) => Promise<{ title: string }> }) => Promise<unknown>,
  ) => {
    host.open += 1;
    return work({
      readHead: async (html) => {
        host.heads.push(html);
        return { title: 'Read by the host page' };
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

async function runToEnd(kind: JobKind) {
  const response = await runJobCommand({
    type: 'start',
    commandId: crypto.randomUUID(),
    kind,
    source: 'manager',
    scope: { mode: 'folder', folderId: 'f' },
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
  host.open = 0;
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
