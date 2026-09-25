import type { BookmarkTreeNode } from '@/types';

export type DeadLinkStatus = 'ok' | 'redirect' | 'error' | 'timeout' | 'invalid' | 'skipped';

/**
 * Transport failures carry no HTTP status; `network` covers refused, DNS, and CORS-blocked.
 * `redirect` means the server answered with a redirect that could not be followed, which is
 * almost always a redirect loop (too many redirects) or an unreachable redirect target.
 */
export type NetworkErrorKind = 'network' | 'timeout' | 'redirect';

export type DeadLinkResultItem = {
  id: string;
  /** Raw bookmark title; the view localizes empty titles. */
  title: string;
  url: string;
  folderPath: string;
  status: DeadLinkStatus;
  statusCode?: number;
  /** Final URL when the request was redirected. */
  redirectUrl?: string;
  errorKind?: NetworkErrorKind;
};

export type DeadLinkScanResult = {
  scannedBookmarks: number;
  items: DeadLinkResultItem[];
};

/** `notHtml` marks responses (PDFs, images, archives) that are not downloaded or parsed. */
export type MetadataFetchStatus = 'ok' | 'httpError' | 'error' | 'timeout' | 'skipped' | 'notHtml';

export type MetadataFetchResultItem = {
  id: string;
  /** Raw bookmark title at scan time; the apply step checks it has not changed since. */
  title: string;
  url: string;
  folderPath: string;
  status: MetadataFetchStatus;
  statusCode?: number;
  suggestedTitle?: string;
  description?: string;
  /** True when a suggested title differs from the bookmark's title and may be applied. */
  changed: boolean;
  errorKind?: NetworkErrorKind;
};

export type MetadataFetchResult = {
  scannedBookmarks: number;
  items: MetadataFetchResultItem[];
};

export type MetadataApplyResult = {
  updated: number;
  /** Bookmarks deleted or renamed since the scan; they are left untouched. */
  skipped: number;
  failed: number;
};

export type PrivacySeverity = 'low' | 'medium' | 'high';

export type PrivacyFinding =
  | { kind: 'sensitiveParam'; param: string }
  | { kind: 'sensitiveFragmentParam'; param: string }
  | { kind: 'credentials'; withPassword: boolean }
  | { kind: 'tokenPattern' }
  | { kind: 'fragment' }
  | { kind: 'email' }
  | { kind: 'uuid' };

export type PrivacyScanItem = {
  id: string;
  title: string;
  url: string;
  folderPath: string;
  severity: PrivacySeverity;
  findings: PrivacyFinding[];
};

export type PrivacyScanResult = {
  scannedBookmarks: number;
  items: PrivacyScanItem[];
};

type DeadLinkOptions = {
  requestTimeoutMs: number;
  concurrency: number;
  retryCount: number;
  followRedirects: boolean;
  successStatuses: number[];
};

type MetadataOptions = {
  overwriteTitles: boolean;
  fetchDescriptions: boolean;
  requestTimeoutMs: number;
  concurrency: number;
};

type PrivacyOptions = {
  scanTitles: boolean;
  scanQueryParams: boolean;
  scanFragments: boolean;
  sensitiveParams: string[];
  emailDetection: boolean;
  uuidDetection: boolean;
};

class RequestTimeoutError extends Error {
  constructor() {
    super('Request timed out');
    this.name = 'RequestTimeoutError';
  }
}

/** Only web URLs are requested; bookmarklets, data:, and browser-internal URLs are skipped. */
export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function toErrorKind(error: unknown): NetworkErrorKind {
  return error instanceof RequestTimeoutError ? 'timeout' : 'network';
}

type ProbeResult = Pick<Response, 'status' | 'redirected' | 'url'>;

/**
 * Checks reachability with HEAD and falls back to a GET (body discarded) whenever HEAD returns
 * an error status: many servers and CDNs answer HEAD with 400, 403, 404, 405, or 501 while
 * serving the page normally. Redirects are always followed so the final URL is known:
 * fetch's `redirect: 'manual'` yields an opaque response that hides both the status and the
 * Location header, which previously surfaced as "HTTP 0".
 */
