import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const htmlConfig = readConfig(
  'network/html',
  z.strictObject({ head_max_bytes: z.number().int().positive() }),
);

const privacyConfig = readConfig(
  'privacy/detection',
  z.strictObject({
    fragment_token_params: z.array(z.string().min(1)),
    token_patterns: z.array(z.string().min(1)).min(1),
    ambiguous_token_prefixes: z.array(z.string().min(1)),
    asset_extensions: z.array(z.string().regex(/^[a-z0-9]+$/i)).min(1),
  }),
);

export type DeadLinkStatus = 'ok' | 'redirect' | 'error' | 'timeout' | 'invalid' | 'skipped';

/**
 * Transport failures carry no HTTP status; `network` covers refused, DNS, and CORS-blocked.
 * `redirect` means the server answered with a redirect that could not be followed, which is
 * almost always a redirect loop (too many redirects) or an unreachable redirect target.
 */
export type NetworkErrorKind = 'network' | 'timeout' | 'redirect';

/**
 * Why a link failed. Only `notFound`, `unreachable`, and `redirectLoop` confirm a dead link; the
 * others often work in a browser (sign-in walls, rate limits, bot protection, servers that reject
 * automated checks, temporary outages) and need a manual check before anything is removed.
 */
export type DeadLinkCategory =
  | 'notFound'
  | 'unreachable'
  | 'redirectLoop'
  | 'auth'
  | 'rateLimited'
  | 'methodRejected'
  | 'serverError'
  | 'httpError'
  | 'timeout';

const CONFIRMED_DEAD_CATEGORIES: ReadonlySet<DeadLinkCategory> = new Set([
  'notFound',
  'unreachable',
  'redirectLoop',
]);

/**
 * Failure categories of specific HTTP statuses. `methodRejected`: HEAD and the GET fallback
 * were both rejected, so the server refuses automated checks.
 */
const HTTP_FAILURE_CATEGORIES: ReadonlyMap<number, DeadLinkCategory> = new Map([
  [404, 'notFound'],
  [410, 'notFound'],
  [401, 'auth'],
  [403, 'auth'],
  [407, 'auth'],
  [429, 'rateLimited'],
  [405, 'methodRejected'],
  [501, 'methodRejected'],
]);

/** Statuses from here up are server errors when no specific category applies. */
const SERVER_ERROR_MIN_STATUS = 500;

/** Classifies a non-success HTTP status. A HEAD error has already been retried with GET. */
export function classifyHttpFailure(statusCode: number): DeadLinkCategory {
  return (
    HTTP_FAILURE_CATEGORIES.get(statusCode) ??
    (statusCode >= SERVER_ERROR_MIN_STATUS ? 'serverError' : 'httpError')
  );
}

const TRANSPORT_FAILURE_CATEGORIES: Record<NetworkErrorKind, DeadLinkCategory> = {
  network: 'unreachable',
  timeout: 'timeout',
  redirect: 'redirectLoop',
};

/** True only for failures that confirm a link is broken, not for ones that need a manual check. */
export function isConfirmedDeadLink(item: Pick<DeadLinkResultItem, 'category'>): boolean {
  return item.category !== undefined && CONFIRMED_DEAD_CATEGORIES.has(item.category);
}

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
  /** Set for `error` and `timeout` results. */
  category?: DeadLinkCategory;
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

const WEB_URL_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/** Only web URLs are requested; bookmarklets, data:, and browser-internal URLs are skipped. */
export function isWebUrl(url: string | URL): boolean {
  try {
    return WEB_URL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Decodes a percent-encoded URL component, or returns it unchanged when the encoding is broken.
 * `plusAsSpace` decodes `+` as a space, as in query strings.
 */
export function decodeUrlComponent(value: string, plusAsSpace = false): string {
  try {
    return decodeURIComponent(plusAsSpace ? value.replace(/\+/g, ' ') : value);
  } catch {
    return value;
  }
}

/**
 * Fetch reports a redirect loop exactly like a refused connection. After a transport failure,
 * one request with `redirect: 'manual'` tells them apart: an opaque redirect response means the
 * server did answer, with a redirect that could not be followed.
 */
export async function classifyFailure(
  error: unknown,
  url: string,
  timeoutMs: number,
): Promise<NetworkErrorKind> {
  if (error instanceof RequestTimeoutError) return 'timeout';
  try {
    const redirected = await requestWithTimeout(
      url,
      { method: 'GET', redirect: 'manual' },
      timeoutMs,
      async (response) => response.type === 'opaqueredirect',
    );
    return redirected ? 'redirect' : 'network';
  } catch {
    return 'network';
  }
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

    let lastError: unknown;
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
          ...(status === 'error' ? { category: classifyHttpFailure(response.status) } : {}),
        } satisfies DeadLinkResultItem;
      } catch (error) {
        lastError = error;
      }
    }

    const errorKind = await classifyFailure(lastError, url, options.requestTimeoutMs);
    const category = TRANSPORT_FAILURE_CATEGORIES[errorKind];
    return {
      ...base,
      status: errorKind === 'timeout' ? 'timeout' : 'error',
      errorKind,
      category,
    } satisfies DeadLinkResultItem;
  });

  return {
    scannedBookmarks: bookmarks.length,
    items,
  };
}

