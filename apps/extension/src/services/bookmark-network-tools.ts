import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';
import type { BookmarkTreeNode } from '@/types';

const htmlConfig = readConfig(
  'network/html',
  z.strictObject({
    head_max_bytes: z.number().int().positive(),
    stop_pattern_overlap_chars: z.number().int().positive(),
    max_redirects: boundedNumber({ integer: true }),
    redirect_guesses: boundedNumber({ integer: true }),
  }),
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
 * `redirectElsewhere`: a redirect that could not be followed while the scan had access only to
 * the bookmarks' own sites, so it may lead to another site rather than loop.
 */
export type DeadLinkCategory =
  | 'notFound'
  | 'unreachable'
  | 'redirectLoop'
  | 'redirectElsewhere'
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

const deadLinkConfig = readConfig(
  'network/dead-links',
  z.strictObject({
    status_categories: z.strictObject({
      not_found: z.array(httpStatusCodeSchema),
      auth: z.array(httpStatusCodeSchema),
      rate_limited: z.array(httpStatusCodeSchema),
      method_rejected: z.array(httpStatusCodeSchema),
    }),
  }),
);

const retryAfterConfig = readConfig(
  'network/retry-after',
  z.strictObject({
    statuses: z.array(httpStatusCodeSchema),
    max_ms: boundedNumber({ integer: true }),
  }),
);

/** Busy statuses whose Retry-After a tool waits for, up to `RETRY_AFTER_MAX_MS`. */
const RETRY_AFTER_STATUSES: ReadonlySet<number> = new Set(retryAfterConfig.statuses);
const RETRY_AFTER_MAX_MS = retryAfterConfig.max_ms;

/** Whether `status` says the site is busy for now (`statuses` in `config/network/retry-after.toml`). */
export function isBusyStatus(status: number): boolean {
  return RETRY_AFTER_STATUSES.has(status);
}

/**
 * How long to wait before asking a busy site again, in ms: its Retry-After when `status` is a busy
 * one and the wait is readable and at most `max_ms` (`config/network/retry-after.toml`); undefined
 * when the tool should report the answer now instead. Check Dead Links and Index Page Text share it.
 */
export function busyRetryWait(
  status: number,
  retryAfter: string | null,
  now: number,
): number | undefined {
  if (!isBusyStatus(status)) return undefined;
  const wait = parseRetryAfter(retryAfter, now);
  return wait !== undefined && wait <= RETRY_AFTER_MAX_MS ? wait : undefined;
}

/** Waits `ms`, or throws {@link RequestAbortedError} as soon as `signal` stops the check. */
export function waitUnlessStopped(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RequestAbortedError());
      return;
    }
    const stop = () => {
      clearTimeout(timer);
      reject(new RequestAbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

/** Failure categories of specific HTTP statuses (config/network/dead-links.toml). */
const HTTP_FAILURE_CATEGORIES: ReadonlyMap<number, DeadLinkCategory> = new Map(
  (
    [
      ['not_found', 'notFound'],
      ['auth', 'auth'],
      ['rate_limited', 'rateLimited'],
      ['method_rejected', 'methodRejected'],
    ] as const
  ).flatMap(([key, category]) =>
    deadLinkConfig.status_categories[key].map((status) => [status, category] as const),
  ),
);

/** Classifies a non-success HTTP status. A HEAD error has already been retried with GET. */
export function classifyHttpFailure(statusCode: number): DeadLinkCategory {
  return (
    HTTP_FAILURE_CATEGORIES.get(statusCode) ??
    (statusCode >= HTTP_STATUS.serverErrorMin ? 'serverError' : 'httpError')
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

export type PrivacySeverity = 'low' | 'medium' | 'high';

export type PrivacyFinding =
  | { kind: 'sensitiveParam'; param: string }
  | { kind: 'sensitiveFragmentParam'; param: string }
  | { kind: 'credentials'; withPassword: boolean }
  | { kind: 'tokenPattern' }
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

/** Deletes the flagged bookmarks the review left on Delete, each only while its address is the same. */
export function getPrivacyRemovals(items: readonly PrivacyScanItem[]): BookmarkChange[] {
  return items.map((item) => ({
    kind: 'remove',
    id: item.id,
    title: item.title,
    expect: { url: item.url },
  }));
}

export type DeadLinkOptions = {
  requestTimeoutMs: number;
  concurrency: number;
  retryCount: number;
  followRedirects: boolean;
  successStatuses: number[];
  /**
   * False when the scan may request only the bookmarks' own sites (`lib/site-access.ts`): a
   * redirect to another site is then blocked, and cannot be told from a redirect loop.
   */
  allSitesAccess?: boolean;
};

export type MetadataOptions = {
  overwriteTitles: boolean;
  fetchDescriptions: boolean;
  requestTimeoutMs: number;
  concurrency: number;
};

export type PrivacyScanOptions = {
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

/**
 * The caller stopped the request (a paused or cancelled job): never a finding about the link,
 * never retried, and never classified as a timeout or network failure.
 */
export class RequestAbortedError extends Error {
  constructor() {
    super('Request stopped');
    this.name = 'RequestAbortedError';
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
  signal?: AbortSignal,
): Promise<NetworkErrorKind> {
  if (error instanceof RequestTimeoutError) return 'timeout';
  try {
    const redirected = await requestWithTimeout(
      url,
      { method: 'GET', redirect: 'manual' },
      timeoutMs,
      async (response) => response.type === 'opaqueredirect',
      undefined,
      signal,
    );
    return redirected ? 'redirect' : 'network';
  } catch (classifyError) {
    if (classifyError instanceof RequestAbortedError) throw classifyError;
    return 'network';
  }
}

type ProbeResult = Pick<Response, 'status' | 'redirected' | 'url'> & {
  /** The response's Retry-After header, if any. */
  retryAfter: string | null;
};

/**
 * Checks reachability with HEAD and falls back to a GET (body discarded) whenever HEAD returns
 * an error status: many servers and CDNs answer HEAD with 400, 403, 404, 405, or 501 while
 * serving the page normally. Redirects are always followed so the final URL is known:
 * fetch's `redirect: 'manual'` yields an opaque response that hides both the status and the
 * Location header, which previously surfaced as "HTTP 0".
 */
async function probeUrl(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const summarize = async ({ status, redirected, url: finalUrl, headers }: Response) => ({
    status,
    redirected,
    url: finalUrl,
    retryAfter: headers.get('retry-after'),
  });
  const head = await requestWithTimeout(
    url,
    { method: 'HEAD', redirect: 'follow' },
    timeoutMs,
    summarize,
    undefined,
    signal,
  );
  if (!isHttpErrorStatus(head.status)) {
    return head;
  }
  return requestWithTimeout(
    url,
    { method: 'GET', redirect: 'follow' },
    timeoutMs,
    summarize,
    undefined,
    signal,
  );
}

/** One bookmark a network tool checks: what its result reports about it. */
export type LinkTarget = Pick<DeadLinkResultItem, 'id' | 'title' | 'url' | 'folderPath'>;

/**
 * Checks one bookmark's link. With `signal` aborted it throws {@link RequestAbortedError} at the
 * next request or retry, so a stopped check is never reported as a dead link.
 */
export async function checkDeadLink(
  base: LinkTarget,
  options: DeadLinkOptions,
  signal?: AbortSignal,
): Promise<DeadLinkResultItem> {
  const { url } = base;
  try {
    new URL(url);
  } catch {
    return { ...base, status: 'invalid' };
  }
  if (!isWebUrl(url)) {
    return { ...base, status: 'skipped' };
  }
  const successStatuses = new Set(options.successStatuses);

  let lastError: unknown;
  for (let attempt = 0; attempt <= options.retryCount; attempt += 1) {
    if (signal?.aborted) throw new RequestAbortedError();
    try {
      const response = await probeUrl(url, options.requestTimeoutMs, signal);
      const redirectUrl = response.redirected ? response.url : undefined;
      let status: DeadLinkStatus;
      if (redirectUrl && !options.followRedirects) {
        // Redirects are findings rather than successes when "follow redirects" is off.
        status = 'redirect';
      } else if (successStatuses.has(response.status)) {
        status = redirectUrl ? 'redirect' : 'ok';
      } else {
        status = 'error';
        // A busy site that says when to come back, soon enough, is asked again then.
        const wait = busyRetryWait(response.status, response.retryAfter, Date.now());
        if (attempt < options.retryCount && wait !== undefined) {
          await waitUnlessStopped(wait, signal);
          continue;
        }
      }
      return {
        ...base,
        status,
        statusCode: response.status,
        ...(redirectUrl ? { redirectUrl } : {}),
        ...(status === 'error' ? { category: classifyHttpFailure(response.status) } : {}),
      };
    } catch (error) {
      if (error instanceof RequestAbortedError) throw error;
      lastError = error;
    }
  }

  const errorKind = await classifyFailure(lastError, url, options.requestTimeoutMs, signal);
  const category =
    errorKind === 'redirect' && options.allSitesAccess === false
      ? 'redirectElsewhere'
      : TRANSPORT_FAILURE_CATEGORIES[errorKind];
  return {
    ...base,
    status: errorKind === 'timeout' ? 'timeout' : 'error',
    errorKind,
    category,
  };
}

/** The bookmarks a dead-link check reads in `nodes`, as targets, in tree order. */
export function linkTargets(nodes: BookmarkTreeNode[]): LinkTarget[] {
  return flattenBookmarks(nodes)
    .filter((bookmark) => Boolean(bookmark.node.url))
    .map((bookmark) => ({
      id: bookmark.node.id,
      title: bookmark.node.title,
      url: bookmark.node.url ?? '',
      folderPath: bookmark.pathLabel,
    }));
}

export async function scanDeadLinks(
  nodes: BookmarkTreeNode[],
  options: DeadLinkOptions,
): Promise<DeadLinkScanResult> {
  const targets = linkTargets(nodes);
  const items = await mapWithConcurrency(targets, options.concurrency, (target) =>
    checkDeadLink(target, options),
  );
  return { scannedBookmarks: targets.length, items };
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

/**
 * Fetches one bookmark's page head and suggests its title. `readHead` parses the HTML (a page
 * parses it itself; a service worker, which has no DOM parser, asks the AI host page). With
 * `signal` aborted it throws {@link RequestAbortedError}, so a stopped fetch is never a result.
 */
export async function fetchMetadataItem(
  base: LinkTarget,
  options: MetadataOptions,
  readHead: (html: string) => HtmlHead | Promise<HtmlHead>,
  signal?: AbortSignal,
): Promise<MetadataFetchResultItem> {
  const { url } = base;
  const item = { ...base, changed: false };
  if (!isWebUrl(url)) return { ...item, status: 'skipped' };
  let page: Awaited<ReturnType<typeof fetchHtmlPage>>;
  try {
    // Error pages ("404 Not Found") must never become title suggestions.
    page = await fetchHtmlPage(url, {
      timeoutMs: options.requestTimeoutMs,
      maxBytes: METADATA_MAX_BYTES,
      until: 'head',
      signal,
    });
  } catch (error) {
    if (error instanceof RequestAbortedError) throw error;
    const errorKind = await classifyFailure(error, url, options.requestTimeoutMs, signal);
    return errorKind === 'timeout'
      ? { ...item, status: 'timeout' }
      : { ...item, status: 'error', errorKind };
  }
  if (!page.ok) return { ...item, status: 'httpError', statusCode: page.status };
  if (page.html === null) return { ...item, status: 'notHtml', statusCode: page.status };
  // Outside the page's errors: a parser that fails (the AI host page gone) is thrown to the
  // caller, never reported as something wrong with this page.
  const { title: suggestedTitle, description } = await readHead(page.html);
  const changed = Boolean(
    (options.overwriteTitles || !base.title) && suggestedTitle && suggestedTitle !== base.title,
  );
  return {
    ...item,
    status: 'ok',
    statusCode: page.status,
    suggestedTitle,
    description: options.fetchDescriptions ? description : undefined,
    changed,
  };
}

export async function fetchBookmarkMetadata(
  nodes: BookmarkTreeNode[],
  options: MetadataOptions,
): Promise<MetadataFetchResult> {
  const targets = linkTargets(nodes);
  const items = await mapWithConcurrency(targets, options.concurrency, (target) =>
    fetchMetadataItem(target, options, (html) => readHtmlHead(html, options.fetchDescriptions)),
  );
  return { scannedBookmarks: targets.length, items };
}

/**
 * The title changes reviewed suggestions make. Each applies only while the bookmark keeps the
 * scanned title, so a stale suggestion never overwrites the user's newer title; items without a
 * suggestion make no change.
 */
export function getMetadataTitleChanges(
  items: ReadonlyArray<Pick<MetadataFetchResultItem, 'id' | 'title' | 'suggestedTitle'>>,
): BookmarkChange[] {
  return items.flatMap(({ id, title, suggestedTitle }) =>
    suggestedTitle
      ? [{ kind: 'update', id, title, expect: { title }, set: { title: suggestedTitle } }]
      : [],
  );
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
  options: PrivacyScanOptions,
): PrivacyScanResult {
  const sensitive = createParamNameMatcher(options.sensitiveParams);
  const fragmentSensitive = createParamNameMatcher([
    ...options.sensitiveParams,
    ...FRAGMENT_TOKEN_PARAMS,
  ]);
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
        if (sensitive(key)) {
          add({ kind: 'sensitiveParam', param: key });
        }
        if (containsTokenValue(value)) add({ kind: 'tokenPattern' });
      });
    }

    if (options.scanFragments && parsed.hash) {
      const params = parseFragmentParams(parsed.hash);
      if (params) {
        params.forEach((value, key) => {
          if (fragmentSensitive(key)) {
            add({ kind: 'sensitiveFragmentParam', param: key });
          }
          if (containsTokenValue(value)) add({ kind: 'tokenPattern' });
        });
      } else if (containsTokenValue(decodeUrlComponent(parsed.hash.slice(1)))) {
        // Anchors and app routes (`#section`, `#inbox`, `#/settings`) are ordinary; only a
        // fragment holding a known key or token format is flagged.
        add({ kind: 'tokenPattern' });
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
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new RequestAbortedError();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // The caller's stop aborts the same request, and is told apart from the timeout below.
  const stop = () => controller.abort();
  signal?.addEventListener('abort', stop, { once: true });
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
    if (signal?.aborted) throw new RequestAbortedError();
    if (controller.signal.aborted) {
      throw new RequestTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', stop);
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

/**
 * Why a page checked address by address (`allowUrl`) was not read: `hidden`, a redirect whose
 * target the browser does not show; `refused`, an address `allowUrl` refused; `tooMany`, more
 * redirects than `max_redirects`.
 */
export type PageStop = 'hidden' | 'refused' | 'tooMany';

export type HtmlPage = {
  /** HTTP status of the last response; `HTTP_STATUS.opaque` when nothing was requested. */
  status: number;
  ok: boolean;
  /** The last URL requested: the URL after redirects. */
  url: string;
  /** The decoded page; null for error statuses and non-HTML files, which are not downloaded. */
  html: string | null;
  /** Set when the page was not read because of where it is or where it redirects. */
  stopped?: PageStop;
  /** Set when the page was read from another address than the one asked for (`url`). */
  readFrom?: string;
  /** The answer's Retry-After header, when it has one (a busy site says when to ask again). */
  retryAfter?: string;
};

export type FetchHtmlPageOptions = {
  /** Covers the headers and the body, so a page that stalls mid-download cannot hang a tool. */
  timeoutMs: number;
  /** Bytes read at most. */
  maxBytes: number;
  /** `head` stops at the end of `<head>` (or the start of `<body>`); `end` reads the whole page. */
  until: 'head' | 'end';
  /**
   * Checks every address before it is requested, the first one and each redirect's target, so a
   * refused address is never contacted. Without it, redirects are followed as the browser does.
   */
  allowUrl?: (url: string) => boolean | Promise<boolean>;
  /** Defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Stops the download; it then throws {@link RequestAbortedError}. */
  signal?: AbortSignal;
};

/** Redirects a read checked address by address follows at most (config/network/html.toml). */
export const MAX_PAGE_REDIRECTS = htmlConfig.max_redirects;

/** Likely redirect targets tried at most when a redirect's own target is hidden (same file). */
export const MAX_REDIRECT_GUESSES = htmlConfig.redirect_guesses;

const HTTP_PROTOCOL = 'http:';
const HTTPS_PROTOCOL = 'https:';

/**
 * Where a page that redirects most likely leads, best first, never the address itself: its
 * `https:` address (an `http:` page without a port), then its host with `www.` added (to a
 * registrable domain) or removed, on the same registrable domain, over `https:` and, for an
 * `http:` page, over `http:`. These are the redirects most sites answer with.
 */
export function redirectGuesses(url: string): string[] {
  let page: URL;
  try {
    page = new URL(url);
  } catch {
    return [];
  }
  const guesses: string[] = [];
  const add = (protocol: string, hostname: string) => {
    const guess = new URL(page.href);
    guess.protocol = protocol;
    guess.hostname = hostname;
    if (guess.href !== page.href && !guesses.includes(guess.href)) guesses.push(guess.href);
  };
  const isHttp = page.protocol === HTTP_PROTOCOL;
  if (isHttp && !page.port) add(HTTPS_PROTOCOL, page.hostname);
  const domain = getRegistrableDomain(page.hostname);
  const other = otherWwwHost(page.hostname);
  const hasWww = withoutWww(page.hostname) !== page.hostname;
  if ((hasWww || page.hostname === domain) && getRegistrableDomain(other) === domain) {
    if (!page.port) add(HTTPS_PROTOCOL, other);
    if (isHttp) add(HTTP_PROTOCOL, other);
  }
  return guesses;
}

/** The absolute address a redirect's Location header names, or null when it names none. */
function redirectTarget(response: Response, url: string): string | null {
  const location = response.headers.get('location');
  if (!location) return null;
  try {
    return new URL(location, url).href;
  } catch {
    return null;
  }
}

/** Reads a response that is not a redirect to follow: the page, unless it is not HTML. */
async function readPage(
  response: Response,
  url: string,
  options: FetchHtmlPageOptions,
): Promise<HtmlPage> {
  const retryAfter = response.headers.get('retry-after');
  const page = {
    status: response.status,
    ok: response.ok,
    url: response.url || url,
    ...(retryAfter ? { retryAfter } : {}),
  };
  const contentType = response.headers.get('content-type');
  if (!response.ok || !isHtmlContentType(contentType)) return { ...page, html: null };
  const stopAt = options.until === 'head' ? HEAD_END_PATTERN : undefined;
  const bytes = await readResponseBytes(response, options.maxBytes, stopAt);
  return { ...page, html: decodeHtml(bytes, contentType) };
}

/**
 * Downloads a web page without cookies and decodes it by its declared charset. Throws on a
 * timeout (see {@link classifyFailure}) and on network failures.
 *
 * With `allowUrl`, redirects are followed by hand (`redirect: 'manual'`), each target checked
 * before it is requested. Chrome and Firefox both answer such a request from an extension page
 * or worker with an opaque redirect (status 0, no Location header; measured on 2026-10-22 in
 * Chromium's service worker and pages with host access, and in a Firefox extension page), so
 * there the target cannot be checked and is never requested: the page is reported
 * `stopped: 'hidden'`, the `redirect: 'error'` outcome told apart from a network failure. Where
 * the Location header is readable (another runtime, or a browser that one day shows it to
 * extensions), each target is checked and at most `max_redirects` are followed. The timeout
 * covers every request of one page together.
 *
 * A hidden redirect is usually the site's move to `https:` or to its other `www.` host, so
 * before reporting it the read tries at most `redirect_guesses` of those addresses
 * (`redirectGuesses`), each checked with `allowUrl` before it is requested and requested by hand
 * too, so a guess that redirects again is a wrong guess, never followed. The first that answers
 * with an HTML page is read, with `readFrom` set to it.
 */
export async function fetchHtmlPage(url: string, options: FetchHtmlPageOptions): Promise<HtmlPage> {
  const { allowUrl } = options;
  if (!allowUrl) {
    return requestWithTimeout(
      url,
      { method: 'GET', redirect: 'follow' },
      options.timeoutMs,
      (response) => readPage(response, url, options),
      options.fetch,
      options.signal,
    );
  }
  const deadline = Date.now() + options.timeoutMs;
  let current = url;
  // What a refused address reports: nothing requested yet, or the redirect that pointed to it.
  let previous: Omit<HtmlPage, 'html'> = { status: HTTP_STATUS.opaque, ok: false, url };
  for (let redirects = 0; ; redirects += 1) {
    if (!(await allowUrl(current))) return { ...previous, html: null, stopped: 'refused' };
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new RequestTimeoutError();
    const requested = current;
    const step = await requestWithTimeout(
      requested,
      { method: 'GET', redirect: 'manual' },
      remainingMs,
      async (response): Promise<HtmlPage | { next: string; status: number }> => {
        if (response.type !== 'opaqueredirect' && !isRedirectStatus(response.status)) {
          return readPage(response, requested, options);
        }
        const next = redirectTarget(response, requested);
        if (next) return { next, status: response.status };
        return {
          status: response.status,
          ok: false,
          url: requested,
          html: null,
          stopped: 'hidden',
        };
      },
      options.fetch,
      options.signal,
    );
    if (!('next' in step)) {
      if (step.stopped !== 'hidden')
        return requested === url ? step : { ...step, readFrom: requested };
      return (await readRedirectGuess(requested, deadline, allowUrl, options)) ?? step;
    }
    previous = { status: step.status, ok: false, url: requested };
    if (redirects >= MAX_PAGE_REDIRECTS) return { ...previous, html: null, stopped: 'tooMany' };
    current = step.next;
  }
}

/**
 * Tries the likely targets of `from`'s hidden redirect (`redirectGuesses`), at most
 * `MAX_REDIRECT_GUESSES` requests and within `deadline`: the first that answers with an HTML page
 * without redirecting, as read from that address, or undefined when none does.
 */
async function readRedirectGuess(
  from: string,
  deadline: number,
  allowUrl: NonNullable<FetchHtmlPageOptions['allowUrl']>,
  options: FetchHtmlPageOptions,
): Promise<HtmlPage | undefined> {
  let requests = 0;
  for (const guess of redirectGuesses(from)) {
    if (requests >= MAX_REDIRECT_GUESSES) return undefined;
    if (!(await allowUrl(guess))) continue;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return undefined;
    requests += 1;
    try {
      const page = await requestWithTimeout(
        guess,
        { method: 'GET', redirect: 'manual' },
        remainingMs,
        async (response) =>
          response.type === 'opaqueredirect' || isRedirectStatus(response.status)
            ? null
            : readPage(response, guess, options),
        options.fetch,
        options.signal,
      );
      if (page?.ok && page.html !== null) return { ...page, readFrom: guess };
    } catch (error) {
      if (error instanceof RequestAbortedError) throw error;
      // An address that does not answer is a wrong guess; the next one is tried.
    }
  }
  return undefined;
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
        tail = text.slice(-htmlConfig.stop_pattern_overlap_chars);
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
