import { beforeEach, describe, expect, it, vi } from 'vitest';

type LiveNode = { id: string; title: string; url: string; parentId: string };

const live = vi.hoisted(() => ({
  nodes: new Map<string, LiveNode>(),
  failUpdate: new Set<string>(),
  failDelete: new Set<string>(),
  failRestore: new Set<string>(),
  calls: [] as string[],
}));

vi.mock('@/services/bookmarks', () => ({
  getBookmark: vi.fn(async (id: string) => {
    const node = live.nodes.get(id);
    if (!node) throw new Error('Bookmark not found.');
    return { ...node };
  }),
  updateBookmark: vi.fn(async (id: string, changes: { url: string }) => {
    if (live.failUpdate.has(id)) throw new Error('boom');
    const node = live.nodes.get(id);
    if (!node) throw new Error('Bookmark not found.');
    node.url = changes.url;
    live.calls.push(`update ${id} ${changes.url}`);
    return { ...node };
  }),
  captureBookmarkDeletion: vi.fn(async (id: string) => {
    const node = live.nodes.get(id) as LiveNode;
    return {
      parentId: node.parentId,
      node: { title: node.title, url: node.url },
      expiresAt: Number.MAX_SAFE_INTEGER,
      id,
    };
  }),
  deleteBookmark: vi.fn(async (id: string) => {
    if (live.failDelete.has(id)) throw new Error('boom');
    live.nodes.delete(id);
    live.calls.push(`delete ${id}`);
  }),
  restoreBookmarkDeletion: vi.fn(
    async (snapshot: { id: string; parentId: string; node: { title: string; url: string } }) => {
      if (live.failRestore.has(snapshot.id)) throw new Error('expired');
      live.nodes.set(snapshot.id, {
        id: snapshot.id,
        parentId: snapshot.parentId,
        title: snapshot.node.title,
        url: snapshot.node.url,
      });
      live.calls.push(`restore ${snapshot.id}`);
    },
  ),
}));

const {
  applyDeadLinkRepairs,
  buildArchiveUrl,
  isActionableRepair,
  isDeadLinkRepairCandidate,
  resolveRepairUrl,
  summarizeDeadLinkRepairs,
  undoDeadLinkRepairs,
} = await import('@/services/dead-link-repair');

type RepairItem = Parameters<typeof applyDeadLinkRepairs>[0][number];

function seed(...nodes: Array<[id: string, url: string]>) {
  for (const [id, url] of nodes) {
    live.nodes.set(id, { id, title: `Title ${id}`, url, parentId: 'folder' });
  }
}

function item(id: string, choice: RepairItem['choice'], newUrl?: string): RepairItem {
  return {
    id,
    title: `Title ${id}`,
    scannedUrl: `https://e2e.invalid/${id}`,
    choice,
    ...(newUrl ? { newUrl } : {}),
  };
}

beforeEach(() => {
  live.nodes.clear();
  live.failUpdate.clear();
  live.failDelete.clear();
  live.failRestore.clear();
  live.calls = [];
});

describe('dead-link repair plan', () => {
  it('reviews failures, timeouts, and redirects only', () => {
    const statuses = ['ok', 'redirect', 'error', 'timeout', 'invalid', 'skipped'] as const;
    expect(statuses.filter((status) => isDeadLinkRepairCandidate({ status }))).toEqual([
      'redirect',
      'error',
      'timeout',
    ]);
  });

  it('builds a Wayback Machine link without requesting it', () => {
    expect(buildArchiveUrl('https://e2e.invalid/a?b=1#c')).toBe(
      'https://web.archive.org/web/https://e2e.invalid/a?b=1#c',
    );
  });

  it('counts only choices that change a bookmark, rejecting non-web and unchanged edits', () => {
    const items = [
      item('a', 'keep'),
      item('b', 'delete'),
      item('c', 'redirect', 'https://e2e.invalid/new'),
      item('d', 'archive', buildArchiveUrl('https://e2e.invalid/d')),
      item('e', 'edit', '  https://e2e.invalid/edited  '),
      item('f', 'edit', 'javascript:alert(1)'),
      item('g', 'edit', 'https://e2e.invalid/g'),
      item('h', 'edit', 'not a url'),
      item('i', 'redirect'),
    ];
    expect(summarizeDeadLinkRepairs(items)).toEqual({ keep: 5, delete: 1, replace: 3 });
    expect(items.filter(isActionableRepair).map((entry) => entry.id)).toEqual(['b', 'c', 'd', 'e']);
    expect(resolveRepairUrl(items[4])).toBe('https://e2e.invalid/edited');
  });
});

