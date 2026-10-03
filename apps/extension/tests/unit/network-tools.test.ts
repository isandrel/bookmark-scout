import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkTreeNode } from '@/types';
import {
  fetchBookmarkMetadata,
  fetchHtmlPage,
  isConfirmedDeadLink,
  scanDeadLinks,
} from '@/services/bookmark-network-tools';

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

  it('retries any HEAD error status with GET before declaring a link dead', async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      const headStatus = Number(url.split('/').pop());
      if (init.method === 'HEAD') return response(headStatus);
      return response(url.endsWith('/404') ? 404 : 200);
    });
    const result = await scanDeadLinks(
      tree({
        a: 'https://e2e.invalid/400',
        b: 'https://e2e.invalid/403',
        c: 'https://e2e.invalid/404',
        d: 'https://e2e.invalid/200',
      }),
      { ...deadLinkOptions, concurrency: 1 },
    );
    expect(result.items.map((item) => [item.id, item.status, item.statusCode])).toEqual([
      ['a', 'ok', 200],
      ['b', 'ok', 200],
      ['c', 'error', 404],
      ['d', 'ok', 200],
    ]);
    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'HEAD https://e2e.invalid/400',
      'GET https://e2e.invalid/400',
      'HEAD https://e2e.invalid/403',
      'GET https://e2e.invalid/403',
      'HEAD https://e2e.invalid/404',
      'GET https://e2e.invalid/404',
      'HEAD https://e2e.invalid/200',
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

  it('classifies auth, rate-limit, HEAD-unsupported, and server errors apart from confirmed dead links', async () => {
    fetchMock.mockImplementation(async (url: string) => response(Number(url.split('/').pop())));
    const statuses = [404, 410, 401, 403, 407, 429, 405, 501, 500, 503, 400, 418];
    const { items } = await scanDeadLinks(
      tree(
        Object.fromEntries(
          statuses.map((status) => [`status-${status}`, `https://e2e.invalid/${status}`]),
        ),
      ),
      deadLinkOptions,
    );
    expect(items.map((item) => [item.statusCode, item.category, isConfirmedDeadLink(item)])).toEqual([
      [404, 'notFound', true],
      [410, 'notFound', true],
      [401, 'auth', false],
      [403, 'auth', false],
      [407, 'auth', false],
      [429, 'rateLimited', false],
      [405, 'methodRejected', false],
      [501, 'methodRejected', false],
      [500, 'serverError', false],
      [503, 'serverError', false],
      [400, 'httpError', false],
      [418, 'httpError', false],
    ]);
  });

  it('confirms refused connections and redirect loops as dead but not timeouts or successes', async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith('/ok')) return response(200);
      if (url.endsWith('/moved')) return response(200, { redirectedTo: 'https://e2e.invalid/ok' });
      if (url.endsWith('/loop') && init.redirect === 'manual') {
        return { type: 'opaqueredirect', status: 0, body: null } as unknown as Response;
      }
      if (url.endsWith('/slow')) {
        return new Promise((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
        );
      }
      throw new TypeError('Failed to fetch');
    });
    const { items } = await scanDeadLinks(
      tree({
        refused: 'https://e2e.invalid/refused',
        loop: 'https://e2e.invalid/loop',
        slow: 'https://e2e.invalid/slow',
        ok: 'https://e2e.invalid/ok',
        moved: 'https://e2e.invalid/moved',
      }),
      { ...deadLinkOptions, requestTimeoutMs: 50, concurrency: 5 },
    );
    expect(items.map((item) => [item.id, item.category, isConfirmedDeadLink(item)])).toEqual([
      ['refused', 'unreachable', true],
      ['loop', 'redirectLoop', true],
      ['slow', 'timeout', false],
      ['ok', undefined, false],
      ['moved', undefined, false],
    ]);
  });

  it('reports a redirect loop separately from a refused connection', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      if (init.redirect === 'manual') {
        return { type: 'opaqueredirect', status: 0, body: null } as unknown as Response;
      }
      throw new TypeError('Failed to fetch');
    });
    const [item] = (await scanDeadLinks(tree({ a: 'https://e2e.invalid/loop' }), deadLinkOptions))
      .items;
    expect(item).toMatchObject({ status: 'error', errorKind: 'redirect' });
    expect(item.statusCode).toBeUndefined();
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
  });
});

