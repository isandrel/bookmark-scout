/**
 * Service-level checks that settings change results. Each test flips one setting and asserts the
 * output differs; the matrix in tests/settings-matrix.ts points here for these settings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkTreeNode } from '@/types';
import { buildAIContextPack } from '@/services/ai-bookmark-tools';
import { scanDeadLinks, fetchBookmarkMetadata, scanBookmarkPrivacy } from '@/services/bookmark-network-tools';
import { collectBookmarkStatistics, scanDuplicateBookmarks } from '@/services/bookmark-tooling';
import { getBookmarkTitle } from '@/services/context-menu';

function folder(children: BookmarkTreeNode[], title = 'Folder'): BookmarkTreeNode[] {
  return [{ id: 'root', title, children }];
}

function link(id: string, url: string, title = id): BookmarkTreeNode {
  return { id, title, url };
}

describe('privacy scanner settings', () => {
  const options = {
    scanTitles: true,
    scanQueryParams: true,
    scanFragments: true,
    sensitiveParams: ['session_id'],
    emailDetection: true,
    uuidDetection: true,
  };
  const kinds = (nodes: BookmarkTreeNode[], overrides: Partial<typeof options>) =>
    scanBookmarkPrivacy(nodes, { ...options, ...overrides }).items.flatMap((item) =>
      item.findings.map((finding) => finding.kind),
    );

  it('scans titles, query params, and fragments only when enabled', () => {
    const titled = folder([link('t', 'https://e2e.invalid/', 'Mail alice@e2e.invalid')]);
    expect(kinds(titled, {})).toEqual(['email']);
    expect(kinds(titled, { scanTitles: false })).toEqual([]);

    const query = folder([link('q', 'https://e2e.invalid/?session_id=1')]);
    expect(kinds(query, {})).toEqual(['sensitiveParam']);
    expect(kinds(query, { scanQueryParams: false })).toEqual([]);

    const fragment = folder([link('f', 'https://e2e.invalid/page#section')]);
    expect(kinds(fragment, {})).toEqual(['fragment']);
    expect(kinds(fragment, { scanFragments: false })).toEqual([]);
  });

  it('uses the saved sensitive parameter list and detector toggles', () => {
    const custom = folder([link('c', 'https://e2e.invalid/?e2e_secret=1')]);
    expect(kinds(custom, {})).toEqual([]);
    expect(kinds(custom, { sensitiveParams: ['E2E_SECRET'] })).toEqual(['sensitiveParam']);

    const email = folder([link('e', 'https://e2e.invalid/u/alice@e2e.invalid')]);
    expect(kinds(email, {})).toEqual(['email']);
    expect(kinds(email, { emailDetection: false })).toEqual([]);

    const uuid = folder([link('u', 'https://e2e.invalid/doc/123e4567-e89b-12d3-a456-426614174000')]);
    expect(kinds(uuid, {})).toEqual(['uuid']);
    expect(kinds(uuid, { uuidDetection: false })).toEqual([]);
  });
});

describe('network tool settings', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Resolves after `delayMs`, or rejects like fetch when the request is aborted first. */
  function delayedResponse(delayMs: number, signal: AbortSignal | null | undefined, body = '') {
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(
        () => resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })),
        delayMs,
      );
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  }

  function trackConcurrency() {
    const state = { active: 0, peak: 0 };
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      state.active += 1;
      state.peak = Math.max(state.peak, state.active);
      try {
        return await delayedResponse(20, init.signal, '<head><title>T</title></head>');
      } finally {
        state.active -= 1;
      }
    });
    return state;
  }

  const sixLinks = folder(
    Array.from({ length: 6 }, (_, index) => link(`l${index}`, `https://e2e.invalid/${index}`)),
  );
  const deadLinkOptions = {
    requestTimeoutMs: 1000,
    concurrency: 1,
    retryCount: 0,
    followRedirects: true,
    successStatuses: [200],
  };

  it('dead-link scans never exceed the saved concurrency', async () => {
    const serial = trackConcurrency();
    await scanDeadLinks(sixLinks, deadLinkOptions);
    expect(serial.peak).toBe(1);

    const parallel = trackConcurrency();
    await scanDeadLinks(sixLinks, { ...deadLinkOptions, concurrency: 3 });
    expect(parallel.peak).toBe(3);
  });

  it('dead-link scans time out after the saved request timeout', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      delayedResponse(200, init.signal),
    );
    const nodes = folder([link('slow', 'https://e2e.invalid/slow')]);

    const patient = await scanDeadLinks(nodes, { ...deadLinkOptions, requestTimeoutMs: 1000 });
    expect(patient.items.map((item) => item.status)).toEqual(['ok']);
    const hasty = await scanDeadLinks(nodes, { ...deadLinkOptions, requestTimeoutMs: 50 });
    expect(hasty.items.map((item) => item.status)).toEqual(['timeout']);
  });

  it('dead-link scans treat only the saved success statuses as reachable', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 404 }));
    const nodes = folder([link('gone', 'https://e2e.invalid/gone')]);

    const strict = await scanDeadLinks(nodes, deadLinkOptions);
    expect(strict.items.map((item) => item.status)).toEqual(['error']);
    const lenient = await scanDeadLinks(nodes, { ...deadLinkOptions, successStatuses: [200, 404] });
    expect(lenient.items.map((item) => item.status)).toEqual(['ok']);
  });

  it('metadata fetches never exceed the saved concurrency', async () => {
    const options = {
      overwriteTitles: true,
      fetchDescriptions: false,
      requestTimeoutMs: 1000,
      concurrency: 1,
    };
    const serial = trackConcurrency();
    await fetchBookmarkMetadata(sixLinks, options);
    expect(serial.peak).toBe(1);

    const parallel = trackConcurrency();
    await fetchBookmarkMetadata(sixLinks, { ...options, concurrency: 4 });
    expect(parallel.peak).toBe(4);
  });
});