async function probeUrl(url: string, timeoutMs: number): Promise<ProbeResult> {
  const summarize = async ({ status, redirected, url: finalUrl }: Response) => ({
    status,
    redirected,
    url: finalUrl,
  });
  const head = await requestWithTimeout(
    url,
    { method: 'HEAD', redirect: 'follow' },
    timeoutMs,
    summarize,
  );
  if (head.status < 400) {
    return head;
  }
  return requestWithTimeout(url, { method: 'GET', redirect: 'follow' }, timeoutMs, summarize);
}

export async function scanDeadLinks(
  nodes: BookmarkTreeNode[],
  options: DeadLinkOptions,
): Promise<DeadLinkScanResult> {
  const bookmarks = flattenBookmarks(nodes).filter((bookmark) => Boolean(bookmark.node.url));
  const successStatuses = new Set(options.successStatuses);

  const items = await mapWithConcurrency(bookmarks, options.concurrency, async (bookmark) => {
    const url = bookmark.node.url ?? '';
    const base = {
      id: bookmark.node.id,
      title: bookmark.node.title,
      url,
      folderPath: bookmark.pathLabel,
    };

    try {
      new URL(url);
    } catch {
      return { ...base, status: 'invalid' } satisfies DeadLinkResultItem;
    }
    if (!isWebUrl(url)) {
      return { ...base, status: 'skipped' } satisfies DeadLinkResultItem;
    }

    let errorKind: NetworkErrorKind = 'network';
    for (let attempt = 0; attempt <= options.retryCount; attempt += 1) {
      try {
        const response = await probeUrl(url, options.requestTimeoutMs);
        const redirectUrl = response.redirected ? response.url : undefined;
        let status: DeadLinkStatus;
        if (redirectUrl && !options.followRedirects) {
          // Redirects are findings rather than successes when "follow redirects" is off.
          status = 'redirect';
        } else if (successStatuses.has(response.status)) {
          status = redirectUrl ? 'redirect' : 'ok';
        } else {
          status = 'error';
        }
        return {
          ...base,
          status,
          statusCode: response.status,
          ...(redirectUrl ? { redirectUrl } : {}),
        } satisfies DeadLinkResultItem;
      } catch (error) {
        errorKind = toErrorKind(error);
      }
    }

    return {
      ...base,
      status: errorKind === 'timeout' ? 'timeout' : 'error',
      errorKind,
    } satisfies DeadLinkResultItem;
  });

  return {
    scannedBookmarks: bookmarks.length,
    items,
  };
}