describe('fetchHtmlPage', () => {
  const page = (response: Response) => vi.fn(async () => response);
  const options = { timeoutMs: 1000, maxBytes: 1024 * 1024, until: 'head' as const };

  it('stops reading at the end of the head, or at the byte cap', async () => {
    const head = streamedResponse(['<head><title>T</title></he', 'ad><body>', 'x'.repeat(4096)]);
    const result = await fetchHtmlPage('https://e2e.invalid/', {
      ...options,
      fetch: page(head.response),
    });
    expect(result).toEqual({
      status: 200,
      ok: true,
      url: 'https://e2e.invalid/',
      html: '<head><title>T</title></head><body>',
    });
    expect(head.state.cancelled).toBe(true);

    const endless = streamedResponse(Array.from({ length: 64 }, () => 'y'.repeat(1024)));
    const capped = await fetchHtmlPage('https://e2e.invalid/', {
      ...options,
      maxBytes: 10 * 1024,
      until: 'end',
      fetch: page(endless.response),
    });
    expect(capped.html).toHaveLength(10 * 1024);
    expect(endless.state.pulled).toBeLessThan(64 * 1024);
  });

  it('reads the whole page until its end when asked to', async () => {
    const full = streamedResponse(['<head></head><body>', 'text', '</body>']);
    const result = await fetchHtmlPage('https://e2e.invalid/', {
      ...options,
      until: 'end',
      fetch: page(full.response),
    });
    expect(result.html).toBe('<head></head><body>text</body>');
  });

  it.each([
    ['application/xhtml+xml; charset=utf-8', true],
    ['', true],
    ['text/htmlx', false],
    ['application/pdf', false],
  ])('treats Content-Type %j as HTML: %s', async (contentType, isHtml) => {
    const response = streamedResponse(['<title>T</title>'], { contentType });
    if (!contentType) response.response.headers.delete('content-type');
    const result = await fetchHtmlPage('https://e2e.invalid/', {
      ...options,
      fetch: page(response.response),
    });
    expect(result.html !== null).toBe(isHtml);
  });

  it('does not download error pages or pages the caller refuses after redirects', async () => {
    const missing = new Response('<title>404 Not Found</title>', { status: 404 });
    await expect(
      fetchHtmlPage('https://e2e.invalid/', { ...options, fetch: page(missing) }),
    ).resolves.toMatchObject({ status: 404, ok: false, html: null });

    const redirected = streamedResponse(['<title>Router</title>']);
    Object.defineProperty(redirected.response, 'url', { value: 'http://192.168.0.1/' });
    const refused = await fetchHtmlPage('https://e2e.invalid/', {
      ...options,
      allowUrl: (url) => !url.includes('192.168.'),
      fetch: page(redirected.response),
    });
    expect(refused).toMatchObject({ url: 'http://192.168.0.1/', html: null });
    expect(redirected.state.cancelled).toBe(true);
  });

  it('decodes pages using the declared or sniffed charset', async () => {
    const bytes = (...parts: Array<string | number[]>) =>
      new Uint8Array(
        parts.flatMap((part) =>
          typeof part === 'string' ? [...new TextEncoder().encode(part)] : part,
        ),
      );
    const decode = async (body: Uint8Array, contentType: string) =>
      (
        await fetchHtmlPage('https://e2e.invalid/', {
          ...options,
          until: 'end',
          fetch: page(new Response(body, { headers: { 'content-type': contentType } })),
        })
      ).html;

    expect(await decode(bytes([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]), 'text/html; charset=Shift_JIS')).toBe(
      '日本語',
    );
    expect(
      await decode(bytes('<meta charset="shift_jis"><title>', [0x93, 0xfa], '</title>'), 'text/html'),
    ).toContain('<title>日</title>');
    expect(await decode(bytes('é'), 'text/html')).toBe('é');
  });

  it('times out when the body stalls after the headers arrive', async () => {
    const fetch = vi.fn(
      async (_url: string, init?: RequestInit) =>
        streamedResponse(['<html><head><title>Part'], { stall: true, signal: init?.signal })
          .response,
    );
    await expect(
      fetchHtmlPage('https://e2e.invalid/', { ...options, timeoutMs: 50, fetch }),
    ).rejects.toThrow('Request timed out');
  });
});
