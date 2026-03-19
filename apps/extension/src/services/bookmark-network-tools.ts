import type { BookmarkTreeNode } from '@/types';
import { flattenBookmarks } from './bookmark-tooling';

export type DeadLinkStatus = 'ok' | 'redirect' | 'error' | 'timeout' | 'invalid';

export type DeadLinkResultItem = {
  id: string;
  title: string;
  url: string;
  folderPath: string;
  status: DeadLinkStatus;
  statusCode?: number;
  message: string;
};

export type DeadLinkScanResult = {
  scannedBookmarks: number;
  items: DeadLinkResultItem[];
};

export type MetadataFetchResultItem = {
  id: string;
  title: string;
  url: string;
  folderPath: string;
  suggestedTitle?: string;
  faviconUrl?: string;
  description?: string;
  changed: boolean;
  message: string;
};

export type MetadataFetchResult = {
  scannedBookmarks: number;
  items: MetadataFetchResultItem[];
};

export type PrivacySeverity = 'low' | 'medium' | 'high';

export type PrivacyScanItem = {
  id: string;
  title: string;
  url: string;
  folderPath: string;
  severity: PrivacySeverity;
  findings: string[];
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
  fetchFavicons: boolean;
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

export async function scanDeadLinks(
  nodes: BookmarkTreeNode[],
  options: DeadLinkOptions,
): Promise<DeadLinkScanResult> {
  const bookmarks = flattenBookmarks(nodes).filter((bookmark) => Boolean(bookmark.node.url));
  const successStatuses = new Set(options.successStatuses);

  const items = await mapWithConcurrency<
    (typeof bookmarks)[number],
    DeadLinkResultItem | null
  >(bookmarks, options.concurrency, async (bookmark) => {
    const url = bookmark.node.url;
    if (!url) {
      return null;
    }

    try {
      const parsed = new URL(url);
      let lastError = 'Unknown error';

      for (let attempt = 0; attempt <= options.retryCount; attempt += 1) {
        try {
          const response = await fetchWithTimeout(parsed.toString(), {
            method: 'HEAD',
            redirect: options.followRedirects ? 'follow' : 'manual',
          }, options.requestTimeoutMs);

          const status: DeadLinkStatus = successStatuses.has(response.status)
            ? response.redirected ? 'redirect' : 'ok'
            : 'error';

          return {
            id: bookmark.node.id,
            title: bookmark.node.title || 'Untitled',
            url,
            folderPath: bookmark.pathLabel,
            status,
            statusCode: response.status,
            message: status === 'ok'
              ? 'Reachable'
              : status === 'redirect'
                ? 'Redirected but reachable'
                : `HTTP ${response.status}`,
          } satisfies DeadLinkResultItem;
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Request failed';
        }
      }

      return {
        id: bookmark.node.id,
        title: bookmark.node.title || 'Untitled',
        url,
        folderPath: bookmark.pathLabel,
        status: lastError.includes('timed out') ? 'timeout' : 'error',
        message: lastError,
      } satisfies DeadLinkResultItem;
    } catch {
      return {
        id: bookmark.node.id,
        title: bookmark.node.title || 'Untitled',
        url,
        folderPath: bookmark.pathLabel,
        status: 'invalid',
        message: 'Invalid URL',
      } satisfies DeadLinkResultItem;
    }
  });

  return {
    scannedBookmarks: bookmarks.length,
    items: items.filter((item): item is DeadLinkResultItem => item !== null),
  };
}

export async function fetchBookmarkMetadata(
  nodes: BookmarkTreeNode[],
  options: MetadataOptions,
): Promise<MetadataFetchResult> {
  const bookmarks = flattenBookmarks(nodes).filter((bookmark) => Boolean(bookmark.node.url));

  const items = await mapWithConcurrency<
    (typeof bookmarks)[number],
    MetadataFetchResultItem | null
  >(bookmarks, options.concurrency, async (bookmark) => {
    const url = bookmark.node.url;
    if (!url) {
      return null;
    }

    try {
      const response = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' }, options.requestTimeoutMs);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const suggestedTitle = doc.querySelector('title')?.textContent?.trim() || undefined;
      const description = options.fetchDescriptions
        ? doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || undefined
        : undefined;
      const faviconHref = options.fetchFavicons
        ? doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]')?.getAttribute('href') || undefined
        : undefined;
      const faviconUrl = faviconHref ? new URL(faviconHref, url).toString() : undefined;
      const changed = Boolean(
        (options.overwriteTitles || !bookmark.node.title) && suggestedTitle && suggestedTitle !== bookmark.node.title,
      );

      return {
        id: bookmark.node.id,
        title: bookmark.node.title || 'Untitled',
        url,
        folderPath: bookmark.pathLabel,
        suggestedTitle,
        faviconUrl,
        description,
        changed,
        message: changed ? 'Metadata available' : 'No title change needed',
      } satisfies MetadataFetchResultItem;
    } catch (error) {
      return {
        id: bookmark.node.id,
        title: bookmark.node.title || 'Untitled',
        url,
        folderPath: bookmark.pathLabel,
        changed: false,
        message: error instanceof Error ? error.message : 'Metadata request failed',
      } satisfies MetadataFetchResultItem;
    }
  });

  return {
    scannedBookmarks: bookmarks.length,
    items: items.filter((item): item is MetadataFetchResultItem => item !== null),
  };
}

export function scanBookmarkPrivacy(
  nodes: BookmarkTreeNode[],
  options: PrivacyOptions,
): PrivacyScanResult {
  const sensitiveParams = new Set(options.sensitiveParams.map((item) => item.toLowerCase()));
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
  const bookmarks = flattenBookmarks(nodes).filter((bookmark) => Boolean(bookmark.node.url));

  const items = bookmarks.flatMap((bookmark) => {
    const url = bookmark.node.url;
    if (!url) {
      return [];
    }

    try {
      const parsed = new URL(url);
      const findings: string[] = [];

      if (options.scanQueryParams) {
        parsed.searchParams.forEach((_value, key) => {
          if (sensitiveParams.has(key.toLowerCase())) {
            findings.push(`Sensitive query parameter: ${key}`);
          }
        });
      }

      if (options.scanFragments && parsed.hash) {
        findings.push('URL contains a fragment');
      }

      const titleText = options.scanTitles ? bookmark.node.title : '';
      const combinedText = `${url} ${titleText}`;

      if (options.emailDetection && emailRegex.test(combinedText)) {
        findings.push('Email address detected');
      }

      if (options.uuidDetection && uuidRegex.test(combinedText)) {
        findings.push('UUID-like token detected');
      }

      if (findings.length === 0) {
        return [];
      }

      return [{
        id: bookmark.node.id,
        title: bookmark.node.title || 'Untitled',
        url,
        folderPath: bookmark.pathLabel,
        severity: findings.some((finding) => finding.includes('Sensitive query parameter')) ? 'high' : 'medium',
        findings,
      } satisfies PrivacyScanItem];
    } catch {
      return [];
    }
  });

  return {
    scannedBookmarks: bookmarks.length,
    items,
  };
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function mapWithConcurrency<T, R>(
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
