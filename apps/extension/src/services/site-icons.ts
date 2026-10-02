/**
 * Refresh Site Icons: downloads each bookmarked website's own icon so bookmarks show it even
 * when the browser's icon cache has none (or, in Firefox, has no extension API at all).
 *
 * For every distinct origin in scope it reads the `<head>` of one bookmarked page, picks an
 * icon the page declares, and falls back to `/favicon.ico`. Requests go only to the bookmarked
 * website (the page follows the site's redirects; icon files must be on the bookmark's own
 * registrable domain) and never to a third-party icon service. Nothing is stored until the user
 * reviews the results and saves them.
 */
import type { BookmarkTreeNode } from '@/types';

export type SiteIconRel = 'icon' | 'apple-touch-icon';

export type SiteIconCandidate = {
  /** Absolute http(s) URL of the icon file. */
  url: string;
  rel: SiteIconRel;
  /** Lower-cased `type` attribute, or '' when missing. */
  type: string;
  /** Pixel sizes from the `sizes` attribute, `'any'` for scalable icons, or null when missing. */
  sizes: number[] | 'any' | null;
};

/** Why a downloaded file was not used as an icon. */
export type SiteIconRejection = 'tooLarge' | 'notImage';

export type SiteIconStatus = 'updated' | 'unchanged' | 'noIcon' | 'failed';

export type SiteIconResultItem = {
  origin: string;
  /** The bookmarked page whose `<head>` was read. */
  pageUrl: string;
  /** Bookmarks in scope that share this origin. */
  bookmarkCount: number;
  status: SiteIconStatus;
  /** The downloaded icon as a data URL, for `updated` and `unchanged`. */
  icon?: string;
  /** Where the icon was downloaded from. */
  iconUrl?: string;
  /** For `noIcon`: why the last icon file that answered was not used. */
  rejection?: SiteIconRejection;
  /** For `failed`: the page could not be loaded. */
  errorKind?: NetworkErrorKind;
  /** For `failed` and `noIcon`: an icon from an earlier refresh stays in use. */
  keepsCachedIcon?: boolean;
};

export type SiteIconRefreshResult = {
  /** Bookmarks in scope, including skipped ones. */
  scannedBookmarks: number;
  /** Bookmarks that are not web links (bookmarklets, data:, browser pages); never requested. */
  skippedBookmarks: number;
  items: SiteIconResultItem[];
};

export type SiteIconRefreshOptions = {
  /** Icon size in pixels to prefer when a page lists several. */
  preferredSize: number;
  /** Icon files larger than this are not used. */
  maxIconBytes: number;
  requestTimeoutMs: number;
  concurrency: number;
};

/**
 * Icon files tried per origin, best first, before `/favicon.ico`. It bounds the requests one
 * site can cause when it lists many broken icons.
 */
const MAX_DECLARED_ICON_ATTEMPTS = 3;
const PREFERRED_ICON_TYPES = new Set(['png', 'svg', 'ico']);
/** Apple touch icons without `sizes` are 180px by convention. */
const APPLE_TOUCH_ICON_DEFAULT_SIZE = 180;
/** Distance score for an icon without `sizes`: worse than an exact match, better than 2x off. */
const UNKNOWN_SIZE_DISTANCE = 0.75;

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const codePoint =
        entity[1] === 'x' || entity[1] === 'X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const TAG_ATTRIBUTE_PATTERN = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(TAG_ATTRIBUTE_PATTERN)) {
    const name = match[1].toLowerCase();
    // The first occurrence wins, as in an HTML parser.
    if (attributes.has(name)) continue;
    attributes.set(name, decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attributes;
}

/** Resolves `href` against `base`; null unless the result is an http(s) URL. */
function resolveWebUrl(href: string, base: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function parseSizes(value: string | undefined): number[] | 'any' | null {
  if (value === undefined) return null;
  const tokens = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.includes('any')) return 'any';
  const sizes = tokens.flatMap((token) => {
    const match = /^(\d+)x(\d+)$/.exec(token);
    if (!match) return [];
    const size = Math.max(Number(match[1]), Number(match[2]));
    return size > 0 ? [size] : [];
  });
  return sizes.length ? sizes : null;
}

