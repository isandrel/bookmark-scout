import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { BookmarkTreeNode } from '@/types';

const live = vi.hoisted(() => ({ titles: new Map<string, string>() }));

vi.mock('@/services/bookmarks', () => ({
  getBookmark: vi.fn(async (id: string) => {
    if (!live.titles.has(id)) throw new Error('Bookmark not found.');
    return { id, title: live.titles.get(id) };
  }),
  updateBookmark: vi.fn(async (id: string, changes: { title: string }) => {
    live.titles.set(id, changes.title);
    return { id, title: changes.title };
  }),
}));

const {
  applyMetadataTitles,
  decodeHtml,
  fetchBookmarkMetadata,
  isHtmlContentType,
  readHtmlHead,
  scanDeadLinks,
} = await import(
  '@/services/bookmark-network-tools'
);
const { WEB_HOST_ORIGINS, hasWebHostAccess, requestWebHostAccess } = await import(
  '@/services/web-host-access'
);

const deadLinkOptions = {
  requestTimeoutMs: 1000,
  concurrency: 2,
  retryCount: 0,
  followRedirects: true,
  successStatuses: [200, 204],
};

function tree(urls: Record<string, string>): BookmarkTreeNode[] {
  return [
    {
      id: 'root',
      title: 'Folder',
      children: Object.entries(urls).map(([id, url]) => ({ id, title: id, url })),
    },
  ];
}

function response(status: number, init: { redirectedTo?: string } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected: Boolean(init.redirectedTo),
    url: init.redirectedTo ?? '',
    body: { cancel: vi.fn(async () => undefined) },
  } as unknown as Response;
}

describe('web host access', () => {
  afterEach(() => {
    fakeBrowser.reset();
  });

  it('requests exactly the optional web origins and reports the user decision', async () => {
    const request = vi.fn(async () => true);
    fakeBrowser.permissions.request = request;
    await expect(requestWebHostAccess()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: WEB_HOST_ORIGINS });

    fakeBrowser.permissions.request = vi.fn(async () => false);
    await expect(requestWebHostAccess()).resolves.toBe(false);
  });

  it('treats a rejected or throwing request as denied', async () => {
    fakeBrowser.permissions.request = vi.fn(async () => {
      throw new Error('This function must be called during a user gesture');
    });
    await expect(requestWebHostAccess()).resolves.toBe(false);
    fakeBrowser.permissions.request = vi.fn(() => {
      throw new Error('unsupported');
    });
    await expect(requestWebHostAccess()).resolves.toBe(false);
  });

  it('checks the granted state without prompting', async () => {
    fakeBrowser.permissions.contains = vi.fn(async () => true);
    await expect(hasWebHostAccess()).resolves.toBe(true);
    fakeBrowser.permissions.contains = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(hasWebHostAccess()).resolves.toBe(false);
  });
});

describe('dead-link scanning', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries HEAD 405/501 with GET and never fetches non-web URLs', async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/405')) return response(init.method === 'HEAD' ? 405 : 200);
      if (url.endsWith('/501')) return response(init.method === 'HEAD' ? 501 : 404);
      return response(200);
    });
    const result = await scanDeadLinks(
      tree({
        a: 'https://e2e.invalid/405',
        b: 'https://e2e.invalid/501',
        c: 'javascript:void(0)',
        d: 'data:text/plain,hi',
        e: 'chrome://settings',
      }),
      deadLinkOptions,
    );
    expect(result.items.map((item) => [item.id, item.status, item.statusCode])).toEqual([
      ['a', 'ok', 200],
      ['b', 'error', 404],
      ['c', 'skipped', undefined],
      ['d', 'skipped', undefined],
      ['e', 'skipped', undefined],
    ]);
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'HEAD https://e2e.invalid/405',
      'HEAD https://e2e.invalid/501',
      'GET https://e2e.invalid/405',
      'GET https://e2e.invalid/501',
    ]);
  });

  it('reports redirects with their destination instead of HTTP 0', async () => {
    fetchMock.mockResolvedValue(response(200, { redirectedTo: 'https://e2e.invalid/new' }));
    for (const followRedirects of [true, false]) {
      const [item] = (
        await scanDeadLinks(tree({ a: 'https://e2e.invalid/old' }), {
          ...deadLinkOptions,
          followRedirects,
        })
      ).items;
      expect(item).toMatchObject({
        status: 'redirect',
        statusCode: 200,
        redirectUrl: 'https://e2e.invalid/new',
      });
    }
    expect(fetchMock.mock.calls.every(([, init]) => init.redirect === 'follow')).toBe(true);
  });

  it('classifies transport failures without leaking browser error text', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const [item] = (await scanDeadLinks(tree({ a: 'https://e2e.invalid/x' }), deadLinkOptions))
      .items;
    expect(item).toMatchObject({ status: 'error', errorKind: 'network' });
    expect(JSON.stringify(item)).not.toContain('Failed to fetch');
  });
});

