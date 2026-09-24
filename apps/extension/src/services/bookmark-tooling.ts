import type { BookmarkTreeNode } from '@/types';

export type BookmarkToolScope = 'folder' | 'all';

export type FlatBookmark = {
  node: BookmarkTreeNode;
  folderPath: string[];
  pathLabel: string;
  normalizedUrl?: string;
  hostname?: string;
  depth: number;
};

export type DuplicateGroup = {
  key: string;
  items: FlatBookmark[];
};

export type DuplicateScanResult = {
  groups: DuplicateGroup[];
  totalDuplicates: number;
  scannedBookmarks: number;
};

export type UrlCleanerPreview = {
  id: string;
  title: string;
  folderPath: string;
  originalUrl: string;
  cleanedUrl: string;
  removedParams: string[];
};

export type UrlCleanerResult = {
  previews: UrlCleanerPreview[];
  scannedBookmarks: number;
};

export type BookmarkStatistics = {
  totalBookmarks: number;
  totalFolders: number;
  bookmarksInScope: number;
  deepestLevel: number;
  topDomains: Array<{ label: string; count: number }>;
  topFolders: Array<{ label: string; count: number }>;
  protocols: Array<{ label: string; count: number }>;
  duplicateCount: number;
};

export type DuplicateKeepRule = 'oldest' | 'newest' | 'first';

type DuplicateOptions = {
  strategy: 'exact_url' | 'normalized_url' | 'title_url' | 'title_only';
  normalizeWww: boolean;
  ignoreProtocol: boolean;
  ignoreTrailingSlash: boolean;
  maxGroups: number;
  /** Orders each group so `items[0]` is the bookmark the keep rule retains. */
  keepRule?: DuplicateKeepRule;
};

export type DuplicateRemovalResult = {
  removed: number;
  /** Extras skipped because they, or their group's kept item, changed or vanished after the scan. */
  skipped: number;
  failed: number;
  snapshots: BookmarkDeletionSnapshot[];
};

type UrlCleanerOptions = {
  removeHash: boolean;
  sortQueryParams: boolean;
  dedupeQueryParams: boolean;
  preserveParams: string[];
  removeParams: string[];
};

type StatisticsOptions = {
  includeDomains: boolean;
  includeFolders: boolean;
  includeProtocols: boolean;
  includeDuplicates: boolean;
  topN: number;
};

export function getScopedNodes(
  folders: BookmarkTreeNode[],
  currentFolderId: string | null,
  scope: BookmarkToolScope,
): BookmarkTreeNode[] {
  if (scope === 'all' || !currentFolderId) {
    return folders;
  }

  const target = findNodeById(folders, currentFolderId);
  return target ? [target] : [];
}

export function flattenBookmarks(nodes: BookmarkTreeNode[]): FlatBookmark[] {
  const result: FlatBookmark[] = [];

  const walk = (node: BookmarkTreeNode, folderPath: string[], depth: number) => {
    if (node.url) {
      const normalizedUrl = safeNormalizeUrl(node.url);
      result.push({
        node,
        folderPath,
        pathLabel: folderPath.join(' / '),
        normalizedUrl,
        hostname: normalizedUrl ? new URL(normalizedUrl).hostname : undefined,
        depth,
      });
      return;
    }

    const nextPath = node.title ? [...folderPath, node.title] : folderPath;
    node.children?.forEach((child) => {
      walk(child, nextPath, depth + 1);
    });
  };

  nodes.forEach((node) => {
    walk(node, [], 0);
  });
  return result;
}

export function countFolders(nodes: BookmarkTreeNode[]): number {
  let count = 0;

  const walk = (node: BookmarkTreeNode) => {
    if (!node.url) {
      count += 1;
      node.children?.forEach(walk);
    }
  };

  nodes.forEach(walk);
  return count;
}

export function scanDuplicateBookmarks(
  nodes: BookmarkTreeNode[],
  options: DuplicateOptions,
): DuplicateScanResult {
  const flatBookmarks = flattenBookmarks(nodes);
  const groups = new Map<string, FlatBookmark[]>();

  flatBookmarks.forEach((bookmark) => {
    const key = buildDuplicateKey(bookmark, options);
    if (!key) {
      return;
    }

    const bucket = groups.get(key) ?? [];
    bucket.push(bookmark);
    groups.set(key, bucket);
  });

  const duplicateGroups = Array.from(groups.entries())
    .filter(([, items]) => items.length > 1)
    .slice(0, options.maxGroups)
    .map(([key, items]) => ({ key, items: orderDuplicateGroup(items, options.keepRule ?? 'oldest') }));

  return {
    groups: duplicateGroups,
    totalDuplicates: duplicateGroups.reduce((total, group) => total + group.items.length - 1, 0),
    scannedBookmarks: flatBookmarks.length,
  };
}

