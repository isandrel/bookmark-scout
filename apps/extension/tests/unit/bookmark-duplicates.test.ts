import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkTreeNode } from '@/types';

const live = vi.hoisted(() => ({
  nodes: new Map<string, { id: string; url?: string; title?: string; parentId: string }>(),
  deleted: [] as string[],
  failDelete: new Set<string>(),
  restored: [] as string[],
}));

vi.mock('@/services/bookmarks', () => ({
  getBookmark: vi.fn(async (id: string) => {
    const node = live.nodes.get(id);
    if (!node) throw new Error('Bookmark not found.');
    return node;
  }),
  captureBookmarkDeletion: vi.fn(async (id: string) => ({
    parentId: live.nodes.get(id)?.parentId ?? 'p',
    node: { title: id, url: live.nodes.get(id)?.url },
    expiresAt: Number.MAX_SAFE_INTEGER,
  })),
  deleteBookmark: vi.fn(async (id: string) => {
    if (live.failDelete.has(id)) throw new Error('boom');
    live.nodes.delete(id);
    live.deleted.push(id);
  }),
  restoreBookmarkDeletion: vi.fn(async (snapshot: { node: { title: string } }) => {
    live.restored.push(snapshot.node.title);
  }),
}));

const {
  getDuplicateKeepRuleIds,
  orderDuplicateGroup,
  removeDuplicateExtras,
  restoreDuplicateExtras,
  scanDuplicateBookmarks,
} = await import('@/services/bookmark-tooling');

type Seed = { id: string; url: string; dateAdded?: number; title?: string };

function folder(items: Seed[]): BookmarkTreeNode[] {
  return [
    {
      id: 'root',
      title: 'Folder',
      children: items.map((item) => ({ title: item.title ?? item.id, ...item })),
    },
  ];
}

const normalized = {
  strategy: 'normalized_url' as const,
  normalizeWww: true,
  ignoreProtocol: true,
  ignoreTrailingSlash: true,
  maxGroups: 100,
};

function groupIds(items: Seed[], options = normalized) {
  return scanDuplicateBookmarks(folder(items), options).groups.map((group) =>
    group.items.map((item) => item.node.id),
  );
}

describe('duplicate matching', () => {
  it('keeps path and query case and explicit ports distinct', () => {
    expect(
      groupIds([
        { id: '1', url: 'https://example.com/Docs/Readme' },
        { id: '2', url: 'https://example.com/docs/readme' },
        { id: '3', url: 'http://localhost:8080/app' },
        { id: '4', url: 'http://localhost:3000/app' },
        { id: '5', url: 'https://example.com/q?Key=A' },
        { id: '6', url: 'https://example.com/q?key=a' },
      ]),
    ).toEqual([]);
  });

  it('normalizes scheme and host case, default ports, www, protocol, and trailing slash', () => {
    expect(
      groupIds([
        { id: '1', url: 'HTTPS://Example.COM/Path/' },
        { id: '2', url: 'http://www.example.com:80/Path' },
        { id: '3', url: 'https://example.com:443/Path' },
      ]),
    ).toEqual([['1', '2', '3']]);
  });

  it('treats reordered query parameters as duplicates only for the normalized strategy', () => {
    const items = [
      { id: '1', url: 'https://example.com/p?a=1&b=2' },
      { id: '2', url: 'https://example.com/p?b=2&a=1' },
    ];
    expect(groupIds(items)).toEqual([['1', '2']]);
    expect(groupIds(items, { ...normalized, strategy: 'exact_url' })).toEqual([]);
  });

  it('matches exact URLs byte for byte', () => {
    expect(
      groupIds(
        [
          { id: '1', url: 'https://example.com/A' },
          { id: '2', url: 'https://example.com/a' },
          { id: '3', url: 'https://example.com/a' },
        ],
        { ...normalized, strategy: 'exact_url' },
      ),
    ).toEqual([['2', '3']]);
  });
});

describe('duplicate keep rules', () => {
  const items: Seed[] = [
    { id: '9', url: 'https://example.com/x', dateAdded: 300 },
    { id: '10', url: 'https://example.com/x', dateAdded: 100 },
    { id: '11', url: 'https://example.com/x', dateAdded: 200 },
  ];

  it.each([
    ['oldest', '10'],
    ['newest', '9'],
    ['first', '9'],
  ] as const)('%s keeps %s in the preview and removes only the other items', (rule, kept) => {
    const result = scanDuplicateBookmarks(folder(items), { ...normalized, keepRule: rule });
    const [group] = result.groups;
    expect(group.items[0].node.id).toBe(kept);
    const { keep, remove } = getDuplicateKeepRuleIds(result);
    expect(keep).toEqual([kept]);
    expect(remove.sort()).toEqual(
      items
        .map((item) => item.id)
        .filter((id) => id !== kept)
        .sort(),
    );
  });

  it('compares ids numerically for the first rule', () => {
    const ordered = orderDuplicateGroup(
      scanDuplicateBookmarks(folder(items), normalized).groups[0].items,
      'first',
    );
    expect(ordered.map((item) => item.node.id)).toEqual(['9', '10', '11']);
  });

  it('breaks date ties by id', () => {
    const tied = [
      { id: '20', url: 'https://example.com/t', dateAdded: 5 },
      { id: '3', url: 'https://example.com/t', dateAdded: 5 },
    ];
    for (const rule of ['oldest', 'newest'] as const) {
      const [group] = scanDuplicateBookmarks(folder(tied), {
        ...normalized,
        keepRule: rule,
      }).groups;
      expect(group.items.map((item) => item.node.id)).toEqual(['3', '20']);
    }
  });
});

