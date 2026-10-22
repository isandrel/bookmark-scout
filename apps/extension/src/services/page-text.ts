/**
 * Index Page Text: downloads the bookmarks a run covers, keeps each page's readable text, and
 * leaves it for the review to save into the page text index (`page-text-store.ts`). Pages are read
 * the way AI page reading reads them (no cookies, Readability, the same private-host rule), but
 * the text stays on this device and is used only by search. A page already indexed from the same
 * address is not downloaded again. A page that asks for a sign-in instead of showing its content
 * is listed as `signIn` and its text is never kept. The page the user is viewing can also be
 * indexed from its tab, as it is shown to them (`readTabPageText`), after a preview.
 */
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

/**
 * `redirected`: the page sends to another address, which is not requested (`fetchHtmlPage`), so
 * a redirect never reaches the local network or a site the run has no access to.
 */
export type PageTextScanStatus =
  | 'read'
  | 'empty'
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
  status: PageTextScanStatus;
  /** The page's readable text, for `read` items. */
  text?: string;
};

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
  // Read past `maxChars` when it is shorter, so the sign-in check sees as much text as it needs.
  const page = await extractPageText(doc, Math.max(maxChars, PAGE_TEXT_SIGN_IN.maxTextChars));
  const text = page?.text.trim() ?? '';
  if (asksForPassword && text.length < PAGE_TEXT_SIGN_IN.maxTextChars) return { status: 'signIn' };
  return text ? { status: 'read', text: text.slice(0, maxChars).trim() } : { status: 'empty' };
}

/**
 * Downloads one bookmark's page and keeps its readable text on `item`. Throws when the page
 * cannot be downloaded or read, and {@link RequestAbortedError} when `signal` stopped it.
 */
export async function readPageTextItem(
  item: PageTextScanItem,
  options: PageTextScanOptions & { readText: PageTextReader; signal?: AbortSignal },
): Promise<void> {
  const { html, status, stopped } = await fetchHtmlPage(item.url, {
    timeoutMs: PAGE_TEXT_LIMITS.timeoutMs,
    maxBytes: PAGE_TEXT_LIMITS.maxBytes,
    until: 'end',
    // Each address, a redirect's target too, is checked before it is requested: never the local
    // network (when skipped) or a site the run has no access to.
    allowUrl: (next) => mayRequestFrom(next, item.url, options.skipPrivateHosts),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (stopped) {
    item.status = 'redirected';
    return;
  }
  let reading: PageTextReading = { status: 'empty' };
  // An answer such as 401 is a sign-in page whatever it shows.
  if (PAGE_TEXT_SIGN_IN.httpStatuses.has(status)) reading = { status: 'signIn' };
  else if (html) reading = await options.readText(html, PAGE_TEXT_LIMITS.maxCharsPerPage);
  item.status = reading.status;
  if (reading.status === 'read') item.text = reading.text;
}

/** Whether a bookmark's page is indexed already, may not be read, or is one to download. */
function pageTextNeed(
  url: string,
  indexed: PageTextRecord | undefined,
  options: PageTextScanOptions,
): 'current' | 'skipped' | 'read' {
  if (isPageTextCurrent(indexed, url)) return 'current';
  return isReadablePageUrl(url, options.skipPrivateHosts) ? 'read' : 'skipped';
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
  return countUrlSites(
    flattenBookmarks(nodes).flatMap(({ node }) => {
      const url = node.url ?? '';
      return pageTextNeed(url, indexed.get(node.id), options) === 'read' ? [url] : [];
    }),
  );
}

/**
 * What a run over `nodes` covers: every bookmark, marked `current` when it is indexed from its
 * address already, `skipped` when it may not be read, and `notChosen` when its site is not one
 * of `options.sites`, with `toRead` the ones to download. Bookmarks past the room the index has
 * left are counted in `overLimit` only.
 */
export async function planPageTextScan(
  nodes: BookmarkTreeNode[],
  options: PageTextScanOptions,
): Promise<PageTextScanResult & { toRead: Set<PageTextScanItem> }> {
  const indexed = await getPageTexts();
  const chosen = options.sites ? new Set(options.sites) : null;
  let room = Math.max(0, PAGE_TEXT_LIMITS.maxPages - indexed.size);
  let overLimit = 0;
  const items: PageTextScanItem[] = [];
  const toRead = new Set<PageTextScanItem>();
  for (const { node, pathLabel } of flattenBookmarks(nodes)) {
    const url = node.url ?? '';
    const need = pageTextNeed(url, indexed.get(node.id), options);
    const item: PageTextScanItem = {
      id: node.id,
      title: node.title,
      url,
      folderPath: pathLabel,
      status: need === 'read' ? 'skipped' : need,
    };
    if (need === 'read' && chosen && !chosen.has(getUrlSite(url) ?? '')) {
      item.status = 'notChosen';
    } else if (need === 'read') {
      if (room === 0) {
        overLimit += 1;
        continue;
      }
      room -= 1;
      toRead.add(item);
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
  return { items, overLimit };
}

/**
 * Saves the text of the pages the review kept, and drops text of bookmarks that are gone.
 * `notSaved` counts pages left out because this device's storage for the extension is full.
 */
export async function savePageTextResults(
  items: readonly PageTextScanItem[],
): Promise<PageTextSaveResult> {
  const result = await savePageTexts(
    items.flatMap((item) =>
      item.status === 'read' && item.text
        ? [{ bookmarkId: item.id, url: item.url, text: item.text }]
        : [],
    ),
  );
  await prunePageTexts(await fetchBookmarkIds());
  return result;
}

/** Why the current tab's text was not indexed. */
export type TabPageTextError = ActiveTabError | 'empty' | 'signIn' | 'full';

/** The current tab's readable text, for every bookmark of its address. */
export type TabPageText = {
  text: string;
  pages: Pick<PageTextRecord, 'bookmarkId' | 'url' | 'text'>[];
};

/**
 * Runs in the tab (`scripting.executeScript`), so it uses nothing from outside itself: the
 * document as it is shown now, at most `maxChars` long, without what was typed into its fields.
 */
function snapshotShownPage(maxChars: number): { url: string; html: string } {
  const copy = document.documentElement.cloneNode(true) as HTMLElement;
  for (const field of copy.querySelectorAll('input, textarea, select')) {
    field.removeAttribute('value');
    if (field.localName !== 'input') field.replaceChildren();
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
 * read, never in a private window (`withActiveTabAt`), never from a sign-in page, and not past
 * `max_pages`. Nothing is stored; save the previewed text with `savePageTexts`.
 */
export async function readTabPageText(
  url: string,
): Promise<{ page: TabPageText } | { error: TabPageTextError }> {
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
      pages: bookmarks.map((node) => ({ bookmarkId: node.id, url, text: reading.text })),
    },
  };
}
