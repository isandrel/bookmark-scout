/**
 * Fetch Covers: reads the `<head>` of each bookmarked page a run covers, takes the preview image
 * the page names for itself (Open Graph, Twitter card), and downloads it only from a site the
 * user gave access to, never through a thumbnail service. The image is checked by its first
 * bytes, decoded, shrunk, and re-encoded, so what is stored is a plain picture, never the file the
 * site sent. Nothing is stored until the review saves it (`cover-store.ts`).
 */
import type { ImageSize } from '@/lib/image-size';
import type { BookmarkTreeNode } from '@/types';

/**
 * `kept`: the bookmark's cover was chosen with Use this view as the cover, which Fetch Covers never
 * replaces (`isKeptCover`); its page is not read.
 * `unusable`: the page names an image, but none could be kept: a file that is not an image of a
 * kept type (by its Content-Type or its first bytes), larger than the byte cap, one whose header
 * states more than `max_pixels` (or cannot be read), or one the browser cannot decode.
 * `redirected`: the page sends to another address, which is not requested (`fetchHtmlPage`).
 */
export type CoverScanStatus =
  | 'kept'
  | 'found'
  | 'none'
  | 'unusable'
  | 'elsewhere'
  | 'redirected'
  | 'failed'
  | 'current'
  | 'skipped';

export type CoverScanItem = {
  id: string;
  title: string;
  url: string;
  folderPath: string;
  /** The address the page was read from, when its own redirected there (`HtmlPage.readFrom`). */
  readFrom?: string;
  status: CoverScanStatus;
  /**
   * For `found`: the shrunk image to store. The review draws it from these bytes only while its
   * row is on screen (`CoverReviewImage`), so a run holds each image once.
   */
  cover?: CoverImage;
  /** For `elsewhere`: the site the page's image is on, which the run has no access to. */
  imageSite?: string;
};

/**
 * `pageImagesOff`: Cover Source takes no page images (Screenshot only), so no page was read; the
 * review says so. `overLimit`: bookmarks left out unread because the run had found
 * `max_found_per_run` covers (config/bookmarks/covers.toml); the next run reads them.
 */
export type CoverScanResult = { items: CoverScanItem[]; pageImagesOff?: true; overLimit?: number };

/** How a stored copy is drawn: its width, and the WebP quality (Cover Image Quality). */
export type CoverImageOptions = { widthPx: number; quality: number };

export type CoverScanOptions = CoverImageOptions & {
  /** Image files larger than this are not downloaded. */
  maxImageBytes: number;
  /** Skip pages and images on the local network (the Skip Local Network Pages setting). */
  skipPrivateHosts: boolean;
  /** Total size the stored covers may take; the oldest go first. */
  maxCacheBytes: number;
  /**
   * Cover Source: a current picture of the tab is fetched over only when the choice ranks the
   * page's own image above it (Page image first, Page image only).
   */
  preference: CoverPreference;
};

/**
 * The preview image URLs a page's head names, in the configured order, resolved against the
 * page's address; only http(s) URLs.
 */
export function findCoverUrls(html: string, pageUrl: string): string[] {
  const doc = parseFetchedHtml(html);
  return coverUrlsFromMetas(
    [...doc.querySelectorAll('meta')].map((meta) => ({
      key: meta.getAttribute('property') ?? meta.getAttribute('name') ?? '',
      content: meta.getAttribute('content') ?? '',
    })),
    pageUrl,
  );
}

/** A page's `meta` element: its `property` (or `name`) and its `content`. */
export type PageMeta = { key: string; content: string };

/**
 * The preview image URLs `metas` name, in the configured order, resolved against the page's
 * address; only http(s) URLs. `findCoverUrls` for a fetched page, and quick save for the tab.
 */
export function coverUrlsFromMetas(metas: readonly PageMeta[], pageUrl: string): string[] {
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
  for (const name of COVER_LIMITS.metaNames) {
    for (const meta of metas) {
      if (meta.key.toLowerCase() === name) add(meta.content);
    }
  }
  return urls;
}

/** A kept image's bytes, `unusable` for a file that is no such image, null when not received. */
type Download = { bytes: Uint8Array; type: string } | 'unusable' | null;

/**
 * Downloads one image under the byte cap: `unusable` when it is not a kept image type or too
 * large, null when the request failed or the site answered with an error.
 */
async function downloadImage(
  imageUrl: string,
  options: Pick<CoverScanOptions, 'maxImageBytes'>,
): Promise<Download> {
  return requestWithTimeout(
    imageUrl,
    // The bookmarked address is not sent to the image's site, and a redirect is never followed:
    // its target was not checked against the sites the user allowed before the request.
    { method: 'GET', redirect: 'error', referrerPolicy: 'no-referrer' },
    COVER_LIMITS.timeoutMs,
    async (response): Promise<Download> => {
      if (!response.ok) return null;
      if (!isImageContentType(response.headers.get('content-type'))) return 'unusable';
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > options.maxImageBytes) return 'unusable';
      const bytes = await readBodyWithLimit(response, options.maxImageBytes);
      const type = bytes?.byteLength ? sniffImageType(bytes) : null;
      return bytes && type && COVER_LIMITS.types.has(type) ? { bytes, type } : 'unusable';
    },
  );
}