describe('duplicate removal', () => {
  const items: Seed[] = [
    { id: '1', url: 'https://example.com/a', dateAdded: 1 },
    { id: '2', url: 'https://example.com/a', dateAdded: 2 },
    { id: '3', url: 'https://example.com/a', dateAdded: 3 },
    { id: '4', url: 'https://example.com/b', dateAdded: 1 },
    { id: '5', url: 'https://example.com/b', dateAdded: 2 },
  ];

  beforeEach(() => {
    live.nodes = new Map(
      items.map((item) => [item.id, { title: item.id, ...item, parentId: 'root' }]),
    );
    live.deleted = [];
    live.failDelete = new Set();
    live.restored = [];
  });

  it('deletes exactly the previewed extras and never the kept items', async () => {
    const result = scanDuplicateBookmarks(folder(items), { ...normalized, keepRule: 'newest' });
    const outcome = await removeDuplicateExtras(result.groups, result.match);
    expect(live.deleted.sort()).toEqual(['1', '2', '4']);
    expect(outcome).toMatchObject({ removed: 3, skipped: 0, failed: 0 });
    expect([...live.nodes.keys()].sort()).toEqual(['3', '5']);
  });

  it('skips vanished or edited extras, protects groups whose keeper is gone, and reports failures', async () => {
    const result = scanDuplicateBookmarks(folder(items), { ...normalized, keepRule: 'oldest' });
    live.nodes.delete('2');
    live.failDelete.add('3');
    live.nodes.delete('4');
    const outcome = await removeDuplicateExtras(result.groups, result.match);
    expect(outcome).toMatchObject({ removed: 0, skipped: 2, failed: 1 });
    expect(live.nodes.has('5')).toBe(true);
    expect(live.deleted).toEqual([]);

    live.nodes.set('3', { id: '3', url: 'https://example.com/changed', parentId: 'root' });
    live.failDelete.clear();
    const second = await removeDuplicateExtras(result.groups, result.match);
    expect(second.skipped).toBe(3);
    expect(live.deleted).toEqual([]);
  });

  it('skips a group whose kept bookmark now points to a different URL', async () => {
    const result = scanDuplicateBookmarks(folder(items), { ...normalized, keepRule: 'oldest' });
    live.nodes.set('1', { id: '1', title: '1', url: 'https://example.com/moved', parentId: 'root' });
    const outcome = await removeDuplicateExtras(result.groups, result.match);
    expect(outcome).toMatchObject({ removed: 1, skipped: 2, skippedGroups: 1, failed: 0 });
    expect(live.deleted).toEqual(['5']);
    expect([...live.nodes.values()].filter((node) => node.url === 'https://example.com/a'))
      .toHaveLength(2);
  });

  it('keeps a group whose keeper still matches after a cosmetic URL change', async () => {
    const result = scanDuplicateBookmarks(folder(items), { ...normalized, keepRule: 'oldest' });
    live.nodes.set('1', { id: '1', title: '1', url: 'http://www.example.com/a/', parentId: 'root' });
    const outcome = await removeDuplicateExtras(result.groups, result.match);
    expect(outcome).toMatchObject({ removed: 3, skipped: 0, skippedGroups: 0 });
    expect(live.nodes.has('1')).toBe(true);
  });

  it('re-checks titles for title-based strategies', async () => {
    const titled: Seed[] = [
      { id: '1', url: 'https://example.com/a', title: 'Docs', dateAdded: 1 },
      { id: '2', url: 'https://example.com/a', title: 'Docs', dateAdded: 2 },
      { id: '3', url: 'https://other.example/', title: 'Home', dateAdded: 1 },
      { id: '4', url: 'https://another.example/', title: 'Home', dateAdded: 2 },
    ];
    live.nodes = new Map(titled.map((item) => [item.id, { ...item, parentId: 'root' }]));
    const byTitleUrl = scanDuplicateBookmarks(folder(titled), {
      ...normalized,
      strategy: 'title_url',
    });
    live.nodes.set('2', { id: '2', title: 'Renamed', url: 'https://example.com/a', parentId: 'root' });
    await expect(removeDuplicateExtras(byTitleUrl.groups, byTitleUrl.match)).resolves.toMatchObject({
      removed: 0,
      skipped: 1,
      skippedGroups: 0,
    });

    const byTitle = scanDuplicateBookmarks(folder(titled), { ...normalized, strategy: 'title_only' });
    live.nodes.set('3', { id: '3', title: 'Start', url: 'https://other.example/', parentId: 'root' });
    const outcome = await removeDuplicateExtras(byTitle.groups, byTitle.match);
    expect(outcome.skippedGroups).toBe(1);
    expect(live.nodes.has('4')).toBe(true);
    expect(live.deleted).toEqual([]);
  });

  it('restores removed extras in reverse deletion order', async () => {
    const result = scanDuplicateBookmarks(folder(items), normalized);
    const outcome = await removeDuplicateExtras(result.groups, result.match);
    await expect(restoreDuplicateExtras(outcome.snapshots)).resolves.toEqual({
      restored: 3,
      failed: 0,
    });
    expect(live.restored).toEqual(['5', '3', '2']);
  });
});