export function previewCleanUrls(
  nodes: BookmarkTreeNode[],
  options: UrlCleanerOptions,
): UrlCleanerResult {
  const flatBookmarks = flattenBookmarks(nodes);
  const preserveParams = new Set(options.preserveParams.map((param) => param.toLowerCase()));
  const removeParams = new Set(options.removeParams.map((param) => param.toLowerCase()));

  const previews = flatBookmarks.flatMap((bookmark) => {
    const originalUrl = bookmark.node.url;
    if (!originalUrl) {
      return [];
    }

    try {
      const url = new URL(originalUrl);
      const removedParams: string[] = [];
      const nextEntries: Array<[string, string]> = [];
      const seen = new Set<string>();

      url.searchParams.forEach((value, key) => {
        const normalizedKey = key.toLowerCase();

        if (!preserveParams.has(normalizedKey) && removeParams.has(normalizedKey)) {
          removedParams.push(key);
          return;
        }

        if (options.dedupeQueryParams) {
          const signature = `${normalizedKey}:${value}`;
          if (seen.has(signature)) {
            removedParams.push(key);
            return;
          }
          seen.add(signature);
        }

        nextEntries.push([key, value]);
      });

      if (removedParams.length === 0 && !options.sortQueryParams && !options.removeHash) {
        return [];
      }

      url.search = '';
      const finalEntries = options.sortQueryParams
        ? [...nextEntries].sort(([a], [b]) => a.localeCompare(b))
        : nextEntries;
      finalEntries.forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });

      if (options.removeHash) {
        url.hash = '';
      }

      const cleanedUrl = url.toString();
      if (cleanedUrl === originalUrl) {
        return [];
      }

      const preview = {
        id: bookmark.node.id,
        title: bookmark.node.title || 'Untitled',
        folderPath: bookmark.pathLabel,
        originalUrl,
        cleanedUrl,
        removedParams,
      };

      return [preview];
    } catch {
      return [];
    }
  });

  return {
    previews,
    scannedBookmarks: flatBookmarks.length,
  };
}

export function collectBookmarkStatistics(
  nodes: BookmarkTreeNode[],
  options: StatisticsOptions,
): BookmarkStatistics {
  const flatBookmarks = flattenBookmarks(nodes);
  const domains = new Map<string, number>();
  const folders = new Map<string, number>();
  const protocols = new Map<string, number>();

  flatBookmarks.forEach((bookmark) => {
    if (options.includeDomains && bookmark.hostname) {
      domains.set(bookmark.hostname, (domains.get(bookmark.hostname) ?? 0) + 1);
    }

    if (options.includeFolders) {
      // An empty label marks root-level bookmarks; the view localizes it.
      const label = bookmark.pathLabel;
      folders.set(label, (folders.get(label) ?? 0) + 1);
    }

    if (options.includeProtocols && bookmark.node.url) {
      try {
        const protocol = new URL(bookmark.node.url).protocol.replace(':', '');
        protocols.set(protocol, (protocols.get(protocol) ?? 0) + 1);
      } catch {
        protocols.set('invalid', (protocols.get('invalid') ?? 0) + 1);
      }
    }
  });

  const duplicateCount = options.includeDuplicates
    ? scanDuplicateBookmarks(nodes, {
        strategy: 'normalized_url',
        normalizeWww: true,
        ignoreProtocol: true,
        ignoreTrailingSlash: true,
        maxGroups: Number.MAX_SAFE_INTEGER,
      }).totalDuplicates
    : 0;

  return {
    totalBookmarks: flatBookmarks.length,
    totalFolders: countFolders(nodes),
    bookmarksInScope: flatBookmarks.length,
    deepestLevel: flatBookmarks.reduce((depth, bookmark) => Math.max(depth, bookmark.depth), 0),
    topDomains: toTopEntries(domains, options.topN),
    topFolders: toTopEntries(folders, options.topN),
    protocols: toTopEntries(protocols, options.topN),
    duplicateCount,
  };
}

/** Compares browser bookmark IDs numerically when both are numeric (Chrome), else as strings. */
function compareBookmarkIds(a: string, b: string): number {
  const numericA = Number(a);
  const numericB = Number(b);
  if (Number.isFinite(numericA) && Number.isFinite(numericB) && a !== '' && b !== '') {
    return numericA - numericB;
  }
  return a.localeCompare(b);
}

/**
 * Returns the group ordered so the first item is the one the keep rule retains. The preview
 * and the removal both read this order, so the item labeled "Keep" is never deleted.
 */
