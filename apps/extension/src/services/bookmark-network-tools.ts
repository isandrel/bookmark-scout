import type { BookmarkTreeNode } from '@/types';

export type DeadLinkStatus = 'ok' | 'redirect' | 'error' | 'timeout' | 'invalid' | 'skipped';

/** Transport failures carry no HTTP status; `network` covers refused, DNS, and CORS-blocked. */
export type NetworkErrorKind = 'network' | 'timeout';

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

export type MetadataFetchStatus = 'ok' | 'httpError' | 'error' | 'timeout' | 'skipped';

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

/**
 * Checks reachability with HEAD and falls back to a GET (body discarded) when the server
 * rejects HEAD with 405 or 501. Redirects are always followed so the final URL is known:
 * fetch's `redirect: 'manual'` yields an opaque response that hides both the status and the
 * Location header, which previously surfaced as "HTTP 0".
 */
async function probeUrl(url: string, timeoutMs: number): Promise<Response> {
  const head = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' }, timeoutMs);
  if (head.status !== 405 && head.status !== 501) {
    return head;
  }
  const get = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' }, timeoutMs);
  await get.body?.cancel().catch(() => undefined);
  return get;
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
      const response = await fetchWithTimeout(
        url,
        { method: 'GET', redirect: 'follow' },
        options.requestTimeoutMs,
      );
      if (!response.ok) {
        // Error pages ("404 Not Found") must never become title suggestions.
        await response.body?.cancel().catch(() => undefined);
        return {
          ...base,
          status: 'httpError',
          statusCode: response.status,
        } satisfies MetadataFetchResultItem;
      }

      const html = decodeHtml(await response.arrayBuffer(), response.headers.get('content-type'));
      const doc = new DOMParser().parseFromString(html, 'text/html');
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
        statusCode: response.status,
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

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new RequestTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