describe('applying dead-link repairs', () => {
  it('applies each reviewed choice and leaves kept bookmarks alone', async () => {
    seed(
      ['keep', 'https://e2e.invalid/keep'],
      ['del', 'https://e2e.invalid/del'],
      ['moved', 'https://e2e.invalid/moved'],
      ['arch', 'https://e2e.invalid/arch'],
      ['edit', 'https://e2e.invalid/edit'],
    );
    const outcome = await applyDeadLinkRepairs([
      item('keep', 'keep'),
      item('del', 'delete'),
      item('moved', 'redirect', 'https://e2e.invalid/target'),
      item('arch', 'archive', buildArchiveUrl('https://e2e.invalid/arch')),
      item('edit', 'edit', 'https://e2e.invalid/fixed'),
    ]);
    expect(outcome).toMatchObject({ deleted: 1, replaced: 3, skipped: 0, failed: 0, issues: [] });
    expect([...live.nodes.values()].map((node) => [node.id, node.url])).toEqual([
      ['keep', 'https://e2e.invalid/keep'],
      ['moved', 'https://e2e.invalid/target'],
      ['arch', 'https://web.archive.org/web/https://e2e.invalid/arch'],
      ['edit', 'https://e2e.invalid/fixed'],
    ]);
  });

  it('skips bookmarks deleted or edited after the scan', async () => {
    seed(['edited', 'https://e2e.invalid/edited-by-user'], ['fresh', 'https://e2e.invalid/fresh']);
    const outcome = await applyDeadLinkRepairs([
      item('gone', 'delete'),
      item('edited', 'delete'),
      item('fresh', 'edit', 'https://e2e.invalid/fixed'),
    ]);
    expect(outcome).toMatchObject({ deleted: 0, replaced: 1, skipped: 2, failed: 0 });
    expect(outcome.issues).toEqual([
      { id: 'gone', title: 'Title gone', reason: 'changed' },
      { id: 'edited', title: 'Title edited', reason: 'changed' },
    ]);
    expect(live.nodes.get('edited')?.url).toBe('https://e2e.invalid/edited-by-user');
    expect(live.calls).toEqual(['update fresh https://e2e.invalid/fixed']);
  });

  it('reports partial failures and keeps going', async () => {
    seed(
      ['a', 'https://e2e.invalid/a'],
      ['b', 'https://e2e.invalid/b'],
      ['c', 'https://e2e.invalid/c'],
    );
    live.failDelete.add('a');
    live.failUpdate.add('b');
    const outcome = await applyDeadLinkRepairs([
      item('a', 'delete'),
      item('b', 'edit', 'https://e2e.invalid/b2'),
      item('c', 'delete'),
    ]);
    expect(outcome).toMatchObject({ deleted: 1, replaced: 0, skipped: 0, failed: 2 });
    expect(outcome.issues.map((issue) => [issue.id, issue.reason])).toEqual([
      ['a', 'failed'],
      ['b', 'failed'],
    ]);
    expect(outcome.deletions.map((snapshot) => snapshot.id)).toEqual(['c']);
    expect(outcome.replacements).toEqual([]);
    expect([...live.nodes.keys()]).toEqual(['a', 'b']);
  });
});

describe('undoing dead-link repairs', () => {
  it('restores deleted bookmarks and original URLs', async () => {
    seed(['del', 'https://e2e.invalid/del'], ['edit', 'https://e2e.invalid/edit']);
    const outcome = await applyDeadLinkRepairs([
      item('del', 'delete'),
      item('edit', 'edit', 'https://e2e.invalid/fixed'),
    ]);
    live.calls = [];
    await expect(undoDeadLinkRepairs(outcome)).resolves.toEqual({ restored: 2, failed: 0 });
    expect(live.calls).toEqual(['update edit https://e2e.invalid/edit', 'restore del']);
    expect(live.nodes.get('del')?.url).toBe('https://e2e.invalid/del');
    expect(live.nodes.get('edit')?.url).toBe('https://e2e.invalid/edit');
  });

  it('never overwrites a URL changed again after the repair and counts expired restores', async () => {
    seed(['del', 'https://e2e.invalid/del'], ['edit', 'https://e2e.invalid/edit']);
    const outcome = await applyDeadLinkRepairs([
      item('del', 'delete'),
      item('edit', 'edit', 'https://e2e.invalid/fixed'),
    ]);
    (live.nodes.get('edit') as LiveNode).url = 'https://e2e.invalid/newer';
    live.failRestore.add('del');
    await expect(undoDeadLinkRepairs(outcome)).resolves.toEqual({ restored: 0, failed: 2 });
    expect(live.nodes.get('edit')?.url).toBe('https://e2e.invalid/newer');
    expect(live.nodes.has('del')).toBe(false);
  });
});
