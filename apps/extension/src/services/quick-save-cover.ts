/**
 * Save a Cover With Quick Save: after a quick save (the shortcut, AI quick save, and their Retry
 * and Save without AI), the new bookmark gets a cover the way Quick Save Cover Source says (Cover
 * Source unless set otherwise): the preview image the page names for itself, read from the tab and
 * downloaded only from the page's own site or a site the user gave access to, or a picture of the
 * tab (`captureVisibleTab`, which the shortcut allows through `activeTab`). It is stored like any
 * cover (`cover-store.ts`) and never leaves the device.
 *
 * Only while the setting and Fetch Covers are both on, never in a private window, never for a page
 * that is not a web page or is on Never Capture These Sites or Never Read These Sites, and never
 * over a cover the user chose with Use this view as the cover; a bookmark that already has a cover
 * keeps it unless When the Bookmark Already Has a Cover says to replace it.
 *
 * The picture is taken when the shortcut is pressed, before the notification is drawn, so the
 * notification is never in it; the save does not wait for it, and the notification waits at most
 * `cover_picture_wait_ms` (config/ui/quick-save.toml). Everything else happens after the save:
 * failures are logged and never shown. Background only.
 */
import { z } from 'zod';

/** What the cover of a quick save follows, from the settings. */
export type QuickSaveCoverRules = {
  /** Save a Cover With Quick Save, and Fetch Covers. */
  enabled: boolean;
  /** Quick Save Cover Source, with `same` resolved to Cover Source. */
  preference: CoverPreference;
  existing: QuickSaveCoverExisting;
  /** Never Capture These Sites and Never Read These Sites. */
  neverSites: readonly string[];
};

export function quickSaveCoverRules(settings: Settings): QuickSaveCoverRules {
  return {
    enabled: settings.quickSaveCover && settings.coversEnabled,
    preference: resolveQuickSaveCoverPreference(
      settings.quickSaveCoverSource,
      settings.coversSourcePreference,
    ),
    existing: settings.quickSaveCoverExisting,
    neverSites: [...settings.coversNeverCaptureSites, ...settings.pageTextExcludedSites],
  };
}

/**
 * The kinds of cover quick save tries for a bookmark of `url`, best first: none while the feature
 * is off, in a private window, for a page it never covers, or when the bookmark's current cover
 * stays (one the user chose, or any with `keep`).
 */
export function quickSaveCoverKinds(
  rules: QuickSaveCoverRules,
  { url, incognito, current }: { url: string; incognito: boolean; current: CoverInfo | undefined },
): readonly CoverKind[] {
  if (!rules.enabled || incognito || !isBrowseCaptureUrl(url, rules.neverSites)) return [];
  if (isCoverCurrent(current, url) && (rules.existing === 'keep' || isKeptCover(current.source))) {
    return [];
  }
  return coverPreferenceKinds(rules.preference);
}

/** The tab a quick save acts on, as the browser passed it. */
type CoverTab = { id: number; windowId: number; url: string };

/** Whether the tab is still the active tab of its window, showing `tab.url`, not in private. */
async function showsPage(tab: CoverTab): Promise<boolean> {
  const now = await browser.tabs.get(tab.id).catch(() => undefined);
  return (
    now?.active === true &&
    now.incognito !== true &&
    now.windowId === tab.windowId &&
    now.url === tab.url
  );
}

/** A PNG picture of the tab while it shows its page, before and after; null otherwise. */
async function pictureOfTab(tab: CoverTab): Promise<string | null> {
  try {
    if (!(await showsPage(tab))) return null;
    const shot = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    return (await showsPage(tab)) ? shot : null;
  } catch (error) {
    // Not allowed here (no activeTab, or a page the browser keeps to itself).
    bookmarkLogger.warn({ error }, 'Quick save cover: no picture of the tab');
    return null;
  }
}

/**
 * Runs in the tab (`scripting.executeScript`), so it uses nothing from outside itself: the page's
 * address and its meta tags named in `names`, at most `maxMetas`, each at most `maxChars` long.
 */
function readCoverMetas(
  names: string[],
  maxMetas: number,
  maxChars: number,
): { url: string; metas: { key: string; content: string }[] } {
  const metas: { key: string; content: string }[] = [];
  for (const meta of document.querySelectorAll('meta[content]')) {
    const key = (meta.getAttribute('property') ?? meta.getAttribute('name') ?? '').toLowerCase();
    const content = meta.getAttribute('content') ?? '';
    if (names.includes(key) && content.length <= maxChars) metas.push({ key, content });
    if (metas.length >= maxMetas) break;
  }
  return { url: location.href, metas };
}

const tabMetasSchema = z.strictObject({
  url: z.string(),
  metas: z
    .array(
      z.strictObject({
        key: z.string().max(INPUT_LIMITS.chars.cover_meta),
        content: z.string().max(INPUT_LIMITS.chars.cover_meta),
      }),
    )
    .max(INPUT_LIMITS.counts.cover_metas),
});

