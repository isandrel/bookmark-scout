import { DOMParser as LinkedomParser } from 'linkedom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getLocalizedTypeOptions } from '@/components/ui/table/columns';
import { setLanguage } from '@/hooks/use-i18n';
import { toBookmarkTreeNode } from '@/lib/bookmark-tree-changes';
import {
  buildExportRoot,
  countExportedBookmarks,
  csvFormat,
  htmlFormat,
  jsonFormat,
  markdownFormat,
} from '@/services/bookmark-export';
import {
  applyImportPlan,
  htmlImportFormat,
  jsonImportFormat,
  parseBookmarks,
  planImport,
} from '@/services/bookmark-import';
import { flattenBookmarks, scanDuplicateBookmarks } from '@/services/bookmark-tooling';
import type { BookmarkTreeNode } from '@/types';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

let bookmarks: FakeBookmarks;

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setLanguage('en');
  vi.stubGlobal('DOMParser', LinkedomParser);
  // Firefox reports separators with `type: 'separator'` and the URL `data:`.
  bookmarks = installFakeBookmarks([
    { id: 'f', title: 'Folder' },
    { id: 'a', parentId: 'f', title: 'A', url: 'https://e2e.invalid/a' },
    { id: 's1', parentId: 'f', title: '', type: 'separator' },
    { id: 'b', parentId: 'f', title: 'B', url: 'https://e2e.invalid/b' },
    { id: 's2', parentId: 'f', title: '', type: 'separator' },
    { id: 'target', title: 'Target' },
  ]);
});

/** The tree as the pages keep it. */
const pageTree = async () => (await fakeBrowser.bookmarks.getTree()).map(toBookmarkTreeNode);

const find = (nodes: readonly BookmarkTreeNode[], id: string): BookmarkTreeNode | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = find(node.children ?? [], id);
    if (found) return found;
  }
  return undefined;
};

/** The kinds of the items in a folder, in order, as the browser has them. */
const kinds = (folderId: string) =>
  bookmarks.childIds(folderId).map((id) => {
    const node = bookmarks.get(id) as { type?: string; url?: string } | undefined;
    return node?.type === 'separator' ? 'separator' : node?.url ? 'bookmark' : 'folder';
  });

describe('Firefox separators (L17)', () => {
  it('stay separators in the page tree, never folders', async () => {
    const separator = find(await pageTree(), 's1');
    expect(separator).toMatchObject({ type: 'separator' });
    expect(separator?.children).toBeUndefined();
  });

  it('are never listed as bookmarks, so never as duplicates of each other', async () => {
    const tree = await pageTree();
    expect(flattenBookmarks(tree).map(({ node }) => node.id)).toEqual(['a', 'b']);
    const scan = scanDuplicateBookmarks(tree, {
      strategy: 'exact_url',
      normalizeWww: false,
      ignoreProtocol: false,
      ignoreTrailingSlash: false,
      maxGroups: 100,
    });
    expect(scan.groups).toEqual([]);
    expect(scan.scannedBookmarks).toBe(2);
  });
});

describe('separators in exports (L17, L19)', () => {
  it('HTML writes them as <HR>, never as a link or a folder', async () => {
    const root = buildExportRoot(await pageTree());
    expect(countExportedBookmarks(root)).toBe(2);
    const html = htmlFormat.serialize(root);
    expect(html.match(/<HR>/g)).toHaveLength(2);
    expect(html).not.toContain('data:');
    expect(html).not.toMatch(/<H3[^>]*><\/H3>/);
  });

  it('JSON writes them as separators, and the lossy formats leave them out', async () => {
    const root = buildExportRoot(await pageTree());
    const json = JSON.parse(jsonFormat.serialize(root));
    expect(json.children[0].children).toEqual([
      { title: 'A', url: 'https://e2e.invalid/a' },
      { type: 'separator' },
      { title: 'B', url: 'https://e2e.invalid/b' },
      { type: 'separator' },
    ]);
    for (const format of [markdownFormat, csvFormat]) {
      expect(format.serialize(root, { includeUrls: true })).not.toContain('data:');
    }
  });
});

describe('separators in imports (L17, L19)', () => {
  const roundTrip = async (format: typeof htmlFormat, parser: typeof htmlImportFormat) => {
    // Only the folder with separators, so an earlier round trip's import is not exported again.
    const folder = find(await pageTree(), 'f');
    if (!folder) throw new Error('the folder is there');
    const parsed = parseBookmarks(format.serialize(buildExportRoot([folder])), parser);
    expect(parsed.folderCount).toBe(1);
    expect(parsed.bookmarkCount).toBe(2);
    return planImport(parsed, await pageTree(), 'target', 'import-all');
  };

  it('recreates them as separators in Firefox, in place', async () => {
    vi.stubEnv('BROWSER', 'firefox');
    for (const [format, parser] of [
      [htmlFormat, htmlImportFormat],
      [jsonFormat, jsonImportFormat],
    ] as const) {
      const plan = await roundTrip(format, parser);
      expect(plan.counts).toMatchObject({ separatorsToCreate: 2, separatorsUnsupported: 0 });
      const before = bookmarks.childIds('target').length;
      const outcome = await applyImportPlan(plan);
      expect(outcome).toMatchObject({ bookmarksCreated: 2, foldersCreated: 1, failed: 0 });
      const folder = bookmarks.childIds('target')[before];
      expect(kinds(folder)).toEqual(['bookmark', 'separator', 'bookmark', 'separator']);
    }
  });

  it('leaves them out where the browser has none, and says so', async () => {
    vi.stubEnv('BROWSER', 'chrome');
    for (const [format, parser] of [
      [htmlFormat, htmlImportFormat],
      [jsonFormat, jsonImportFormat],
    ] as const) {
      const plan = await roundTrip(format, parser);
      expect(plan.counts).toMatchObject({ separatorsToCreate: 0, separatorsUnsupported: 2 });
      const before = bookmarks.childIds('target').length;
      const outcome = await applyImportPlan(plan);
      expect(outcome).toMatchObject({ bookmarksCreated: 2, failed: 0, skipped: 2 });
      expect(kinds(bookmarks.childIds('target')[before])).toEqual(['bookmark', 'bookmark']);
    }
  });
});

describe('separators in the manager', () => {
  it('offers the Separator type filter only in Firefox', () => {
    vi.stubEnv('BROWSER', 'chrome');
    expect(getLocalizedTypeOptions().map((option) => option.value)).toEqual(['folder', 'link']);
    vi.stubEnv('BROWSER', 'firefox');
    expect(getLocalizedTypeOptions().map((option) => option.label)).toEqual([
      'Folder',
      'Link',
      'Separator',
    ]);
  });
});
