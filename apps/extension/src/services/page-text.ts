/**
 * Index Page Text: downloads the bookmarks a run covers, keeps each page's readable text, and
 * leaves it for the review to save into the page text index (`page-text-store.ts`). Pages are read
 * the way AI page reading reads them (no cookies, Readability, the same private-host rule), but
 * the text stays on this device and is used only by search. A page already indexed from the same
 * address is not downloaded again. A page that asks for a sign-in instead of showing its content
 * is listed as `signIn` and its text is never kept. The page the user is viewing can also be
 * indexed from its tab, as it is shown to them (`readTabPageText`), after a preview.
 *
 * Bookmarks of one address share one download in a run (`sameAs`), and each keeps its own text.
 * An address with a user name and password, or a query parameter the Privacy Scanner names as
 * sensitive, is never requested, and neither is a page on a site the user chose never to read
 * (Never Read These Sites), nor the address a download would read instead (`readFrom`). Taking
 * back a site's website access, or adding it to those sites, deletes its text, from the index and
 * from the saved results of runs (`registerPageTextAccessCleanup`). A busy site that names a short Retry-After
 * is asked again after it, a few times (`busy_retries`), and is then listed as failed.
 */
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

/**
 * `redirected`: the page sends to another address, which is not requested (`fetchHtmlPage`), so
 * a redirect never reaches the local network or a site the run has no access to.
 * `unsupported`: the address answers with a file that is not a web page (a PDF, an image), which
 * is not downloaded.
 */
export type PageTextScanStatus =
  | 'read'
  | 'empty'
  | 'unsupported'
  | 'signIn'
  | 'redirected'
  | 'failed'
  | 'current'
  | 'notChosen'
  | 'skipped';

export type PageTextScanItem = {
  id: string;
  title: string;
  url: string;
  folderPath: string;
  /** The address the page was read from, when its own redirected there (`HtmlPage.readFrom`). */
  readFrom?: string;
  status: PageTextScanStatus;
  /** The page's readable text, for `read` items. */
  text?: string;
  /** For `read` items: the page had more readable text than the index keeps. */
  truncated?: boolean;
  /** Why a `skipped` page is never requested, when its address may hold a secret. */
  skipReason?: PageTextSkipReason;
  /**
   * The bookmark whose download of the same address this one shares: the run requests each
   * address once (`sharePageTextReads` gives this one what that download found).
   */
  sameAs?: string;
};

/**
 * Why a page is never requested although it is a web page: its address carries a user name and
 * password (`credentials`), or a query parameter named in the Privacy Scanner's sensitive
 * parameters (`sensitiveParam`), such as a token, which the site would receive, or it is on a site
 * the user chose never to read (`excludedSite`).
 */
export type PageTextSkipReason = 'credentials' | 'sensitiveParam' | 'excludedSite';

export type PageTextScanResult = {
  items: PageTextScanItem[];
  /** Bookmarks left out because the index is full (`max_pages`). */
  overLimit: number;
};

export type PageTextScanOptions = {
  /** Skip pages on the local network (the Skip Local Network Pages setting). */
  skipPrivateHosts: boolean;
  /**
   * The sites the user chose to download pages from (`getUrlSite`); bookmarks on other sites are
   * `notChosen` and never requested. Absent: every site of the run.
   */
  sites?: readonly string[];
  /**
   * Never request an address that may hold a secret (`PageTextSkipReason`): the Skip Addresses
   * with Sign-in Details or Secrets setting. Off, such addresses are read like any other.
   */
  skipSecretUrls: boolean;
  /** Query parameter names that count as secrets (the Privacy Scanner's sensitive parameters). */
  sensitiveParams: readonly string[];
  /** Sites whose pages are never read, with their subdomains (Never Read These Sites). */
  excludedSites: readonly string[];
};

/**
 * Reads a downloaded page, its text at most `maxChars` long: `readPageTextHtml` where there is a
 * DOM parser, the AI host page (which runs the same function) in the background.
 */
export type PageTextReader = (html: string, maxChars: number) => Promise<PageTextReading>;

/** Whether `doc` asks for a password in its main content, not in a box beside it. */
function hasSignInField(doc: Document): boolean {
  const { fieldSelector, outsideSelector } = PAGE_TEXT_SIGN_IN;
  return [...doc.querySelectorAll(fieldSelector)].some(
    (field) => !outsideSelector || !field.closest(outsideSelector),
  );
}

/**
 * Reads a page for Index Page Text, where there is a DOM parser: its readable text cut to
 * `maxChars`, or `signIn` for a sign-in page (a password field in its main content and less text
 * than `[sign_in] max_text_chars`), whose text is never kept. The one reader for every path: the
 * AI host page for a background run, a run in the page, and the current tab.
 */