describe('report and cleanup limits', () => {
  it('duplicate scans return at most the saved number of groups', () => {
    const nodes = folder([
      link('a1', 'https://e2e.invalid/a'),
      link('a2', 'https://e2e.invalid/a'),
      link('b1', 'https://e2e.invalid/b'),
      link('b2', 'https://e2e.invalid/b'),
    ]);
    const options = {
      strategy: 'exact_url' as const,
      normalizeWww: true,
      ignoreProtocol: false,
      ignoreTrailingSlash: true,
      keepRule: 'first' as const,
    };
    expect(scanDuplicateBookmarks(nodes, { ...options, maxGroups: 5 }).groups).toHaveLength(2);
    expect(scanDuplicateBookmarks(nodes, { ...options, maxGroups: 1 }).groups).toHaveLength(1);
  });

  it('statistics top lists hold at most the saved top-N entries', () => {
    const nodes = folder([
      link('a', 'https://a.e2e.invalid/'),
      link('b', 'https://b.e2e.invalid/'),
      link('c', 'https://c.e2e.invalid/'),
    ]);
    const options = {
      includeDomains: true,
      includeFolders: true,
      includeProtocols: true,
      includeDuplicates: false,
      includeDepthBreakdown: false,
    };
    expect(collectBookmarkStatistics(nodes, { ...options, topN: 10 }).topDomains).toHaveLength(3);
    expect(collectBookmarkStatistics(nodes, { ...options, topN: 2 }).topDomains).toHaveLength(2);
  });
});

describe('AI context pack limits', () => {
  const nodes = folder(
    [
      link('one', 'https://e2e.invalid/one', 'Pack One'),
      link('two', 'https://e2e.invalid/two', 'Pack Two'),
      { id: 'sub', title: 'Nested', children: [link('deep', 'https://e2e.invalid/deep', 'Pack Deep')] },
    ],
    'Pack',
  );
  const options = {
    format: 'markdown' as const,
    includeFolderPath: false,
    includeDates: false,
    includeTags: false,
    includeSummaries: true,
    maxItems: 100,
    maxDepth: 10,
    excerptLength: 2000,
  };
  const metadata = { one: { summary: 'S'.repeat(100) } };

  it('limits items, folder depth, and summary length to the saved values', () => {
    expect(buildAIContextPack(nodes, options, metadata).itemCount).toBe(3);
    expect(buildAIContextPack(nodes, { ...options, maxItems: 2 }, metadata).itemCount).toBe(2);

    const shallow = buildAIContextPack(nodes, { ...options, maxDepth: 1 }, metadata);
    expect(shallow.content).toContain('Pack Two');
    expect(shallow.content).not.toContain('Pack Deep');

    expect(buildAIContextPack(nodes, options, metadata).content).toContain(`Summary: ${'S'.repeat(100)}`);
    const short = buildAIContextPack(nodes, { ...options, excerptLength: 40 }, metadata);
    expect(short.content).toContain(`Summary: ${'S'.repeat(37)}...`);
  });
});

describe('context menu naming setting', () => {
  it('names bookmarks from the page title or the link URL when selected', () => {
    const info = {
      menuItemId: 'bookmark-scout',
      editable: false,
      pageUrl: 'https://e2e.invalid/page',
      linkUrl: 'https://e2e.invalid/linked',
      selectionText: 'Selected',
    };
    const tab = { title: 'Page Title' } as Browser.tabs.Tab;
    expect(getBookmarkTitle('link_text', info, tab)).toBe('Selected');
    expect(getBookmarkTitle('page_title', info, tab)).toBe('Page Title');
    expect(getBookmarkTitle('link_url', info, tab)).toBe('https://e2e.invalid/linked');
  });
});