/**
 * Whether a picture of this size can be a cover: `small` when narrower than `min_width_px` (a
 * logo or a tracking pixel), `unusable` past `max_pixels`.
 */
function checkCoverSize({ width, height }: ImageSize): 'small' | 'unusable' | undefined {
  if (width * height > COVER_LIMITS.maxPixels) return 'unusable';
  return width < COVER_LIMITS.minWidthPx ? 'small' : undefined;
}

/**
 * The type and size a cover file from outside this device (a backup) states, when it can be one:
 * a kept image type by its first bytes, a readable header, and a picture neither too small nor
 * past `max_pixels`; undefined otherwise. Its pixels are checked by `decodesAsCover`.
 */
export function readCoverFile(bytes: Uint8Array): (ImageSize & { type: string }) | undefined {
  const type = sniffImageType(bytes);
  if (!type || !COVER_LIMITS.types.has(type)) return undefined;
  const size = readImageSize(bytes, type);
  return size && !checkCoverSize(size) ? { ...size, type } : undefined;
}

/**
 * Whether the browser decodes a cover file to a picture that can be a cover: the decoded size is
 * checked again, as a header can state less than the picture holds.
 */
export async function decodesAsCover(bytes: Uint8Array, type: string): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
    try {
      return checkCoverSize(bitmap) === undefined;
    } finally {
      bitmap.close();
    }
  } catch {
    return false;
  }
}

export type ShrunkImage = { data: ArrayBuffer; type: string; width: number; height: number };

/**
 * Decodes an image and draws it again at most `widthPx` wide, at `quality`, so the stored copy is
 * a plain picture the extension made. The size the file's header states is checked before it is decoded,
 * since a small file can decode to a picture of gigabytes, and the decoded picture is checked
 * again: `small` for a picture too small to be a cover, `unusable` for one too large or a
 * header that cannot be read. Throws when the browser cannot decode it.
 */
async function shrinkImage(
  bytes: Uint8Array,
  type: string,
  { widthPx, quality }: CoverImageOptions,
): Promise<ShrunkImage | 'small' | 'unusable'> {
  const declared = readImageSize(bytes, type);
  if (!declared) return 'unusable';
  const declaredProblem = checkCoverSize(declared);
  if (declaredProblem) return declaredProblem;
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
  try {
    const { width, height } = bitmap;
    const problem = checkCoverSize(bitmap);
    if (problem) return problem;
    const scale = Math.min(1, widthPx / width);
    const outWidth = Math.max(1, Math.round(width * scale));
    const outHeight = Math.max(1, Math.round(height * scale));
    const canvas = new OffscreenCanvas(outWidth, outHeight);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, outWidth, outHeight);
    const blob = await canvas.convertToBlob({
      type: COVER_LIMITS.outputType,
      quality,
    });
    return { data: await blob.arrayBuffer(), type: blob.type, width: outWidth, height: outHeight };
  } finally {
    bitmap.close();
  }
}

/**
 * Downloads the image at `imageUrl` and shrinks it into a cover: `unusable` for a file that is no
 * kept image (or cannot be decoded), `small` for a picture too small to be a cover, null when the
 * request failed or was redirected. The caller checks the site may be asked first.
 */
export async function takeImage(
  imageUrl: string,
  options: CoverImageOptions & Pick<CoverScanOptions, 'maxImageBytes'>,
): Promise<ShrunkImage | 'small' | 'unusable' | null> {
  const download = await downloadImage(imageUrl, options).catch(() => null);
  if (!download || download === 'unusable') return download;
  // A file the browser cannot decode is no cover, whatever its first bytes say.
  return shrinkImage(download.bytes, download.type, options).catch((): 'unusable' => 'unusable');
}

async function fetchCover(item: CoverScanItem, options: CoverScanOptions): Promise<void> {
  const page = await fetchHtmlPage(item.url, {
    timeoutMs: COVER_LIMITS.timeoutMs,
    maxBytes: COVER_LIMITS.maxPageBytes,
    until: 'head',
    // Each address, a redirect's target too, is checked before it is requested: never the local
    // network (when skipped) or a site the run has no access to.
    allowUrl: (next) => mayRequestFrom(next, item.url, options.skipPrivateHosts),
  });
  if (page.stopped) {
    item.status = 'redirected';
    return;
  }
  if (page.readFrom) item.readFrom = page.readFrom;
  if (!page.ok) {
    item.status = 'failed';
    return;
  }
  const candidates = page.html ? findCoverUrls(page.html, page.url) : [];
  item.status = 'none';
  for (const imageUrl of candidates) {
    if (!(await mayRequestFrom(imageUrl, page.url, options.skipPrivateHosts))) {
      item.status = 'elsewhere';
      item.imageSite ??= getUrlSite(imageUrl) ?? undefined;
      continue;
    }
    const image = await takeImage(imageUrl, options);
    // Unusable only while nothing else is known about the page's images.
    if (image === 'unusable' && item.status === 'none') item.status = 'unusable';
    if (image === null || typeof image === 'string') continue;
    item.status = 'found';
    item.imageSite = undefined;
    item.cover = { bookmarkId: item.id, url: item.url, source: 'page', ...image };
    return;
  }
}