export async function readPageTextHtml(html: string, maxChars: number): Promise<PageTextReading> {
  const doc = parseFetchedHtml(html);
  const asksForPassword = hasSignInField(doc);
  // Read past `maxChars` when it is shorter, so the sign-in check sees as much text as it needs,
  // and one character past it, so a page with more text than is kept says so.
  const blocks = await extractPageBlocks(doc, {
    ...PAGE_TEXT_EXTRACTION,
    maxChars: Math.max(maxChars + 1, PAGE_TEXT_SIGN_IN.maxTextChars),
  });
  const text = blocks?.trim() ?? '';
  if (asksForPassword && text.length < PAGE_TEXT_SIGN_IN.maxTextChars) return { status: 'signIn' };
  if (!text) return { status: 'empty' };
  return {
    status: 'read',
    text: text.slice(0, maxChars).trim(),
    truncated: text.length > maxChars,
  };
}

/**
 * Downloads one bookmark's page and keeps its readable text on `item`. A busy site that names a
 * short Retry-After (`busyRetryWait`, shared with Check Dead Links) is asked again after it, at
 * most `busy_retries` times, and is then listed as failed. Throws when the page cannot be
 * downloaded or read, and {@link RequestAbortedError} when `signal` stopped it, also while
 * waiting out a Retry-After.
 */
export async function readPageTextItem(
  item: PageTextScanItem,
  options: Pick<PageTextScanOptions, 'skipPrivateHosts' | 'excludedSites'> & {
    readText: PageTextReader;
    signal?: AbortSignal;
  },
): Promise<void> {
  const download = () =>
    fetchHtmlPage(item.url, {
      timeoutMs: PAGE_TEXT_LIMITS.timeoutMs,
      maxBytes: PAGE_TEXT_LIMITS.maxBytes,
      until: 'end',
      // Each address, a redirect's target and the `https:` or `www.` address read instead too,
      // is checked before it is requested: never a site the user chose never to read, the local
      // network (when skipped), or a site the run has no access to.
      allowUrl: async (next) =>
        !isUrlOnSites(next, options.excludedSites) &&
        (await mayRequestFrom(next, item.url, options.skipPrivateHosts)),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  let page = await download();
  for (let retry = 0; isBusyStatus(page.status); retry += 1) {
    const wait = busyRetryWait(page.status, page.retryAfter ?? null, Date.now());
    if (retry >= PAGE_TEXT_LIMITS.busyRetries || wait === undefined) {
      item.status = 'failed';
      return;
    }
    await waitUnlessStopped(wait, options.signal);
    page = await download();
  }
  const { html, status, ok, stopped, readFrom } = page;
  if (stopped) {
    item.status = 'redirected';
    return;
  }
  if (readFrom) item.readFrom = readFrom;
  let reading: PageTextReading = { status: 'empty' };
  // An answer such as 401 is a sign-in page whatever it shows.
  if (PAGE_TEXT_SIGN_IN.httpStatuses.has(status)) reading = { status: 'signIn' };
  else if (html) reading = await options.readText(html, PAGE_TEXT_LIMITS.maxCharsPerPage);
  else if (ok) {
    // A file that is not a web page answers fine, and its body is never downloaded.
    item.status = 'unsupported';
    return;
  }
  item.status = reading.status;
  if (reading.status === 'read') {
    item.text = reading.text;
    item.truncated = reading.truncated;
  }
}

/** Why `url` must not be requested although it is a web page, if it must not (`PageTextSkipReason`). */
export function pageTextPrivacyReason(
  url: string,
  isSensitiveParam: (name: string) => boolean,
): PageTextSkipReason | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.username || parsed.password) return 'credentials';
  for (const name of parsed.searchParams.keys()) {
    if (isSensitiveParam(name)) return 'sensitiveParam';
  }
  return undefined;
}

export type PageTextNeed =
  | { status: 'current' | 'read' }
  | { status: 'skipped'; reason?: PageTextSkipReason };

/** Whether a bookmark's page is indexed already, may not be read, or is one to download. */
export function pageTextNeed(
  url: string,
  indexed: PageTextRecord | undefined,
  options: PageTextScanOptions,
  isSensitiveParam: (name: string) => boolean,
): PageTextNeed {
  // A site the user chose never to read is skipped even when its text is indexed (until it is
  // deleted), so coverage never counts it.
  if (isUrlOnSites(url, options.excludedSites))
    return { status: 'skipped', reason: 'excludedSite' };
  if (isPageTextCurrent(indexed, url)) return { status: 'current' };
  if (!isReadablePageUrl(url, options.skipPrivateHosts)) return { status: 'skipped' };
  const reason = options.skipSecretUrls ? pageTextPrivacyReason(url, isSensitiveParam) : undefined;
  return reason ? { status: 'skipped', reason } : { status: 'read' };
}

