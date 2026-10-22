import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { autoTagLogValue } from '@/lib/auto-tag-log';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { BOOKMARK_RULE_LIMITS, type BookmarkRule } from '@/lib/bookmark-rules';
import { bookmarkRulesValue } from '@/lib/bookmark-rules-storage';
import { SEARCH_SYNTAX_VERSION } from '@/lib/search-query';
import { saveSettings } from '@/lib/settings-storage';
import { autoTagBookmarks, registerRuleAutoTag } from '@/services/rule-auto-tag';

type RawNode = Browser.bookmarks.BookmarkTreeNode;

const link = (id: string, title: string, url: string): RawNode => ({
  id,
  parentId: '1',
  title,
  url,
  syncing: false,
});

let links: RawNode[] = [];
const tree = (): RawNode[] => [
  {
    id: '0',
    title: '',
    syncing: false,
    children: [{ id: '1', parentId: '0', title: 'Bookmarks bar', syncing: false, children: links }],
  },
];

const rule = (overrides: Partial<BookmarkRule> = {}): BookmarkRule => ({
  id: 'gh',
  name: 'GitHub',
  enabled: true,
  query: 'domain:github.com',
  syntaxVersion: SEARCH_SYNTAX_VERSION,
  addTags: ['development'],
  ...overrides,
});

beforeEach(async () => {
  fakeBrowser.reset();
  links = [
    link('a', 'Repo', 'https://github.com/acme/repo'),
    link('b', 'News', 'https://news.example.com/'),
  ];
  vi.spyOn(fakeBrowser.bookmarks, 'getTree').mockImplementation(async () => tree());
  await bookmarkMetadataValue.set({});
  await autoTagLogValue.set([]);
  await bookmarkRulesValue.set([rule({ moveTo: { folderId: '1', path: 'Bookmarks bar' } })]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Tag New Bookmarks', () => {
  it('adds the tags of matching rules once, and never moves', async () => {
    const move = vi.spyOn(fakeBrowser.bookmarks, 'move');
    expect(await autoTagBookmarks(['a', 'b'])).toBe(1);
    expect(await bookmarkMetadataValue.get()).toEqual({ a: { tags: ['development'] } });
    // Listed in Settings, where it can be undone.
    expect(await autoTagLogValue.get()).toMatchObject([
      { bookmarkId: 'a', title: 'Repo', tags: ['development'] },
    ]);
    // Handling the same bookmark again changes nothing.
    expect(await autoTagBookmarks(['a'])).toBe(0);
    expect(await bookmarkMetadataValue.get()).toEqual({ a: { tags: ['development'] } });
    expect(move).not.toHaveBeenCalled();
  });

  it('keeps the tags a bookmark has, and skips a bookmark deleted before its turn', async () => {
    await bookmarkMetadataValue.set({ a: { tags: ['mine'] } });
    expect(await autoTagBookmarks(['a', 'gone'])).toBe(1);
    expect(await bookmarkMetadataValue.get()).toEqual({ a: { tags: ['mine', 'development'] } });
  });

  it('runs only while the setting is on, and leaves large batches alone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // The fake browser has no bookmark events: keep the listener to call it.
    let created: ((id: string, node: RawNode) => void) | undefined;
    vi.spyOn(fakeBrowser.bookmarks.onCreated, 'addListener').mockImplementation((listener) => {
      created = listener;
    });
    for (const event of [
      fakeBrowser.bookmarks.onImportBegan,
      fakeBrowser.bookmarks.onImportEnded,
    ]) {
      vi.spyOn(event, 'addListener').mockImplementation(() => undefined);
    }
    registerRuleAutoTag();
    const add = async (node: RawNode) => {
      links.push(node);
      created?.(node.id, node);
    };
    const settle = async () => {
      await vi.advanceTimersByTimeAsync(BOOKMARK_RULE_LIMITS.auto_tag.batch_window_ms);
      await vi.waitFor(() => Promise.resolve());
    };

    // Off by default.
    await add(link('c', 'Tool', 'https://github.com/acme/tool'));
    await settle();
    expect((await bookmarkMetadataValue.get()).c).toBeUndefined();

    await saveSettings({ bookmarkRulesAutoTag: true });
    await add(link('d', 'Lib', 'https://github.com/acme/lib'));
    await settle();
    await vi.waitFor(async () =>
      expect((await bookmarkMetadataValue.get()).d).toEqual({ tags: ['development'] }),
    );

    // A sync adding many at once is left alone.
    const many = Array.from({ length: BOOKMARK_RULE_LIMITS.auto_tag.max_batch + 1 }, (_, n) =>
      link(`s${n}`, `Synced ${n}`, `https://github.com/acme/synced-${n}`),
    );
    for (const node of many) await add(node);
    await settle();
    expect(Object.keys(await bookmarkMetadataValue.get())).toEqual(['d']);
  });
});