/** The preview image the page in the tab names, downloaded and shrunk; null when none works. */
async function pageImageOfTab(
  tab: CoverTab,
  options: CoverImageOptions & { maxImageBytes: number; skipPrivateHosts: boolean },
): Promise<ShrunkImage | null> {
  const [injection] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: readCoverMetas,
    args: [COVER_LIMITS.metaNames, INPUT_LIMITS.counts.cover_metas, INPUT_LIMITS.chars.cover_meta],
  });
  const read = tabMetasSchema.safeParse(injection?.result);
  // The tab moved on to another page: its image is not this bookmark's.
  if (!read.success || read.data.url !== tab.url) return null;
  for (const imageUrl of coverUrlsFromMetas(read.data.metas, tab.url)) {
    // Only the page's own site, or one the user gave access to; never a new prompt.
    if (!(await mayRequestFrom(imageUrl, tab.url, options.skipPrivateHosts))) continue;
    const image = await takeImage(imageUrl, options);
    if (image !== null && typeof image !== 'string') return image;
  }
  return null;
}

/** A cover quick save is getting for the page it saves. */
export type QuickSaveCover = {
  /**
   * Settles once the picture of the tab is taken (or not needed), or after the wait: the
   * notification is drawn only then, so it is never in the picture.
   */
  ready: Promise<void>;
  /**
   * Gets and stores the cover for `bookmarkId` while `stillWanted` says the bookmark is still
   * the one saved; the stored cover's source, or null when none was kept.
   */
  save: (bookmarkId: string, stillWanted: () => Promise<boolean>) => Promise<CoverSource | null>;
};

/**
 * Starts getting a cover for the page `tab` shows, with `settings` as read when the shortcut was
 * pressed: takes the picture of the tab at once when the cover source may use one and `picture`
 * allows it (false for Retry and Save without AI, pressed while the notification is on screen).
 * Null when quick save keeps no cover for this page.
 */
export function startQuickSaveCover(
  settings: Settings,
  tab: Browser.tabs.Tab | undefined,
  { pictureWaitMs, picture: mayPicture }: { pictureWaitMs: number; picture: boolean },
): QuickSaveCover | null {
  const rules = quickSaveCoverRules(settings);
  if (tab?.id === undefined || tab.windowId === undefined || !tab.url) return null;
  const target: CoverTab = { id: tab.id, windowId: tab.windowId, url: tab.url };
  const incognito = tab.incognito === true;
  const kindsFor = (current: CoverInfo | undefined) =>
    quickSaveCoverKinds(rules, { url: target.url, incognito, current }).filter(
      (kind) => mayPicture || kind !== 'screenshot',
    );
  const kinds = kindsFor(undefined);
  if (kinds.length === 0) return null;

  const picture = kinds.includes('screenshot') ? pictureOfTab(target) : Promise.resolve(null);
  // A picture that comes after the wait may show the notification, so it is not kept.
  let late = false;
  let taken = false;
  const ready = new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      late = !taken;
      resolve();
    }, pictureWaitMs);
    void picture.then(() => {
      taken = true;
      clearTimeout(timer);
      resolve();
    });
  });
  const image = {
    widthPx: settings.coversWidthPx,
    quality: settings.coversQuality,
    maxImageBytes: settings.coversMaxImageKb * BYTES_PER_KB,
    skipPrivateHosts: settings.readPageSkipPrivateHosts,
  };

  const coverOf = async (kind: CoverKind): Promise<ShrunkImage | null> => {
    if (kind === 'page') return pageImageOfTab(target, image);
    const shot = await picture;
    return shot && !late ? shrinkTabPicture(shot, image) : null;
  };

  return {
    ready,
    async save(bookmarkId, stillWanted) {
      try {
        await ready;
        const current = await getCoverInfo(bookmarkId, target.url);
        for (const kind of kindsFor(current)) {
          const cover = await coverOf(kind).catch((error: unknown) => {
            bookmarkLogger.warn({ error, kind }, 'Quick save cover: none of this kind');
            return null;
          });
          if (!cover) continue;
          // Undone, or replaced by a newer quick save, while the cover was made.
          if (!(await stillWanted())) return null;
          const source: CoverSource = kind === 'page' ? 'page' : 'quickSave';
          const { saved } = await saveCovers(
            [{ bookmarkId, url: target.url, source, ...cover }],
            settings.coversMaxCacheMb * BYTES_PER_MB,
          );
          return saved > 0 ? source : null;
        }
      } catch (error) {
        bookmarkLogger.error({ error }, 'Quick save cover failed');
      }
      return null;
    },
  };
}

/**
 * Removes the cover quick save stored for `bookmarkId` from `url` (Remove cover in the
 * notification), unless it has been replaced since by a cover from another source.
 */
export async function removeQuickSaveCover(
  bookmarkId: string,
  url: string,
  source: CoverSource,
): Promise<void> {
  const info = await getCoverInfo(bookmarkId, url);
  if (info?.source === source) await takeCovers([bookmarkId]);
}