const CHARSET_PATTERN = /charset\s*=\s*["']?([A-Za-z0-9_\-:.]+)/i;

/** Decodes a page using the Content-Type charset, then a `<meta>` charset, then UTF-8. */
export function decodeHtml(bytes: ArrayBuffer, contentType: string | null): string {
  const sniffed = new TextDecoder('latin1').decode(bytes.slice(0, 2048));
  const charset =
    contentType?.match(CHARSET_PATTERN)?.[1] ??
    sniffed.match(/<meta[^>]+charset\s*=\s*["']?([A-Za-z0-9_\-:.]+)/i)?.[1];
  if (charset) {
    try {
      return new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      // Unknown labels fall back to UTF-8 below.
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export async function fetchBookmarkMetadata(
  nodes: BookmarkTreeNode[],
  options: MetadataOptions,
): Promise<MetadataFetchResult> {
  const bookmarks = flattenBookmarks(nodes).filter((bookmark) => Boolean(bookmark.node.url));

  const items = await mapWithConcurrency(bookmarks, options.concurrency, async (bookmark) => {
    const url = bookmark.node.url ?? '';
    const base = {
      id: bookmark.node.id,
      title: bookmark.node.title,
      url,
      folderPath: bookmark.pathLabel,
      changed: false,
    };
    if (!isWebUrl(url)) {
      return { ...base, status: 'skipped' } satisfies MetadataFetchResultItem;
    }

    try {
      const page = await requestWithTimeout(
        url,
        { method: 'GET', redirect: 'follow' },
        options.requestTimeoutMs,
        async (response) => {
          const contentType = response.headers.get('content-type');
          // Error pages ("404 Not Found") must never become title suggestions, and files such
          // as PDFs or archives are never downloaded.
          if (!response.ok || !isHtmlContentType(contentType)) {
            return { status: response.status, ok: response.ok, html: null };
          }
          const bytes = await readHtmlHead(response, METADATA_MAX_BYTES);
          return { status: response.status, ok: true, html: decodeHtml(bytes, contentType) };
        },
      );
      if (!page.ok) {
        return {
          ...base,
          status: 'httpError',
          statusCode: page.status,
        } satisfies MetadataFetchResultItem;
      }
      if (page.html === null) {
        return {
          ...base,
          status: 'notHtml',
          statusCode: page.status,
        } satisfies MetadataFetchResultItem;
      }

      const doc = new DOMParser().parseFromString(page.html, 'text/html');
      const suggestedTitle =
        doc.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
      const description = options.fetchDescriptions
        ? doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
          undefined
        : undefined;
      const changed = Boolean(
        (options.overwriteTitles || !bookmark.node.title) &&
          suggestedTitle &&
          suggestedTitle !== bookmark.node.title,
      );

      return {
        ...base,
        status: 'ok',
        statusCode: page.status,
        suggestedTitle,
        description,
        changed,
      } satisfies MetadataFetchResultItem;
    } catch (error) {
      return {
        ...base,
        status: toErrorKind(error) === 'timeout' ? 'timeout' : 'error',
      } satisfies MetadataFetchResultItem;
    }
  });

  return {
    scannedBookmarks: bookmarks.length,
    items,
  };
}

/**
 * Applies reviewed title suggestions. A bookmark renamed or deleted since the scan is skipped
 * so a stale suggestion never overwrites the user's newer title.
 */
export async function applyMetadataTitles(
  items: Array<Pick<MetadataFetchResultItem, 'id' | 'title' | 'suggestedTitle'>>,
): Promise<MetadataApplyResult> {
  const result: MetadataApplyResult = { updated: 0, skipped: 0, failed: 0 };
  for (const item of items) {
    if (!item.suggestedTitle) {
      result.skipped += 1;
      continue;
    }
    let currentTitle: string | undefined;
    try {
      currentTitle = (await getBookmark(item.id)).title;
    } catch {
      currentTitle = undefined;
    }
    if (currentTitle !== item.title) {
      result.skipped += 1;
      continue;
    }
    try {
      await updateBookmark(item.id, { title: item.suggestedTitle });
      result.updated += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

/** Tokens that sign in to OAuth flows or APIs even when the parameter name looks harmless. */
const FRAGMENT_TOKEN_PARAMS = ['access_token', 'id_token', 'refresh_token', 'token', 'code'];
const TOKEN_VALUE_PATTERN =
  /(?:^|[^A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,})/;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@([A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,})/gi;
/** `logo@2x.png`-style asset names look like emails but are not. */
const RETINA_SUFFIX_PATTERN = /^\d+(?:\.\d+)?x\./i;
const ASSET_EXTENSION_PATTERN = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|bmp|css|js|mjs|json|html?)$/i;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

const SEVERITY_RANK: Record<PrivacySeverity, number> = { low: 0, medium: 1, high: 2 };

function findingSeverity(finding: PrivacyFinding): PrivacySeverity {
  switch (finding.kind) {
    case 'sensitiveParam':
    case 'sensitiveFragmentParam':
    case 'tokenPattern':
      return 'high';
    case 'credentials':
      return finding.withPassword ? 'high' : 'medium';
    case 'email':
      return 'medium';
    default:
      return 'low';
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/** Splits a fragment into route-style params (`#/cb?access_token=…`, `#access_token=…`). */
function fragmentParams(hash: string): URLSearchParams | null {
  const fragment = hash.replace(/^#/, '');
  const queryStart = fragment.indexOf('?');
  if (queryStart >= 0) return new URLSearchParams(fragment.slice(queryStart + 1));
  if (fragment.includes('=') && !fragment.startsWith('/') && !fragment.startsWith('!/')) {
    return new URLSearchParams(fragment);
  }
  return null;
}

function containsEmail(text: string): boolean {
  return [...text.matchAll(EMAIL_PATTERN)].some(
    (match) => !RETINA_SUFFIX_PATTERN.test(match[1]) && !ASSET_EXTENSION_PATTERN.test(match[1]),
  );
}

export function scanBookmarkPrivacy(
  nodes: BookmarkTreeNode[],
  options: PrivacyOptions,
): PrivacyScanResult {
  const sensitiveParams = new Set(options.sensitiveParams.map((item) => item.toLowerCase()));
  const fragmentSensitive = new Set([...sensitiveParams, ...FRAGMENT_TOKEN_PARAMS]);
  const bookmarks = flattenBookmarks(nodes).filter((bookmark) => Boolean(bookmark.node.url));

  const items = bookmarks.flatMap((bookmark) => {
    const url = bookmark.node.url ?? '';
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return [];
    }
    const findings: PrivacyFinding[] = [];
    const add = (finding: PrivacyFinding) => {
      const key = JSON.stringify(finding);
      if (!findings.some((existing) => JSON.stringify(existing) === key)) findings.push(finding);
    };

    if (parsed.username || parsed.password) {
      add({ kind: 'credentials', withPassword: Boolean(parsed.password) });
    }

    if (options.scanQueryParams) {
      parsed.searchParams.forEach((value, key) => {
        if (sensitiveParams.has(key.toLowerCase())) {
          add({ kind: 'sensitiveParam', param: key });
        }
        if (TOKEN_VALUE_PATTERN.test(value)) add({ kind: 'tokenPattern' });
      });
      if (TOKEN_VALUE_PATTERN.test(safeDecode(parsed.pathname))) add({ kind: 'tokenPattern' });
    }

    if (options.scanFragments && parsed.hash) {
      const params = fragmentParams(parsed.hash);
      if (params) {
        params.forEach((value, key) => {
          if (fragmentSensitive.has(key.toLowerCase())) {
            add({ kind: 'sensitiveFragmentParam', param: key });
          }
          if (TOKEN_VALUE_PATTERN.test(value)) add({ kind: 'tokenPattern' });
        });
      } else if (!/^#!?\//.test(parsed.hash)) {
        // A plain in-page anchor is a weak signal; SPA routes (`#/path`) are not flagged.
        add({ kind: 'fragment' });
      }
    }

    // Userinfo is reported as credentials, so it must not also read as an email address.
    const withoutUserInfo = new URL(url);
    withoutUserInfo.username = '';
    withoutUserInfo.password = '';
    const titleText = options.scanTitles ? bookmark.node.title : '';
    const combinedText = `${safeDecode(withoutUserInfo.href)} ${titleText}`;

    if (options.emailDetection && containsEmail(combinedText)) {
      add({ kind: 'email' });
    }
    if (options.uuidDetection && UUID_PATTERN.test(combinedText)) {
      add({ kind: 'uuid' });
    }

    if (findings.length === 0) {
      return [];
    }

    const severity = findings
      .map(findingSeverity)
      .reduce((highest, current) =>
        SEVERITY_RANK[current] > SEVERITY_RANK[highest] ? current : highest,
      );
    return [
      {
        id: bookmark.node.id,
        title: bookmark.node.title,
        url,
        folderPath: bookmark.pathLabel,
        severity,
        findings,
      } satisfies PrivacyScanItem,
    ];
  });

  return {
    scannedBookmarks: bookmarks.length,
    items,
  };
}

/**
 * Runs one request whose timeout covers both the response headers and `consume`, so a server
 * that stalls mid-body cannot hang a scan. Any body `consume` leaves unread is cancelled.
 */
async function requestWithTimeout<T>(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response | undefined;

  try {
    response = await fetch(input, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    return await consume(response);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new RequestTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (response?.body && !response.body.locked) {
      response.body.cancel().catch(() => undefined);
    }
  }
}

/** Upper bound on bytes read from one page; titles and descriptions live in the `<head>`. */
const METADATA_MAX_BYTES = 512 * 1024;
const HEAD_END_PATTERN = /<\/head\s*>|<body[\s>]/i;
const HTML_CONTENT_TYPE_PATTERN = /^\s*(?:text\/html|application\/xhtml\+xml)\s*(?:;|$)/i;

/** True when a Content-Type is missing (sniffed later) or declares an HTML document. */
export function isHtmlContentType(contentType: string | null): boolean {
  return !contentType?.trim() || HTML_CONTENT_TYPE_PATTERN.test(contentType);
}

/**
 * Reads a page body only until the end of its `<head>` (or `<body>` start) or `maxBytes`,
 * whichever comes first, then stops the download.
 */
export async function readHtmlHead(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  const scanner = new TextDecoder('latin1');
  let total = 0;
  let tail = '';

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, maxBytes - total);
      chunks.push(chunk);
      total += chunk.byteLength;
      const text = tail + scanner.decode(chunk);
      if (HEAD_END_PATTERN.test(text)) break;
      tail = text.slice(-16);
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let index = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
  return results;
}