function relOf(value: string | undefined): SiteIconRel | null {
  const tokens = (value ?? '').toLowerCase().split(/\s+/);
  if (tokens.includes('icon')) return 'icon';
  if (tokens.includes('apple-touch-icon') || tokens.includes('apple-touch-icon-precomposed')) {
    return 'apple-touch-icon';
  }
  return null;
}

/**
 * Icon links declared in a page's HTML, in document order. Relative URLs resolve against the
 * first `<base href>` (itself resolved against `pageUrl`), comments are ignored, and only
 * http(s) icons are kept. `mask-icon` and other rel values are not icons.
 */
export function parseIconCandidates(html: string, pageUrl: string): SiteIconCandidate[] {
  // Comments are matched as tokens and skipped, so tags inside them are never read.
  const tags = [...html.matchAll(/<!--[\s\S]*?(?:-->|$)|<(base|link)\b([^>]*)>/gi)].flatMap(
    (match) => (match[1] ? [{ name: match[1].toLowerCase(), attributes: match[2] }] : []),
  );
  let base = pageUrl;
  const baseTag = tags.find((tag) => tag.name === 'base');
  if (baseTag) {
    const href = parseAttributes(baseTag.attributes).get('href');
    const resolved = href === undefined ? null : resolveWebUrl(href, pageUrl);
    if (resolved) base = resolved;
  }

  const candidates: SiteIconCandidate[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (tag.name !== 'link') continue;
    const attributes = parseAttributes(tag.attributes);
    const rel = relOf(attributes.get('rel'));
    if (!rel) continue;
    const url = resolveWebUrl(attributes.get('href') ?? '', base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    candidates.push({
      url,
      rel,
      type: (attributes.get('type') ?? '').trim().toLowerCase(),
      sizes: parseSizes(attributes.get('sizes')),
    });
  }
  return candidates;
}

const TYPE_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/gif': 'gif',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

/** The icon's format from its `type` attribute, else its file extension; '' when unknown. */
export function iconFormat(candidate: Pick<SiteIconCandidate, 'url' | 'type'>): string {
  if (candidate.type) return TYPE_BY_MIME[candidate.type] ?? candidate.type;
  const extension = /\.([a-z0-9]+)$/i.exec(new URL(candidate.url).pathname)?.[1]?.toLowerCase();
  if (!extension) return '';
  return extension === 'jpg' ? 'jpeg' : extension;
}

function sizeDistance(size: number, preferredSize: number): number {
  // Downscaling a larger icon looks better than upscaling a smaller one.
  return size >= preferredSize
    ? (size - preferredSize) / preferredSize
    : (2 * (preferredSize - size)) / preferredSize;
}

/** Lower is better: distance from the preferred size, plus a penalty for uncommon formats. */
export function scoreIconCandidate(candidate: SiteIconCandidate, preferredSize: number): number {
  const format = iconFormat(candidate);
  let distance: number;
  if (candidate.sizes === 'any' || format === 'svg') {
    distance = 0;
  } else if (candidate.sizes) {
    distance = Math.min(...candidate.sizes.map((size) => sizeDistance(size, preferredSize)));
  } else if (candidate.rel === 'apple-touch-icon') {
    distance = sizeDistance(APPLE_TOUCH_ICON_DEFAULT_SIZE, preferredSize);
  } else {
    distance = UNKNOWN_SIZE_DISTANCE;
  }
  return distance + (PREFERRED_ICON_TYPES.has(format) ? 0 : 1);
}

/** Candidates best first; ties keep document order. */
export function rankIconCandidates(
  candidates: SiteIconCandidate[],
  preferredSize: number,
): SiteIconCandidate[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreIconCandidate(candidate, preferredSize),
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ candidate }) => candidate);
}

