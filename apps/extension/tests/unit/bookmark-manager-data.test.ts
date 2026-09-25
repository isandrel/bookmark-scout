import { describe, expect, it } from 'vitest';
import {
  buildFolderOptions,
  buildManagerFolderTree,
  canMoveWithinFolder,
  getManagerFolderAncestors,
  getMoveTargetFolders,
  isWithinDateRange,
  type ManagerItem,
  partitionSelectionByVisibility,
  pruneNestedSelection,
  resolveManagerFolder,
} from '@/lib/bookmark-manager-data';
import { parseBookmarkTableView } from '@/lib/bookmark-table-view-storage';
import {
  getBlockedEditUrl,
  getRegistrableDomain,
  getUrlDomain,
  hostnameMatchesDomain,
  isScriptUrl,
} from '@/lib/url-domain';

const folder = (id: string, parentId: string, title: string, folderPath: string, index = 0) =>
  ({ id, parentId, title, folderPath, index, type: 'folder' }) satisfies ManagerItem;
const link = (id: string, parentId: string, title: string, folderPath: string, index = 0) =>
  ({ id, parentId, title, folderPath, index, type: 'link' }) satisfies ManagerItem;

// Root "0" > Bar "1" > News "10" > (Tech "11", Link "12"); Other "2" > News "20"; Bar > Untitled x2
const items: ManagerItem[] = [
  { ...folder('1', '0', 'Bar', 'Root'), isRootFolder: true },
  folder('10', '1', 'News', 'Bar', 0),
  folder('11', '10', 'Tech', 'Bar / News', 0),
  link('12', '10', 'Link', 'Bar / News', 1),
  folder('13', '1', '', 'Bar', 1),
  folder('14', '1', '', 'Bar', 2),
  { ...folder('2', '0', 'Other', 'Root', 1), isRootFolder: true },
  folder('20', '2', 'News', 'Other', 0),
];

describe('resolveManagerFolder', () => {
  it('keeps existing folders and treats the browser root as the manager root', () => {
    expect(resolveManagerFolder('11', items, '0')).toEqual({ folderId: '11', status: 'ok' });
    expect(resolveManagerFolder('0', items, '0')).toEqual({ folderId: null, status: 'ok' });
    expect(resolveManagerFolder(null, items, '0')).toEqual({ folderId: null, status: 'ok' });
  });

  it('shows the parent folder for a bookmark ID', () => {
    expect(resolveManagerFolder('12', items, '0')).toEqual({ folderId: '10', status: 'not-folder' });
  });

  it('falls back to the nearest surviving ancestor of a deleted folder, else the root', () => {
    const previous = new Map([
      ['99', '98'],
      ['98', '10'],
    ]);
    expect(resolveManagerFolder('99', items, '0', previous)).toEqual({
      folderId: '10',
      status: 'missing',
    });
    expect(resolveManagerFolder('bogus', items, '0')).toEqual({ folderId: null, status: 'missing' });
  });
});

describe('folder helpers', () => {
  it('lists folders only, with full paths disambiguated by ID', () => {
    expect(buildFolderOptions(items, 'Untitled')).toEqual([
      { value: '1', label: 'Bar' },
      { value: '10', label: 'Bar / News' },
      { value: '11', label: 'Bar / News / Tech' },
      { value: '13', label: 'Bar / Untitled (#13)' },
      { value: '14', label: 'Bar / Untitled (#14)' },
      { value: '2', label: 'Other' },
      { value: '20', label: 'Other / News' },
    ]);
  });

  it('builds the tree in browser order and breadcrumbs from the list', () => {
    const tree = buildManagerFolderTree(items);
    expect(tree.map((node) => node.id)).toEqual(['1', '2']);
    expect(tree[0].children.map((node) => node.id)).toEqual(['10', '13', '14']);
    expect(getManagerFolderAncestors(items, '11').map((item) => item.id)).toEqual([
      '1',
      '10',
      '11',
    ]);
  });

  it('prunes nested selections and excludes selected folders from move targets', () => {
    const selected = [items[1], items[2], items[3], items[7]];
    expect(pruneNestedSelection(selected, items).map((item) => item.id)).toEqual(['10', '20']);
    // Bar ("1") already holds News, so moving there would change nothing.
    expect(getMoveTargetFolders([items[1]], items).map((item) => item.id)).toEqual([
      '13',
      '14',
      '2',
      '20',
    ]);
  });

  it('offers the current folder when the selection spans several folders', () => {
    // News "10" sits in Bar and News "20" in Other, so both parents stay real destinations.
    expect(getMoveTargetFolders([items[1], items[7]], items).map((item) => item.id)).toEqual([
      '1',
      '13',
      '14',
      '2',
    ]);
  });
});

describe('isWithinDateRange', () => {
  const day = new Date(2026, 8, 23);
  it('includes the whole end day and start day', () => {
    const lateEvening = new Date(2026, 8, 23, 23, 59, 30).getTime();
    const earlyMorning = new Date(2026, 8, 23, 0, 0, 1).getTime();
    expect(isWithinDateRange(lateEvening, { from: day, to: day })).toBe(true);
    expect(isWithinDateRange(earlyMorning, { from: day })).toBe(true);
    expect(isWithinDateRange(new Date(2026, 8, 24).getTime(), { from: day, to: day })).toBe(false);
    expect(isWithinDateRange(undefined, { from: day })).toBe(false);
    expect(isWithinDateRange(undefined, undefined)).toBe(true);
  });
});