export function orderDuplicateGroup(
  items: FlatBookmark[],
  keepRule: DuplicateKeepRule,
): FlatBookmark[] {
  return [...items].sort((a, b) => {
    const byId = compareBookmarkIds(a.node.id, b.node.id);
    if (keepRule === 'first') return byId;
    const dateA = a.node.dateAdded ?? 0;
    const dateB = b.node.dateAdded ?? 0;
    const byDate = keepRule === 'newest' ? dateB - dateA : dateA - dateB;
    return byDate || byId;
  });
}

/** The IDs the preview labels "Keep" and the IDs a removal will delete. */
export function getDuplicateKeepRuleIds(result: DuplicateScanResult) {
  return {
    keep: result.groups.map((group) => group.items[0].node.id),
    remove: result.groups.flatMap((group) => group.items.slice(1).map((item) => item.node.id)),
  };
}

/**
 * Removes every previewed extra (all items after the first in each group). Each group is
 * re-read first: extras whose URL changed or that no longer exist are skipped, and a group
 * whose kept bookmark is gone is left untouched so the URL is never lost entirely.
 */
export async function removeDuplicateExtras(
  groups: DuplicateGroup[],
): Promise<DuplicateRemovalResult> {
  const result: DuplicateRemovalResult = { removed: 0, skipped: 0, failed: 0, snapshots: [] };
  const readCurrent = async (id: string) => {
    try {
      return await getBookmark(id);
    } catch {
      return null;
    }
  };

  for (const group of groups) {
    const [keeper, ...extras] = group.items;
    const currentKeeper = keeper ? await readCurrent(keeper.node.id) : null;
    if (!currentKeeper) {
      result.skipped += extras.length;
      continue;
    }

    for (const extra of extras) {
      const current = await readCurrent(extra.node.id);
      if (!current || current.url !== extra.node.url) {
        result.skipped += 1;
        continue;
      }
      try {
        const snapshot = await captureBookmarkDeletion(extra.node.id);
        await deleteBookmark(extra.node.id);
        result.snapshots.push(snapshot);
        result.removed += 1;
      } catch {
        result.failed += 1;
      }
    }
  }

  return result;
}

/**
 * Restores bookmarks removed by {@link removeDuplicateExtras}. Snapshots are replayed in
 * reverse deletion order so captured sibling indexes stay valid.
 */
export async function restoreDuplicateExtras(
  snapshots: BookmarkDeletionSnapshot[],
): Promise<{ restored: number; failed: number }> {
  let restored = 0;
  let failed = 0;
  for (const snapshot of [...snapshots].reverse()) {
    try {
      await restoreBookmarkDeletion(snapshot);
      restored += 1;
    } catch {
      failed += 1;
    }
  }
  return { restored, failed };
}

function buildDuplicateKey(bookmark: FlatBookmark, options: DuplicateOptions) {
  const title = bookmark.node.title.trim().toLowerCase();
  const url = bookmark.node.url;

  switch (options.strategy) {
    case 'exact_url':
      return url || undefined;
    case 'normalized_url':
      return normalizeDuplicateUrl(url, options);
    case 'title_url': {
      const normalized = normalizeDuplicateUrl(url, options);
      return normalized ? `${title}::${normalized}` : undefined;
    }
    case 'title_only':
      return title || undefined;
    default:
      return undefined;
  }
}

/**
 * Normalizes only what never changes the target resource: scheme and host case (the URL
 * parser lowercases both) and default ports. Explicit non-default ports, path, query, and
 * fragment case are preserved. Query parameter order is ignored, and the optional settings
 * strip `www.`, the scheme, and a trailing slash.
 */
function normalizeDuplicateUrl(url: string | undefined, options: DuplicateOptions) {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url.trim());
    if (!parsed.host) {
      return url.trim();
    }
    const protocol = options.ignoreProtocol ? '' : parsed.protocol;
    const host = options.normalizeWww ? parsed.host.replace(/^www\./, '') : parsed.host;
    const pathname = options.ignoreTrailingSlash && parsed.pathname !== '/'
      ? parsed.pathname.replace(/\/$/, '')
      : parsed.pathname;
    const query = parsed.search
      .slice(1)
      .split('&')
      .filter(Boolean)
      .sort()
      .join('&');

    return `${protocol}//${host}${pathname}${query ? `?${query}` : ''}${parsed.hash}`;
  } catch {
    return url.trim();
  }
}

function findNodeById(nodes: BookmarkTreeNode[], id: string): BookmarkTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children) {
      const result = findNodeById(node.children, id);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

function safeNormalizeUrl(url: string) {
  try {
    return new URL(url).toString();
  } catch {
    return undefined;
  }
}

function toTopEntries(entries: Map<string, number>, topN: number) {
  return Array.from(entries.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([label, count]) => ({ label, count }));
}
