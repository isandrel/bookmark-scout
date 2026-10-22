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

async function readPage(url: string, skipPrivateHosts: boolean): Promise<string | undefined> {
  const { html } = await fetchHtmlPage(url, {
    timeoutMs: PAGE_TEXT_LIMITS.timeoutMs,
    maxBytes: PAGE_TEXT_LIMITS.maxBytes,
    until: 'end',
    // A redirect can lead to a local host; that page is not read either.
    allowUrl: (next) => isReadablePageUrl(next, skipPrivateHosts),
  });
  if (!html) return undefined;
  const page = await extractPageText(parseFetchedHtml(html), PAGE_TEXT_LIMITS.maxCharsPerPage);
  return page?.text.trim() || undefined;
}

/** Reads the pages of `nodes` that are not indexed from their current address yet. */
export async function scanPageTexts(
  nodes: BookmarkTreeNode[],
  options: PageTextScanOptions,
): Promise<PageTextScanResult> {
  const indexed = await getPageTexts();
  let room = Math.max(0, PAGE_TEXT_LIMITS.maxPages - indexed.size);
  let overLimit = 0;
  const items: PageTextScanItem[] = [];
  const toRead: PageTextScanItem[] = [];
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
      toRead.push(item);
    }
    items.push(item);
  }
  await mapWithConcurrency(toRead, PAGE_TEXT_LIMITS.concurrency, async (item) => {
    try {
      const text = await readPage(item.url, options.skipPrivateHosts);
      item.status = text ? 'read' : 'empty';
      if (text) item.text = text;
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