/** A body that emits `chunks`, then either ends or stalls until the request is aborted. */
function streamedResponse(
  chunks: string[],
  { contentType = 'text/html', stall = false, signal }: {
    contentType?: string;
    stall?: boolean;
    signal?: AbortSignal | null;
  } = {},
) {
  const encoder = new TextEncoder();
  const state = { pulled: 0, cancelled: false };
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        const bytes = encoder.encode(chunks[index]);
        index += 1;
        state.pulled += bytes.byteLength;
        controller.enqueue(bytes);
        return;
      }
      if (!stall) {
        controller.close();
        return;
      }
      return new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => {
          controller.error(new DOMException('The operation was aborted.', 'AbortError'));
          resolve();
        });
      });
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return {
    state,
    response: new Response(body, { status: 200, headers: { 'content-type': contentType } }),
  };
}

describe('metadata fetching', () => {
  const fetchMock = vi.fn();
  const options = {
    overwriteTitles: true,
    fetchDescriptions: true,
    requestTimeoutMs: 50,
    concurrency: 1,
  };
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('times out when the body stalls after the headers arrive', async () => {
    fetchMock.mockImplementation(
      async (_url: string, init: RequestInit) =>
        streamedResponse(['<html><head><title>Part'], { stall: true, signal: init.signal })
          .response,
    );
    const started = Date.now();
    const result = await fetchBookmarkMetadata(tree({ a: 'https://e2e.invalid/stall' }), options);
    expect(result.items.map((item) => item.status)).toEqual(['timeout']);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('skips non-HTML responses without downloading them', async () => {
    const pdf = streamedResponse(['%PDF-1.7 ...'.repeat(1000)], {
      contentType: 'application/pdf',
    });
    fetchMock.mockResolvedValue(pdf.response);
    const [item] = (await fetchBookmarkMetadata(tree({ a: 'https://e2e.invalid/file.pdf' }), options))
      .items;
    expect(item).toMatchObject({ status: 'notHtml', statusCode: 200, changed: false });
    expect(pdf.state.cancelled).toBe(true);
    expect(isHtmlContentType('application/xhtml+xml; charset=utf-8')).toBe(true);
    expect(isHtmlContentType(null)).toBe(true);
    expect(isHtmlContentType('text/htmlx')).toBe(false);
  });

  it('stops reading at the end of the head or at the byte cap', async () => {
    const page = streamedResponse(['<head><title>T</title></he', 'ad><body>', 'x'.repeat(4096)]);
    const head = new TextDecoder().decode(await readHtmlHead(page.response, 1024 * 1024));
    expect(head).toBe('<head><title>T</title></head><body>');
    expect(page.state.cancelled).toBe(true);

    const endless = streamedResponse(Array.from({ length: 64 }, () => 'y'.repeat(1024)));
    const capped = await readHtmlHead(endless.response, 10 * 1024);
    expect(capped.byteLength).toBe(10 * 1024);
    expect(endless.state.pulled).toBeLessThan(64 * 1024);
  });
});

describe('metadata helpers', () => {
  it('decodes pages using the declared or sniffed charset', () => {
    const sjis = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]).buffer;
    expect(decodeHtml(sjis, 'text/html; charset=Shift_JIS')).toBe('日本語');
    const meta = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="shift_jis"><title>'),
      0x93,
      0xfa,
      ...new TextEncoder().encode('</title>'),
    ]).buffer;
    expect(decodeHtml(meta, 'text/html')).toContain('<title>日</title>');
    expect(decodeHtml(new TextEncoder().encode('é').buffer as ArrayBuffer, null)).toBe('é');
  });

  it('applies reviewed titles only to bookmarks unchanged since the scan', async () => {
    live.titles = new Map([
      ['1', 'Original'],
      ['2', 'Renamed later'],
    ]);
    await expect(
      applyMetadataTitles([
        { id: '1', title: 'Original', suggestedTitle: 'Suggested' },
        { id: '2', title: 'Original', suggestedTitle: 'Suggested' },
        { id: '3', title: 'Deleted', suggestedTitle: 'Suggested' },
      ]),
    ).resolves.toEqual({ updated: 1, skipped: 2, failed: 0 });
    expect(live.titles.get('1')).toBe('Suggested');
    expect(live.titles.get('2')).toBe('Renamed later');
  });
});