/**
 * The sites whose pages a run over `nodes` would download, with how many bookmarks each: what the
 * user chooses from before the run starts. Pages indexed already and pages that may not be read
 * are left out, since the run requests nothing for them.
 */
export async function listPageTextSites(
  nodes: BookmarkTreeNode[],
  options: PageTextScanOptions,
): Promise<SiteCount[]> {
  const indexed = await getPageTexts();
  const isSensitiveParam = createParamNameMatcher(options.sensitiveParams);
  return countUrlSites(
    flattenBookmarks(nodes).flatMap(({ node }) => {
      const url = node.url ?? '';
      const need = pageTextNeed(url, indexed.get(node.id), options, isSensitiveParam);
      return need.status === 'read' ? [url] : [];
    }),
  );
}

/**
 * What a run over `nodes` covers: every bookmark, marked `current` when it is indexed from its
 * address already, `skipped` when it may not be read, and `notChosen` when its site is not one
 * of `options.sites`, with `toRead` the ones to download. Bookmarks past the room the index has
 * left are counted in `overLimit` only. Of bookmarks with the same address, only the first is
 * downloaded; the others name it in `sameAs`.
 */
export async function planPageTextScan(
  nodes: BookmarkTreeNode[],
  options: PageTextScanOptions,
): Promise<PageTextScanResult & { toRead: Set<PageTextScanItem> }> {
  const indexed = await getPageTexts();
  const isSensitiveParam = createParamNameMatcher(options.sensitiveParams);
  const chosen = options.sites ? new Set(options.sites) : null;
  const firstOfUrl = new Map<string, PageTextScanItem>();
  let room = Math.max(0, PAGE_TEXT_LIMITS.maxPages - indexed.size);
  let overLimit = 0;
  const items: PageTextScanItem[] = [];
  const toRead = new Set<PageTextScanItem>();
  for (const { node, pathLabel } of flattenBookmarks(nodes)) {
    const url = node.url ?? '';
    const need = pageTextNeed(url, indexed.get(node.id), options, isSensitiveParam);
    const item: PageTextScanItem = {
      id: node.id,
      title: node.title,
      url,
      folderPath: pathLabel,
      status: need.status === 'read' ? 'skipped' : need.status,
      ...(need.status === 'skipped' && need.reason ? { skipReason: need.reason } : {}),
    };
    if (need.status === 'read' && chosen && !chosen.has(getUrlSite(url) ?? '')) {
      item.status = 'notChosen';
    } else if (need.status === 'read') {
      // Text read again for a bookmark that has some takes no more room.
      if (!indexed.has(node.id)) {
        if (room === 0) {
          overLimit += 1;
          continue;
        }
        room -= 1;
      }
      const first = firstOfUrl.get(url);
      if (first) {
        item.sameAs = first.id;
      } else {
        firstOfUrl.set(url, item);
        toRead.add(item);
      }
    }
    items.push(item);
  }
  return { items, overLimit, toRead };
}

/** Reads the pages of `nodes` that are not indexed from their current address yet. */
export async function scanPageTexts(
  nodes: BookmarkTreeNode[],
  options: PageTextScanOptions,
): Promise<PageTextScanResult> {
  const { items, overLimit, toRead } = await planPageTextScan(nodes, options);
  await mapWithConcurrency([...toRead], PAGE_TEXT_LIMITS.concurrency, async (item) => {
    try {
      await readPageTextItem(item, { ...options, readText: readPageTextHtml });
    } catch {
      item.status = 'failed';
    }
  });
  return { items: sharePageTextReads(items), overLimit };
}

/**
 * The results of a run, each bookmark that shared another's download (`sameAs`) given what that
 * download found. One whose download did not finish (a paused or cancelled run) is left out, as
 * that download is.
 */
export function sharePageTextReads(items: readonly PageTextScanItem[]): PageTextScanItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items.flatMap((item) => {
    if (!item.sameAs) return [item];
    const read = byId.get(item.sameAs);
    if (!read) return [];
    const { status, text, truncated, readFrom } = read;
    return [
      {
        ...item,
        status,
        ...(text ? { text } : {}),
        ...(truncated !== undefined ? { truncated } : {}),
        ...(readFrom ? { readFrom } : {}),
      },
    ];
  });
}

/** Every bookmark's address, by id. */
export async function fetchBookmarkUrls(): Promise<Map<string, string>> {
  return new Map(
    flattenBookmarks(await fetchBookmarkTree()).map(({ node }) => [node.id, node.url ?? '']),
  );
}

/** The addresses a run's result was read from: the bookmark's own, and the one read instead. */
export function pageTextAddresses(item: Pick<PageTextScanItem, 'url' | 'readFrom'>): string[] {
  return item.readFrom ? [item.url, item.readFrom] : [item.url];
}

