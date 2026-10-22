/**
 * Fetch Covers: reads the `<head>` of each bookmarked page a run covers, takes the preview image
 * the page names for itself (Open Graph, Twitter card), and downloads it only from a site the
 * user gave access to, never through a thumbnail service. The image is checked by its first
 * bytes, decoded, shrunk, and re-encoded, so what is stored is a plain picture, never the file the
 * site sent. Nothing is stored until the review saves it (`cover-store.ts`).
 */
import type { BookmarkTreeNode } from '@/types';

export type CoverScanStatus = 'found' | 'none' | 'elsewhere' | 'failed' | 'current' | 'skipped';

export type CoverScanItem = {
  id: string;
  title: string;
  url: string;
  folderPath: string;
  status: CoverScanStatus;
  /** For `found`: the shrunk image to store, and a data URL of it for the review. */
  cover?: CoverImage;
  preview?: string;
  /** For `elsewhere`: the site the page's image is on, which the run has no access to. */
  imageSite?: string;
};

export type CoverScanResult = { items: CoverScanItem[] };

export type CoverScanOptions = {
  /** Width of the stored copy; larger images are shrunk to it. */
  widthPx: number;
  /** Image files larger than this are not downloaded. */
  maxImageBytes: number;
  /** Skip pages and images on the local network (the Skip Local Network Pages setting). */
  skipPrivateHosts: boolean;
  /** Total size the stored covers may take; the oldest go first. */
  maxCacheBytes: number;
};

/**
 * The preview image URLs a page's head names, in the configured order, resolved against the
 * page's address; only http(s) URLs.
 */
export function findCoverUrls(html: string, pageUrl: string): string[] {
  const doc = parseFetchedHtml(html);
  const urls: string[] = [];
  const add = (value: string | null) => {
    if (!value?.trim()) return;
    try {
      const url = new URL(value.trim(), pageUrl);
      url.hash = '';
      if (isWebUrl(url) && !urls.includes(url.href)) urls.push(url.href);
    } catch {
      // Not a URL; the next candidate is tried.
    }
  };
  const metas = [...doc.querySelectorAll('meta')];
  for (const name of COVER_LIMITS.metaNames) {
    for (const meta of metas) {
      const key = (meta.getAttribute('property') ?? meta.getAttribute('name') ?? '').toLowerCase();
      if (key === name) add(meta.getAttribute('content'));
    }
  }
  return urls;
}

/**
 * Whether an image may be downloaded for a page: not on the local network (when skipped), and on
 * the page's own site or a site the user gave access to.
 */
export async function mayFetchCover(
  imageUrl: string,
  pageUrl: string,
  skipPrivateHosts: boolean,
  hasAccess: (site: string) => Promise<boolean> = hasCoverSiteAccess,
): Promise<boolean> {
  if (!isReadablePageUrl(imageUrl, skipPrivateHosts)) return false;
  const site = getUrlSite(imageUrl);
  if (!site) return false;
  return site === getUrlSite(pageUrl) || hasAccess(site);
}

async function hasCoverSiteAccess(site: string): Promise<boolean> {
  const origins = getSiteAccessOrigins([site]);
  if (!origins) return false;
  try {
    return await browser.permissions.contains({ origins });
  } catch {
    return false;
  }
}

type Download = { bytes: Uint8Array; type: string } | null;

/** Downloads one image under the byte cap; null when it is not a kept image type. */
async function downloadImage(imageUrl: string, options: CoverScanOptions): Promise<Download> {
  return requestWithTimeout(
    imageUrl,
    // The bookmarked address is not sent to the image's site, and a redirect is never followed:
    // its target was not checked against the sites the user allowed before the request.
    { method: 'GET', redirect: 'error', referrerPolicy: 'no-referrer' },
    COVER_LIMITS.timeoutMs,
    async (response): Promise<Download> => {
      if (!response.ok || !isImageContentType(response.headers.get('content-type'))) return null;
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > options.maxImageBytes) return null;
      const bytes = await readBodyWithLimit(response, options.maxImageBytes);
      const type = bytes?.byteLength ? sniffImageType(bytes) : null;
      return bytes && type && COVER_LIMITS.types.has(type) ? { bytes, type } : null;
    },
  );
}

/**
 * Decodes an image and draws it again at most `widthPx` wide, so the stored copy is a plain
 * picture the extension made. Undefined for images too small or too large to be covers.
 */