/** Whether an icon URL is on the bookmark's own site (same registrable domain). */
export function isSameSiteIconUrl(iconUrl: string, bookmarkUrl: string): boolean {
  const bookmarkHost = getUrlHostname(bookmarkUrl);
  const iconHost = getUrlHostname(iconUrl);
  if (!bookmarkHost || !iconHost) return false;
  return hostnameMatchesDomain(iconHost, getRegistrableDomain(bookmarkHost));
}

/**
 * The URLs to try for an origin, best first: up to {@link MAX_DECLARED_ICON_ATTEMPTS} same-site
 * icons the page declares, then the origin's `/favicon.ico`.
 */
export function selectIconUrls(
  candidates: SiteIconCandidate[],
  bookmarkUrl: string,
  preferredSize: number,
): string[] {
  const declared = rankIconCandidates(
    candidates.filter((candidate) => isSameSiteIconUrl(candidate.url, bookmarkUrl)),
    preferredSize,
  )
    .slice(0, MAX_DECLARED_ICON_ATTEMPTS)
    .map((candidate) => candidate.url);
  const fallback = new URL('/favicon.ico', bookmarkUrl).href;
  return declared.includes(fallback) ? declared : [...declared, fallback];
}

function startsWithBytes(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

/**
 * The image type a file really is, from its first bytes; null for anything else (an HTML error
 * page served as `image/png`, for example). SVG must start with markup that opens `<svg`.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWithBytes(bytes, [0x00, 0x00, 0x01, 0x00])) return 'image/x-icon';
  if (startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWithBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  if (startsWithBytes(bytes, [0x42, 0x4d])) return 'image/bmp';
  let text = new TextDecoder('utf-8').decode(bytes.subarray(0, 1024)).replace(/^\ufeff/, '');
  // Skip a leading XML declaration, comments, and doctype one token at a time.
  const prolog = /^\s*(?:<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)/i;
  for (let match = prolog.exec(text); match; match = prolog.exec(text)) {
    text = text.slice(match[0].length);
  }
  return /^\s*<svg[\s>]/i.test(text) ? 'image/svg+xml' : null;
}

export function isImageContentType(contentType: string | null): boolean {
  return /^\s*image\/[a-z0-9.+-]+\s*(?:;|$)/i.test(contentType ?? '');
}

export function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/** Reads at most `maxBytes`; null when the body is longer, and the download is stopped. */
export async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) return null;
      chunks.push(value);
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
  return bytes;
}

type IconDownload = { icon: string } | { rejection: SiteIconRejection } | { missing: true };

/** Downloads one icon file under the byte cap and checks that it really is an image. */
async function downloadIcon(
  iconUrl: string,
  options: Pick<SiteIconRefreshOptions, 'maxIconBytes' | 'requestTimeoutMs'>,
): Promise<IconDownload> {
  try {
    return await requestWithTimeout(
      iconUrl,
      { method: 'GET', redirect: 'follow' },
      options.requestTimeoutMs,
      async (response): Promise<IconDownload> => {
        if (!response.ok) return { missing: true };
        if (!isImageContentType(response.headers.get('content-type'))) {
          return { rejection: 'notImage' };
        }
        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > options.maxIconBytes) {
          return { rejection: 'tooLarge' };
        }
        const bytes = await readBodyWithLimit(response, options.maxIconBytes);
        if (!bytes) return { rejection: 'tooLarge' };
        const mimeType = bytes.byteLength ? sniffImageType(bytes) : null;
        return mimeType ? { icon: toDataUrl(bytes, mimeType) } : { rejection: 'notImage' };
      },
    );
  } catch {
    return { missing: true };
  }
}

type PageHead = { finalUrl: string; html: string | null };