const CHARSET_PATTERN = /charset\s*=\s*["']?([A-Za-z0-9_\-:.]+)/i;
/** HTML requires a `<meta charset>` within the first 1024 bytes; twice that tolerates sloppy pages. */
const CHARSET_SNIFF_BYTES = 2048;

/** Decodes a page using the Content-Type charset, then a `<meta>` charset, then UTF-8. */
function decodeHtml(bytes: ArrayBuffer, contentType: string | null): string {
  const sniffed = new TextDecoder('latin1').decode(bytes.slice(0, CHARSET_SNIFF_BYTES));
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
      // Error pages ("404 Not Found") must never become title suggestions.
      const page = await fetchHtmlPage(url, {
        timeoutMs: options.requestTimeoutMs,
        maxBytes: METADATA_MAX_BYTES,
        until: 'head',
      });
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
      const errorKind = await classifyFailure(error, url, options.requestTimeoutMs);
      return errorKind === 'timeout'
        ? ({ ...base, status: 'timeout' } satisfies MetadataFetchResultItem)
        : ({ ...base, status: 'error', errorKind } satisfies MetadataFetchResultItem);
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
  const changes: BookmarkChange[] = items.flatMap(({ id, title, suggestedTitle }) =>
    suggestedTitle
      ? [{ kind: 'update', id, title, expect: { title }, set: { title: suggestedTitle } }]
      : [],
  );
  const { applied, skipped, failed } = await applyBookmarkChanges(changes);
  // Items without a suggestion have nothing to apply.
  return { updated: applied, skipped: skipped + items.length - changes.length, failed };
}

/** Tokens that sign in to OAuth flows or APIs even when the parameter name looks harmless. */
export const FRAGMENT_TOKEN_PARAMS: readonly string[] = privacyConfig.fragment_token_params;
const TOKEN_CANDIDATE_PATTERN = new RegExp(
  `(?:^|[^A-Za-z0-9_])(${privacyConfig.token_patterns.join('|')})`,
  'g',
);

/** Generated keys mix upper case, lower case, and digits; slugs rarely do. */
function looksGenerated(text: string): boolean {
  return /[A-Z]/.test(text) && /[a-z]/.test(text) && /\d/.test(text);
}

/**
 * True when a query or fragment value contains an API or access token. Some prefixes (`sk-`) are
 * also common in slugs (`sk-telecom-annual-report-2024`), so a match with one of them counts
 * only when the rest looks generated.
 */
export function containsTokenValue(value: string): boolean {
  return findTokenValues(value).length > 0;
}

/** The API or access tokens inside `value`, by the rules of {@link containsTokenValue}. */
export function findTokenValues(value: string): string[] {
  return [...value.matchAll(TOKEN_CANDIDATE_PATTERN)]
    .map(([, candidate]) => candidate)
    .filter((candidate) => {
      const prefix = privacyConfig.ambiguous_token_prefixes.find((item) =>
        candidate.startsWith(item),
      );
      return prefix === undefined || looksGenerated(candidate.slice(prefix.length));
    });
}
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@([A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,})/gi;
/** `logo@2x.png`-style asset names look like emails but are not. */
const RETINA_SUFFIX_PATTERN = /^\d+(?:\.\d+)?x\./i;
const ASSET_EXTENSION_PATTERN = new RegExp(
  `\\.(?:${privacyConfig.asset_extensions.join('|')})$`,
  'i',
);
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

const SEVERITY_RANK: Record<PrivacySeverity, number> = { low: 0, medium: 1, high: 2 };

/** How serious each finding is. */
const FINDING_SEVERITY: Record<PrivacyFinding['kind'], PrivacySeverity> = {
  sensitiveParam: 'high',
  sensitiveFragmentParam: 'high',
  tokenPattern: 'high',
  credentials: 'high',
  email: 'medium',
  fragment: 'low',
  uuid: 'low',
};

function findingSeverity(finding: PrivacyFinding): PrivacySeverity {
  // Credentials without a password are only a user name.
  if (finding.kind === 'credentials' && !finding.withPassword) return 'medium';
  return FINDING_SEVERITY[finding.kind];
}

/** Splits a fragment into route-style params (`#/cb?access_token=…`, `#access_token=…`). */
export function parseFragmentParams(hash: string): URLSearchParams | null {
  const fragment = hash.replace(/^#/, '');
  const queryStart = fragment.indexOf('?');
  if (queryStart >= 0) return new URLSearchParams(fragment.slice(queryStart + 1));
  if (fragment.includes('=') && !fragment.startsWith('/') && !fragment.startsWith('!/')) {
    return new URLSearchParams(fragment);
  }
  return null;
}

function containsEmail(text: string): boolean {
  return findEmailValues(text).length > 0;
}

/** Email-like values in `text`, skipping asset names such as `logo@2x.png`. */
export function findEmailValues(text: string): string[] {
  return [...text.matchAll(EMAIL_PATTERN)]
    .filter(
      (match) => !RETINA_SUFFIX_PATTERN.test(match[1]) && !ASSET_EXTENSION_PATTERN.test(match[1]),
    )
    .map((match) => match[0]);
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
        if (containsTokenValue(value)) add({ kind: 'tokenPattern' });
      });
    }

    if (options.scanFragments && parsed.hash) {
      const params = parseFragmentParams(parsed.hash);
      if (params) {
        params.forEach((value, key) => {
          if (fragmentSensitive.has(key.toLowerCase())) {
            add({ kind: 'sensitiveFragmentParam', param: key });
          }
          if (containsTokenValue(value)) add({ kind: 'tokenPattern' });
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
    const combinedText = `${decodeUrlComponent(withoutUserInfo.href, true)} ${titleText}`;

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
export async function requestWithTimeout<T>(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  consume: (response: Response) => Promise<T>,
  fetch: typeof globalThis.fetch = globalThis.fetch,
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
export const METADATA_MAX_BYTES = htmlConfig.head_max_bytes;
const HEAD_END_PATTERN = /<\/head\s*>|<body[\s>]/i;
const HTML_CONTENT_TYPE_PATTERN = /^\s*(?:text\/html|application\/xhtml\+xml)\s*(?:;|$)/i;

/** True when a Content-Type is missing (sniffed later) or declares an HTML document. */
function isHtmlContentType(contentType: string | null): boolean {
  return !contentType?.trim() || HTML_CONTENT_TYPE_PATTERN.test(contentType);
}

export type HtmlPage = {
  /** HTTP status of the final response. */
  status: number;
  ok: boolean;
  /** The URL after redirects. */
  url: string;
  /** The decoded page; null for error statuses and non-HTML files, which are not downloaded. */
  html: string | null;
};

export type FetchHtmlPageOptions = {
  /** Covers the headers and the body, so a page that stalls mid-download cannot hang a tool. */
  timeoutMs: number;
  /** Bytes read at most. */
  maxBytes: number;
  /** `head` stops at the end of `<head>` (or the start of `<body>`); `end` reads the whole page. */
  until: 'head' | 'end';
  /** A page whose final URL (after redirects) fails this is not downloaded; `html` is null. */
  allowUrl?: (url: string) => boolean;
  /** Defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
};

/**
 * Downloads a web page without cookies, following redirects, and decodes it by its declared
 * charset. Throws on a timeout (see {@link classifyFailure}) and on network failures.
 */
export function fetchHtmlPage(url: string, options: FetchHtmlPageOptions): Promise<HtmlPage> {
  return requestWithTimeout(
    url,
    { method: 'GET', redirect: 'follow' },
    options.timeoutMs,
    async (response) => {
      const page = { status: response.status, ok: response.ok, url: response.url || url };
      const contentType = response.headers.get('content-type');
      const allowed = options.allowUrl?.(page.url) ?? true;
      if (!response.ok || !allowed || !isHtmlContentType(contentType)) {
        return { ...page, html: null };
      }
      const stopAt = options.until === 'head' ? HEAD_END_PATTERN : undefined;
      const bytes = await readResponseBytes(response, options.maxBytes, stopAt);
      return { ...page, html: decodeHtml(bytes, contentType) };
    },
    options.fetch,
  );
}

/**
 * Reads a body up to `maxBytes`, or until `stopAt` matches the text read so far, then stops the
 * download.
 */
async function readResponseBytes(
  response: Response,
  maxBytes: number,
  stopAt?: RegExp,
): Promise<ArrayBuffer> {
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
      if (stopAt) {
        const text = tail + scanner.decode(chunk);
        if (stopAt.test(text)) break;
        tail = text.slice(-16);
      }
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

export async function mapWithConcurrency<T, R>(
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