async function shrinkImage(
  bytes: Uint8Array,
  type: string,
  widthPx: number,
): Promise<{ data: ArrayBuffer; type: string; width: number; height: number } | undefined> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
  try {
    const { width, height } = bitmap;
    if (width < COVER_LIMITS.minWidthPx || width * height > COVER_LIMITS.maxPixels) return;
    const scale = Math.min(1, widthPx / width);
    const outWidth = Math.max(1, Math.round(width * scale));
    const outHeight = Math.max(1, Math.round(height * scale));
    const canvas = new OffscreenCanvas(outWidth, outHeight);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, outWidth, outHeight);
    const blob = await canvas.convertToBlob({
      type: COVER_LIMITS.outputType,
      quality: COVER_LIMITS.outputQuality,
    });
    return { data: await blob.arrayBuffer(), type: blob.type, width: outWidth, height: outHeight };
  } finally {
    bitmap.close();
  }
}

async function fetchCover(item: CoverScanItem, options: CoverScanOptions): Promise<void> {
  const page = await fetchHtmlPage(item.url, {
    timeoutMs: COVER_LIMITS.timeoutMs,
    maxBytes: COVER_LIMITS.maxPageBytes,
    until: 'head',
    // A redirect can lead to a local host; that page is not read either.
    allowUrl: (next) => isReadablePageUrl(next, options.skipPrivateHosts),
  });
  if (!page.ok) {
    item.status = 'failed';
    return;
  }
  const candidates = page.html ? findCoverUrls(page.html, page.url) : [];
  item.status = 'none';
  for (const imageUrl of candidates) {
    if (!(await mayFetchCover(imageUrl, page.url, options.skipPrivateHosts))) {
      item.status = 'elsewhere';
      item.imageSite ??= getUrlSite(imageUrl) ?? undefined;
      continue;
    }
    // A redirect or a failed request leaves this image out; the next one named is tried.
    const download = await downloadImage(imageUrl, options).catch(() => null);
    if (!download) continue;
    const image = await shrinkImage(download.bytes, download.type, options.widthPx);
    if (!image) continue;
    item.status = 'found';
    item.imageSite = undefined;
    item.cover = { bookmarkId: item.id, url: item.url, ...image };
    item.preview = toDataUrl(new Uint8Array(image.data), image.type);
    return;
  }
}

/** Fetches a cover for each web bookmark of `nodes` that has none from its current address. */
export async function scanCovers(
  nodes: BookmarkTreeNode[],
  options: CoverScanOptions,
): Promise<CoverScanResult> {
  const stored = await getCoverInfos();
  const items: CoverScanItem[] = [];
  const toFetch: CoverScanItem[] = [];
  for (const { node, pathLabel } of flattenBookmarks(nodes)) {
    const url = node.url ?? '';
    const item: CoverScanItem = {
      id: node.id,
      title: node.title,
      url,
      folderPath: pathLabel,
      status: 'skipped',
    };
    if (isCoverCurrent(stored.get(node.id), url)) item.status = 'current';
    else if (isReadablePageUrl(url, options.skipPrivateHosts)) toFetch.push(item);
    items.push(item);
  }
  await mapWithConcurrency(toFetch, COVER_LIMITS.concurrency, async (item) => {
    try {
      await fetchCover(item, options);
    } catch {
      item.status = 'failed';
      item.cover = undefined;
      item.preview = undefined;
    }
  });
  return { items };
}

/** Stores the covers the review kept, and drops covers of bookmarks that are gone. */
export async function saveCoverResults(
  items: readonly CoverScanItem[],
  maxCacheBytes: number,
): Promise<{ saved: number }> {
  const saved = await saveCovers(
    items.flatMap((item) => (item.status === 'found' && item.cover ? [item.cover] : [])),
    maxCacheBytes,
  );
  await pruneCovers(await fetchBookmarkIds());
  return { saved };
}

/** Why a picture of the current tab did not become a cover. */
export type TabCoverError = ActiveTabError | 'unreadable';

/** A picture of the current tab, shrunk, for every bookmark of its address. */
export type TabCover = { covers: CoverImage[]; preview: string };

function dataUrlBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Takes a picture of what the active tab shows now, as a cover for the bookmarks of `url`, only
 * after a click (the toolbar popup's activeTab allows it) and only while that tab shows `url`
 * before and after the picture, so a picture is never kept for another page. Private windows are
 * never pictured (`withActiveTabAt`). Nothing is stored; save the reviewed picture with
 * `saveCovers`.
 */
export async function captureTabCover(
  url: string,
  widthPx: number,
): Promise<{ cover: TabCover } | { error: TabCoverError }> {
  const shot = await withActiveTabAt(url, (tab) =>
    browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' }),
  );
  if ('error' in shot) return shot;
  const image = await shrinkImage(dataUrlBytes(shot.value), MIME.png, widthPx).catch(
    () => undefined,
  );
  if (!image) return { error: 'unreadable' };
  const bookmarks = (await findBookmarksByUrl(url)).filter((node) => node.url === url);
  if (bookmarks.length === 0) return { error: 'changed' };
  return {
    cover: {
      covers: bookmarks.map((node) => ({ bookmarkId: node.id, url, ...image })),
      preview: toDataUrl(new Uint8Array(image.data), image.type),
    },
  };
}
