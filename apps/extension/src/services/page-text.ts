/**
 * Index Page Text: downloads the bookmarks a run covers, keeps each page's readable text, and
 * leaves it for the review to save into the page text index (`page-text-store.ts`). Pages are read
 * the way AI page reading reads them (no cookies, Readability, the same private-host rule), but
 * the text stays on this device and is used only by search. A page already indexed from the same
 * address is not downloaded again.
 */
import type { BookmarkTreeNode } from '@/types';

export type PageTextScanStatus = 'read' | 'empty' | 'failed' | 'current' | 'skipped';

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
};

/**
 * Turns a downloaded page into its readable text, at most `maxChars` long: `readHtmlText` where
 * there is a DOM parser, the AI host page in a service worker.
 */
export type PageTextReader = (html: string, maxChars: number) => Promise<string | undefined>;

/**
 * Downloads one bookmark's page and keeps its readable text on `item`. Throws when the page
 * cannot be downloaded or read, and {@link RequestAbortedError} when `signal` stopped it.
 */
export async function readPageTextItem(
  item: PageTextScanItem,
  options: PageTextScanOptions & { readText: PageTextReader; signal?: AbortSignal },
): Promise<void> {
  const { html } = await fetchHtmlPage(item.url, {
    timeoutMs: PAGE_TEXT_LIMITS.timeoutMs,
    maxBytes: PAGE_TEXT_LIMITS.maxBytes,
    until: 'end',
    // A redirect can lead to a local host; that page is not read either.
    allowUrl: (next) => isReadablePageUrl(next, options.skipPrivateHosts),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const text = html
    ? (await options.readText(html, PAGE_TEXT_LIMITS.maxCharsPerPage))?.trim()
    : undefined;
  item.status = text ? 'read' : 'empty';
  if (text) item.text = text;
}

/**
 * What a run over `nodes` covers: every bookmark, marked `current` when it is indexed from its
 * address already and `skipped` when it may not be read, with `toRead` the ones to download.
 * Bookmarks past the room the index has left are counted in `overLimit` only.
 */
export async function planPageTextScan(
  nodes: BookmarkTreeNode[],
  options: PageTextScanOptions,
): Promise<PageTextScanResult & { toRead: Set<PageTextScanItem> }> {
  const indexed = await getPageTexts();
  let room = Math.max(0, PAGE_TEXT_LIMITS.maxPages - indexed.size);
  let overLimit = 0;
  const items: PageTextScanItem[] = [];
  const toRead = new Set<PageTextScanItem>();
  for (const { node, pathLabel } of flattenBookmarks(nodes)) {
    const url = node.url ?? '';
    const item: PageTextScanItem = {
      id: node.id,
      title: node.title,
      url,
      folderPath: pathLabel,
      status: 'skipped',
    };
    if (isPageTextCurrent(indexed.get(node.id), url)) item.status = 'current';
    else if (!isReadablePageUrl(url, options.skipPrivateHosts)) item.status = 'skipped';
    else if (room === 0) {
      overLimit += 1;
      continue;
    } else {
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
      await readPageTextItem(item, { ...options, readText: readHtmlText });
    } catch {
      item.status = 'failed';
    }
  });
  return { items, overLimit };
}

/** Saves the text of the pages the review kept, and drops text of bookmarks that are gone. */
export async function savePageTextResults(
  items: readonly PageTextScanItem[],
): Promise<{ saved: number }> {
  const saved = await savePageTexts(
    items.flatMap((item) =>
      item.status === 'read' && item.text
        ? [{ bookmarkId: item.id, url: item.url, text: item.text }]
        : [],
    ),
  );
  await prunePageTexts(await fetchBookmarkIds());
  return { saved };
}