describe('url domains', () => {
  it.each([
    ['news.bbc.co.uk', 'bbc.co.uk'],
    ['www3.nhk.or.jp', 'nhk.or.jp'],
    ['www.abc.net.au', 'abc.net.au'],
    ['docs.github.com', 'github.com'],
    ['user.github.io', 'user.github.io'],
    ['example.com', 'example.com'],
    ['a.b.example.de', 'example.de'],
    ['localhost', 'localhost'],
    ['192.168.0.1', '192.168.0.1'],
  ])('%s groups under %s', (hostname, domain) => {
    expect(getRegistrableDomain(hostname)).toBe(domain);
  });

  it('matches by hostname, not substring', () => {
    expect(getUrlDomain('https://news.bbc.co.uk/x')).toBe('bbc.co.uk');
    expect(getUrlDomain('chrome://settings')).toBe('settings');
    expect(getUrlDomain('not a url')).toBe('');
    expect(hostnameMatchesDomain('news.bbc.co.uk', 'bbc.co.uk')).toBe(true);
    expect(hostnameMatchesDomain('notbbc.co.uk', 'bbc.co.uk')).toBe(false);
  });

  it('detects script URLs, including obfuscated schemes', () => {
    expect(isScriptUrl('javascript:alert(1)')).toBe(true);
    expect(isScriptUrl('  JavaScript:void(0)')).toBe(true);
    expect(isScriptUrl('java\tscript:alert(1)')).toBe(true);
    expect(isScriptUrl('https://example.com/javascript:')).toBe(false);
    expect(isScriptUrl(undefined)).toBe(false);
  });
});

describe('table view browser order', () => {
  it('defaults to off and persists when enabled', () => {
    expect(parseBookmarkTableView({}).browserOrder).toBe(false);
    expect(parseBookmarkTableView({ version: 1, browserOrder: true }).browserOrder).toBe(true);
  });
});

describe('partitionSelectionByVisibility', () => {
  it('keeps only selected rows the filters show and counts the hidden ones', () => {
    const selected = [link('a', '1', 'Keep me', 'Bar'), link('b', '1', 'Target X', 'Bar'), link('c', '1', 'Also keep', 'Bar')];
    const result = partitionSelectionByVisibility(selected, new Set(['b', 'z']), (row) => row.id);
    expect(result.visible.map((row) => row.id)).toEqual(['b']);
    expect(result.hiddenCount).toBe(2);
  });

  it('reports nothing hidden when every selected row is visible', () => {
    const selected = [link('a', '1', 'A', 'Bar')];
    expect(partitionSelectionByVisibility(selected, new Set(['a']), (row) => row.id)).toEqual({
      visible: selected,
      hiddenCount: 0,
    });
  });
});

describe('getBlockedEditUrl', () => {
  it('names the script scheme that was entered', () => {
    expect(getBlockedEditUrl('javascript:alert(1)')).toEqual({ kind: 'script', prefix: 'javascript:' });
    expect(getBlockedEditUrl(' VBScript:msgbox(1)')).toEqual({ kind: 'script', prefix: 'vbscript:' });
    expect(getBlockedEditUrl('java\tscript:alert(1)')).toEqual({ kind: 'script', prefix: 'javascript:' });
  });

  it('rejects data: URLs that open as a page but allows inert data', () => {
    expect(getBlockedEditUrl('data:text/html,<script>alert(1)</script>')).toEqual({
      kind: 'data-document',
      prefix: 'data:text/html',
    });
    expect(getBlockedEditUrl('DATA:Text/HTML;base64,PGI+')).toEqual({
      kind: 'data-document',
      prefix: 'data:text/html',
    });
    expect(getBlockedEditUrl('data:image/svg+xml,<svg/>')?.prefix).toBe('data:image/svg+xml');
    expect(getBlockedEditUrl('data:text/plain,hello')).toBeNull();
    expect(getBlockedEditUrl('data:,hello')).toBeNull();
    expect(getBlockedEditUrl('data:image/png;base64,iVBOR')).toBeNull();
  });

  it('allows ordinary web URLs', () => {
    expect(getBlockedEditUrl('https://example.com/javascript:')).toBeNull();
    expect(getBlockedEditUrl('https://example.com/?u=data:text/html,x')).toBeNull();
  });
});

describe('canMoveWithinFolder', () => {
  it('disables moves past either end of the folder', () => {
    expect(canMoveWithinFolder('up', 0, 3)).toBe(false);
    expect(canMoveWithinFolder('top', 0, 3)).toBe(false);
    expect(canMoveWithinFolder('down', 0, 3)).toBe(true);
    expect(canMoveWithinFolder('down', 2, 3)).toBe(false);
    expect(canMoveWithinFolder('bottom', 2, 3)).toBe(false);
    expect(canMoveWithinFolder('up', 2, 3)).toBe(true);
    expect(canMoveWithinFolder('up', 0, 1)).toBe(false);
    expect(canMoveWithinFolder('down', 0, 1)).toBe(false);
  });
});
