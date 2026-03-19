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

type DuplicateOptions = {
  strategy: 'exact_url' | 'normalized_url' | 'title_url' | 'title_only';
  normalizeWww: boolean;
  ignoreProtocol: boolean;
  ignoreTrailingSlash: boolean;
  maxGroups: number;
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
    .map(([key, items]) => ({ key, items }));

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
      const label = bookmark.pathLabel || 'Root';
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

function buildDuplicateKey(bookmark: FlatBookmark, options: DuplicateOptions) {
  const title = bookmark.node.title.trim().toLowerCase();
  const url = bookmark.node.url;

  switch (options.strategy) {
    case 'exact_url':
      return url?.trim().toLowerCase();
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

function normalizeDuplicateUrl(url: string | undefined, options: DuplicateOptions) {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url.trim());
    const protocol = options.ignoreProtocol ? '' : parsed.protocol;
    const hostname = options.normalizeWww ? parsed.hostname.replace(/^www\./, '') : parsed.hostname;
    const pathname = options.ignoreTrailingSlash && parsed.pathname !== '/'
      ? parsed.pathname.replace(/\/$/, '')
      : parsed.pathname;

    return `${protocol}//${hostname}${pathname}${parsed.search}${parsed.hash}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
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