/** Loads the page's `<head>`; error pages and non-HTML responses yield no HTML. */
async function loadPageHead(pageUrl: string, timeoutMs: number): Promise<PageHead> {
  return requestWithTimeout(
    pageUrl,
    { method: 'GET', redirect: 'follow' },
    timeoutMs,
    async (response) => {
      const finalUrl = response.url || pageUrl;
      const contentType = response.headers.get('content-type');
      if (!response.ok || !isHtmlContentType(contentType)) return { finalUrl, html: null };
      const bytes = await readHtmlHead(response, METADATA_MAX_BYTES);
      return { finalUrl, html: decodeHtml(bytes, contentType) };
    },
  );
}

type OriginGroup = { origin: string; pageUrl: string; bookmarkCount: number };

/** Groups web bookmarks by origin, keeping the first bookmarked page of each. */
export function groupBookmarksByOrigin(nodes: BookmarkTreeNode[]): {
  groups: OriginGroup[];
  scannedBookmarks: number;
  skippedBookmarks: number;
} {
  const bookmarks = flattenBookmarks(nodes).filter((bookmark) => Boolean(bookmark.node.url));
  const groups = new Map<string, OriginGroup>();
  let skippedBookmarks = 0;
  for (const bookmark of bookmarks) {
    const url = bookmark.node.url ?? '';
    const origin = isWebUrl(url) ? getSiteIconOrigin(url) : null;
    if (!origin) {
      skippedBookmarks += 1;
      continue;
    }
    const group = groups.get(origin);
    if (group) group.bookmarkCount += 1;
    else groups.set(origin, { origin, pageUrl: url, bookmarkCount: 1 });
  }
  return { groups: [...groups.values()], scannedBookmarks: bookmarks.length, skippedBookmarks };
}

async function refreshOrigin(
  group: OriginGroup,
  options: SiteIconRefreshOptions,
  cachedIcon: string | undefined,
): Promise<SiteIconResultItem> {
  const keepsCachedIcon = Boolean(cachedIcon);
  let page: PageHead;
  try {
    page = await loadPageHead(group.pageUrl, options.requestTimeoutMs);
  } catch (error) {
    const errorKind = await classifyFailure(error, group.pageUrl, options.requestTimeoutMs);
    return { ...group, status: 'failed', errorKind, keepsCachedIcon };
  }

  const candidates = page.html ? parseIconCandidates(page.html, page.finalUrl) : [];
  let rejection: SiteIconRejection | undefined;
  for (const iconUrl of selectIconUrls(candidates, group.pageUrl, options.preferredSize)) {
    const download = await downloadIcon(iconUrl, options);
    if ('icon' in download) {
      return {
        ...group,
        status: download.icon === cachedIcon ? 'unchanged' : 'updated',
        icon: download.icon,
        iconUrl,
      };
    }
    if ('rejection' in download) rejection = download.rejection;
  }
  return { ...group, status: 'noIcon', keepsCachedIcon, ...(rejection ? { rejection } : {}) };
}

/**
 * Downloads one icon per origin in scope. `cachedIcons` (by origin) tells new icons from
 * unchanged ones. Nothing is stored; save the reviewed result with `saveSiteIcons`.
 */
export async function refreshSiteIcons(
  nodes: BookmarkTreeNode[],
  options: SiteIconRefreshOptions,
  cachedIcons: Record<string, string> = {},
): Promise<SiteIconRefreshResult> {
  const { groups, scannedBookmarks, skippedBookmarks } = groupBookmarksByOrigin(nodes);
  const items = await mapWithConcurrency(groups, options.concurrency, (group) =>
    refreshOrigin(group, options, cachedIcons[group.origin]),
  );
  return { scannedBookmarks, skippedBookmarks, items };
}

/** Icons from a reviewed refresh that should be stored, by origin. */
export function getSavableSiteIcons(result: SiteIconRefreshResult): Record<string, string> {
  return Object.fromEntries(
    result.items.flatMap((item) =>
      item.icon && (item.status === 'updated' || item.status === 'unchanged')
        ? [[item.origin, item.icon]]
        : [],
    ),
  );
}