/**
 * Saves the text of the pages the review kept, and drops text of bookmarks that are gone. A page
 * whose bookmark moved to another address since it was read is not saved: the text is not that
 * address's. Neither is a page read from a site the user chose never to read, or whose website
 * access was taken back, since the run read it. `notSaved` counts pages left out because this
 * device's storage for the extension is full.
 */
export async function savePageTextResults(
  items: readonly PageTextScanItem[],
): Promise<PageTextSaveResult> {
  const [urls, { pageTextExcludedSites }] = await Promise.all([fetchBookmarkUrls(), getSettings()]);
  const access = new Map<string, Promise<boolean>>();
  const allowed = async (url: string) => {
    const site = getUrlSite(url);
    if (!site) return false;
    let check = access.get(site);
    if (!check) {
      check = hasWebSiteAccess(site);
      access.set(site, check);
    }
    return check;
  };
  const keep = new Set<PageTextScanItem>();
  for (const item of items) {
    if (item.status !== 'read' || !item.text || urls.get(item.id) !== item.url) continue;
    const addresses = pageTextAddresses(item);
    if (addresses.some((url) => isUrlOnSites(url, pageTextExcludedSites))) continue;
    if ((await Promise.all(addresses.map(allowed))).every(Boolean)) keep.add(item);
  }
  const result = await savePageTexts(
    items.flatMap((item) =>
      keep.has(item) && item.text
        ? [
            {
              bookmarkId: item.id,
              url: item.url,
              text: item.text,
              ...(item.readFrom ? { readFrom: item.readFrom } : {}),
              ...(item.truncated !== undefined ? { truncated: item.truncated } : {}),
            },
          ]
        : [],
    ),
    'download',
  );
  await prunePageTexts(new Set(urls.keys()));
  return result;
}

/**
 * Why the current tab's text was not indexed; `excluded`: the page is on a site the user chose
 * never to read.
 */
export type TabPageTextError = ActiveTabError | 'empty' | 'signIn' | 'full' | 'excluded';

/** The current tab's readable text, for every bookmark of its address; save with source `tab`. */
export type TabPageText = {
  text: string;
  pages: PageTextInput[];
};

/**
 * Runs in the tab (`scripting.executeScript`), so it uses nothing from outside itself: the
 * document as it is shown now, at most `maxChars` long, without what was typed into its fields
 * or its editable areas.
 */
function snapshotShownPage(maxChars: number): { url: string; html: string } {
  const copy = document.documentElement.cloneNode(true) as HTMLElement;
  for (const field of copy.querySelectorAll('input, textarea, select')) {
    field.removeAttribute('value');
    if (field.localName !== 'input') field.replaceChildren();
  }
  // A rich text editor's draft (a comment, a message) is typed text too, not the page's.
  for (const editor of copy.querySelectorAll('[contenteditable]:not([contenteditable="false"])')) {
    editor.replaceChildren();
  }
  return { url: location.href, html: copy.outerHTML.slice(0, maxChars) };
}

const shownPageSchema = z.strictObject({
  url: z.string(),
  html: z.string().max(PAGE_TEXT_LIMITS.maxBytes),
});

/**
 * Reads the text of the page the active tab shows, as the user sees it (signed in, too), for the
 * bookmarks of `url`: only after a click, only while the tab shows `url` before and after the
 * read, never in a private window (`withActiveTabAt`), never from a sign-in page, never from a
 * site the user chose never to read, and not past `max_pages`. Nothing is stored; save the
 * previewed text with `savePageTexts(pages, 'tab')`.
 */
export async function readTabPageText(
  url: string,
): Promise<{ page: TabPageText } | { error: TabPageTextError }> {
  if (isUrlOnSites(url, (await getSettings()).pageTextExcludedSites)) return { error: 'excluded' };
  const shown = await withActiveTabAt(url, async (tab) => {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: snapshotShownPage,
      args: [PAGE_TEXT_LIMITS.maxBytes],
    });
    return shownPageSchema.parse(injection?.result);
  });
  if ('error' in shown) return shown;
  // The document read is the bookmarked one, not one the tab moved to in between.
  if (shown.value.url !== url) return { error: 'changed' };
  const reading = await readPageTextHtml(shown.value.html, PAGE_TEXT_LIMITS.maxCharsPerPage);
  if (reading.status !== 'read') return { error: reading.status };
  const bookmarks = (await findBookmarksByUrl(url)).filter((node) => node.url === url);
  if (bookmarks.length === 0) return { error: 'changed' };
  const indexed = await getPageTexts();
  const added = bookmarks.filter((node) => !indexed.has(node.id)).length;
  if (indexed.size + added > PAGE_TEXT_LIMITS.maxPages) return { error: 'full' };
  return {
    page: {
      text: reading.text,
      pages: bookmarks.map((node) => ({
        bookmarkId: node.id,
        url,
        text: reading.text,
        truncated: reading.truncated,
      })),
    },
  };
}