/**
 * Fetches a cover for each web bookmark of `nodes` that has none from its current address, or
 * whose cover is a picture of the tab that Cover Source ranks below the page's own image; never
 * over a cover the user chose (`kept`). With `only` (Fetch Cover on chosen bookmarks, a narrow
 * scope), just those bookmarks are listed and read. Once the run has found `max_found_per_run`
 * covers it reads no more pages: the rest are left out and counted in `overLimit`.
 */
export async function scanCovers(
  nodes: BookmarkTreeNode[],
  options: CoverScanOptions,
  only?: ReadonlySet<string>,
): Promise<CoverScanResult> {
  const stored = await getCoverInfos();
  // Screenshot only: no page is read, and the review says page images are not used.
  const pageImages = acceptsCoverKind(options.preference, 'page');
  const items: CoverScanItem[] = [];
  const toFetch: CoverScanItem[] = [];
  for (const { node, pathLabel } of flattenBookmarks(nodes)) {
    if (only && !only.has(node.id)) continue;
    const url = node.url ?? '';
    const item: CoverScanItem = {
      id: node.id,
      title: node.title,
      url,
      folderPath: pathLabel,
      status: 'skipped',
    };
    const current = stored.get(node.id);
    // Whatever version made it: a chosen cover is never fetched over.
    if (isKeptCoverOf(current, url)) {
      item.status = 'kept';
    } else if (
      isCoverCurrent(current, url) &&
      !replacesCover(options.preference, 'page', current.source)
    ) {
      item.status = 'current';
    } else if (pageImages && isReadablePageUrl(url, options.skipPrivateHosts)) toFetch.push(item);
    items.push(item);
  }
  let found = 0;
  const leftOut = new Set<CoverScanItem>();
  await mapWithConcurrency(toFetch, COVER_LIMITS.concurrency, async (item) => {
    if (found >= COVER_LIMITS.maxFoundPerRun) {
      leftOut.add(item);
      return;
    }
    try {
      await fetchCover(item, options);
    } catch {
      item.status = 'failed';
      item.cover = undefined;
    }
    if (item.status !== 'found') return;
    // Pages read at the same time can find more than the cap; those covers are not kept.
    if (found >= COVER_LIMITS.maxFoundPerRun) {
      item.cover = undefined;
      leftOut.add(item);
    } else {
      found += 1;
    }
  });
  return {
    items: leftOut.size > 0 ? items.filter((item) => !leftOut.has(item)) : items,
    ...(pageImages ? {} : { pageImagesOff: true as const }),
    ...(leftOut.size > 0 ? { overLimit: leftOut.size } : {}),
  };
}

/**
 * Stores the covers the review kept, and drops covers of bookmarks that are gone. `notSaved`
 * counts covers left out because this device's storage for the extension is full.
 */
export async function saveCoverResults(
  items: readonly CoverScanItem[],
  maxCacheBytes: number,
): Promise<CoverSaveResult> {
  const result = await saveCovers(
    items.flatMap((item) => (item.status === 'found' && item.cover ? [item.cover] : [])),
    maxCacheBytes,
  );
  await pruneCovers(await fetchBookmarkIds());
  return result;
}

/** Why a picture of the current tab did not become a cover. */
export type TabCoverError = ActiveTabError | 'unreadable';

/** A picture of the current tab, shrunk, for every bookmark of its address. */
export type TabCover = { covers: CoverImage[]; preview: string };

function dataUrlBytes(dataUrl: string): Uint8Array {
  return base64ToBytes(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

/**
 * A PNG picture of a tab (`tabs.captureVisibleTab`), shrunk and checked like any cover; null when
 * it cannot be one (too small, too large, or not decodable).
 */
export async function shrinkTabPicture(
  pngDataUrl: string,
  options: CoverImageOptions,
): Promise<ShrunkImage | null> {
  const image = await shrinkImage(dataUrlBytes(pngDataUrl), MIME.png, options).catch(
    (): 'unusable' => 'unusable',
  );
  return typeof image === 'string' ? null : image;
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
  options: CoverImageOptions,
): Promise<{ cover: TabCover } | { error: TabCoverError }> {
  const shot = await withActiveTabAt(url, (tab) =>
    browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' }),
  );
  if ('error' in shot) return shot;
  const image = await shrinkTabPicture(shot.value, options);
  if (!image) return { error: 'unreadable' };
  const bookmarks = (await findBookmarksByUrl(url)).filter((node) => node.url === url);
  if (bookmarks.length === 0) return { error: 'changed' };
  return {
    cover: {
      covers: bookmarks.map((node) => ({
        bookmarkId: node.id,
        url,
        source: 'tab' as const,
        ...image,
      })),
      preview: toDataUrl(new Uint8Array(image.data), image.type),
    },
  };
}
