import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  applyDeadLinkRepairs,
  buildArchiveUrl,
  isActionableRepair,
  isDeadLinkRepairCandidate,
  resolveRepairUrl,
  summarizeDeadLinkRepairs,
  undoDeadLinkRepairs,
} from '@/services/dead-link-repair';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';

type RepairItem = Parameters<typeof applyDeadLinkRepairs>[0][number];

let bookmarks: FakeBookmarks;

function seed(...nodes: Array<[id: string, url: string]>) {
  bookmarks = installFakeBookmarks([
    { id: 'folder', title: 'Folder' },
    ...nodes.map(([id, url]) => ({ id, parentId: 'folder', title: `Title ${id}`, url })),
  ]);
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

const urls = () =>
  bookmarks.childIds('folder').map((id) => [id, bookmarks.get(id)?.url] as const);

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
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
    expect(urls()).toEqual([
      ['keep', 'https://e2e.invalid/keep'],
      ['moved', 'https://e2e.invalid/target'],
      ['arch', 'https://web.archive.org/web/https://e2e.invalid/arch'],
      ['edit', 'https://e2e.invalid/fixed'],
    ]);
  });

  it('skips bookmarks deleted or edited after the scan and counts failures apart', async () => {
    seed(
      ['edited', 'https://e2e.invalid/edited-by-user'],
      ['fresh', 'https://e2e.invalid/fresh'],
      ['broken', 'https://e2e.invalid/broken'],
    );
    bookmarks.fail.remove.add('broken');
    const outcome = await applyDeadLinkRepairs([
      item('gone', 'delete'),
      item('edited', 'delete'),
      item('fresh', 'edit', 'https://e2e.invalid/fixed'),
      item('broken', 'delete'),
    ]);
    expect(outcome).toMatchObject({ deleted: 0, replaced: 1, skipped: 2, failed: 1 });
    expect(outcome.issues).toEqual([
      { id: 'gone', title: 'Title gone', reason: 'changed' },
      { id: 'edited', title: 'Title edited', reason: 'changed' },
      { id: 'broken', title: 'Title broken', reason: 'failed' },
    ]);
    expect(bookmarks.get('edited')?.url).toBe('https://e2e.invalid/edited-by-user');
  });

  it('undoes a batch: original URLs back, deleted bookmarks restored in place', async () => {
    seed(['del', 'https://e2e.invalid/del'], ['edit', 'https://e2e.invalid/edit']);
    const outcome = await applyDeadLinkRepairs([
      item('del', 'delete'),
      item('edit', 'edit', 'https://e2e.invalid/fixed'),
    ]);
    await expect(undoDeadLinkRepairs(outcome)).resolves.toEqual({ restored: 2, failed: 0 });
    expect(urls().map(([, url]) => url)).toEqual([
      'https://e2e.invalid/del',
      'https://e2e.invalid/edit',
    ]);
  });
});
