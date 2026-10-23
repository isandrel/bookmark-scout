import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { closeAuditDb } from '@/lib/bookmark-audit-store';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { BOOKMARK_RULE_LIMITS, type BookmarkRule, ruleAutoMoveBlocks } from '@/lib/bookmark-rules';
import { bookmarkRulesValue } from '@/lib/bookmark-rules-storage';
import { ruleAutoLogValue } from '@/lib/rule-auto-log';
import { SEARCH_SYNTAX_VERSION } from '@/lib/search-query';
import { getSettings, saveSettings } from '@/lib/settings-storage';
import { recordBookmarkWrites } from '@/services/bookmark-history';
import {
  applyRulesToNewBookmarks,
  RULE_AUTO_MOVE_TOOL,
  registerRuleAutomation,
  undoRuleAutoChange,
} from '@/services/rule-automation';
import { type FakeBookmarks, installFakeBookmarks } from '../fake-bookmarks';
import { auditRecords, resetAuditDatabase } from './audit-helpers';

type RawNode = Browser.bookmarks.BookmarkTreeNode;

const DEV_PATH = 'Bookmarks bar / Dev';
// From anywhere: these bookmarks are added the way the browser's star or sync adds them.
const TAG_ONLY = { tag: true, move: false, from: 'any' } as const;
const MOVE_ONLY = { tag: false, move: true, from: 'any' } as const;
const BOTH = { tag: true, move: true, from: 'any' } as const;

const rule = (overrides: Partial<BookmarkRule> = {}): BookmarkRule => ({
  id: 'gh',
  name: 'GitHub',
  enabled: true,
  query: 'domain:github.com',
  syntaxVersion: SEARCH_SYNTAX_VERSION,
  addTags: ['development'],
  moveTo: { folderId: 'dev', path: DEV_PATH },
  autoMove: true,
  ...overrides,
});

let bookmarks: FakeBookmarks;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  await resetAuditDatabase();
  bookmarks = installFakeBookmarks([
    { id: 'bar', title: 'Bookmarks bar' },
    { id: 'inbox', parentId: 'bar', title: 'Inbox' },
    { id: 'dev', parentId: 'bar', title: 'Dev' },
    { id: 'a', parentId: 'inbox', title: 'Repo', url: 'https://github.com/acme/repo' },
    { id: 'b', parentId: 'inbox', title: 'News', url: 'https://news.example.com/' },
    { id: 'managed', title: 'Managed', unmodifiable: 'managed' },
    {
      id: 'mg',
      parentId: 'managed',
      title: 'Policy repo',
      url: 'https://github.com/acme/policy',
      unmodifiable: 'managed',
    },
  ]);
  await bookmarkMetadataValue.set({});
  await ruleAutoLogValue.set([]);
  await bookmarkRulesValue.set([rule()]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const added = (...ids: string[]) =>
  ids.map((id) => ({ id, parentId: bookmarks.get(id)?.parentId ?? '' }));

describe('Tag New Bookmarks', () => {
  it('adds the tags of matching rules once, and never moves', async () => {
    expect(await applyRulesToNewBookmarks(added('a', 'b'), TAG_ONLY)).toEqual({
      tagged: 1,
      moved: 0,
    });
    expect(await bookmarkMetadataValue.get()).toEqual({ a: { tags: ['development'] } });
    // Listed in Settings, where it can be undone.
    expect(await ruleAutoLogValue.get()).toMatchObject([
      { kind: 'tag', bookmarkId: 'a', title: 'Repo', tags: ['development'] },
    ]);
    // Handling the same bookmark again changes nothing.
    expect(await applyRulesToNewBookmarks(added('a'), TAG_ONLY)).toEqual({ tagged: 0, moved: 0 });
    // A rule that may move new bookmarks still does not, with only tagging on.
    expect(bookmarks.get('a')?.parentId).toBe('inbox');
    expect(bookmarks.writes).toEqual([]);
  });

  it('keeps the tags a bookmark has, and skips a bookmark deleted before its turn', async () => {
    await bookmarkMetadataValue.set({ a: { tags: ['mine'] } });
    expect(
      await applyRulesToNewBookmarks([...added('a'), { id: 'gone', parentId: 'inbox' }], TAG_ONLY),
    ).toEqual({ tagged: 1, moved: 0 });
    expect(await bookmarkMetadataValue.get()).toEqual({ a: { tags: ['mine', 'development'] } });
  });
});

describe('Move New Bookmarks', () => {
  it('moves only when the rule allows it, to its own folder, as one audited automatic change', async () => {
    await bookmarkRulesValue.set([rule({ autoMove: undefined })]);
    expect(await applyRulesToNewBookmarks(added('a'), MOVE_ONLY)).toEqual({ tagged: 0, moved: 0 });
    expect(bookmarks.get('a')?.parentId).toBe('inbox');

    await bookmarkRulesValue.set([rule()]);
    expect(await applyRulesToNewBookmarks(added('a', 'b'), MOVE_ONLY)).toEqual({
      tagged: 0,
      moved: 1,
    });
    expect(bookmarks.get('a')?.parentId).toBe('dev');
    // Moving only: no tags.
    expect(await bookmarkMetadataValue.get()).toEqual({});

    const [record, ...others] = await auditRecords();
    expect(others).toEqual([]);
    expect(record).toMatchObject({
      source: 'background',
      actor: 'system',
      state: 'verified_success',
      label: { action: 'move', title: 'Repo', tool: RULE_AUTO_MOVE_TOOL },
      details: { items: [{ id: 'a', change: 'move', after: { parentId: 'dev' } }] },
    });
    expect(await ruleAutoLogValue.get()).toEqual([
      {
        id: expect.any(String),
        kind: 'move',
        bookmarkId: 'a',
        title: 'Repo',
        from: { parentId: 'inbox', index: 0 },
        to: { folderId: 'dev', path: DEV_PATH },
        operationId: record?.id,
        at: expect.any(Number),
      },
    ]);
  });

  it('tags and moves when both are on', async () => {
    expect(await applyRulesToNewBookmarks(added('a'), BOTH)).toEqual({
      tagged: 1,
      moved: 1,
    });
    expect(bookmarks.get('a')?.parentId).toBe('dev');
    expect((await ruleAutoLogValue.get()).map((entry) => entry.kind).sort()).toEqual([
      'move',
      'tag',
    ]);
  });

  it('never moves to a folder found by its path, one renamed or managed, or out of a managed folder', async () => {
    // The folder id is gone; another folder has the path, which a reviewed run would use.
    await bookmarkRulesValue.set([rule({ moveTo: { folderId: 'gone', path: DEV_PATH } })]);
    expect(
      ruleAutoMoveBlocks(await bookmarkRulesValue.get(), await fakeBrowser.bookmarks.getTree()),
    ).toEqual(new Map([['gh', 'missingFolder']]));
    expect(await applyRulesToNewBookmarks(added('a'), MOVE_ONLY)).toEqual({ tagged: 0, moved: 0 });

    // A managed folder never takes bookmarks.
    await bookmarkRulesValue.set([rule({ moveTo: { folderId: 'managed', path: 'Managed' } })]);
    expect(await applyRulesToNewBookmarks(added('a'), MOVE_ONLY)).toEqual({ tagged: 0, moved: 0 });

    // A bookmark in a managed folder stays there.
    await bookmarkRulesValue.set([rule()]);
    expect(await applyRulesToNewBookmarks(added('mg'), MOVE_ONLY)).toEqual({
      tagged: 0,
      moved: 0,
    });

    // The approved folder renamed: stopped until the rule is saved again.
    await fakeBrowser.bookmarks.update('dev', { title: 'Code' });
    expect(
      ruleAutoMoveBlocks(await bookmarkRulesValue.get(), await fakeBrowser.bookmarks.getTree()),
    ).toEqual(new Map([['gh', 'folderChanged']]));
    expect(await applyRulesToNewBookmarks(added('a'), MOVE_ONLY)).toEqual({ tagged: 0, moved: 0 });
    expect(bookmarks.writes).toEqual(['update dev']);
    expect(await auditRecords()).toEqual([]);
    expect(await ruleAutoLogValue.get()).toEqual([]);
  });

  it('leaves bookmarks Bookmark Scout placed, moved since, or that rules disagree on', async () => {
    // Saved by a page of the extension, where the user chose.
    const { result: saved } = await recordBookmarkWrites({ action: 'add' }, (writer) =>
      writer.create({ parentId: 'inbox', title: 'Saved', url: 'https://github.com/acme/saved' }),
    );
    expect(await applyRulesToNewBookmarks(added(saved.id), MOVE_ONLY)).toEqual({
      tagged: 0,
      moved: 0,
    });
    // Moved again before its batch ran.
    expect(await applyRulesToNewBookmarks([{ id: 'a', parentId: 'bar' }], MOVE_ONLY)).toEqual({
      tagged: 0,
      moved: 0,
    });
    // A later rule names another folder: a conflict, left for a reviewed run.
    await bookmarkRulesValue.set([
      rule(),
      rule({
        id: 'repo',
        name: 'Repos',
        query: 'title:repo',
        moveTo: { folderId: 'bar', path: 'Bookmarks bar' },
      }),
    ]);
    expect(await applyRulesToNewBookmarks(added('a'), MOVE_ONLY)).toEqual({ tagged: 0, moved: 0 });
    // The first moving rule decides: a later rule's automatic move never wins over it.
    await bookmarkRulesValue.set([
      rule({ id: 'first', autoMove: undefined }),
      rule({ id: 'second' }),
    ]);
    expect(await applyRulesToNewBookmarks(added('a'), MOVE_ONLY)).toEqual({ tagged: 0, moved: 0 });
    expect(bookmarks.get('a')?.parentId).toBe('inbox');
  });
});

describe('undoing an automatic move', () => {
  const moveA = async () => {
    await applyRulesToNewBookmarks(added('a'), MOVE_ONLY);
    const [entry] = await ruleAutoLogValue.get();
    return entry?.id as string;
  };

  it('puts the bookmark back where it was, linked to the move in the Audit History', async () => {
    const entryId = await moveA();
    expect(await undoRuleAutoChange(entryId)).toEqual({ kind: 'move', result: 'moved' });
    expect(bookmarks.get('a')?.parentId).toBe('inbox');
    expect(bookmarks.childIds('inbox')).toEqual(['a', 'b']);
    expect(await ruleAutoLogValue.get()).toEqual([]);
    const [undo, move] = await auditRecords();
    expect(undo).toMatchObject({
      replay: 'undo',
      relatedOperationId: move?.id,
      label: { action: 'move', tool: RULE_AUTO_MOVE_TOOL },
    });
    // Once only: the entry is gone.
    expect(await undoRuleAutoChange(entryId)).toBeUndefined();
  });

  it('leaves a bookmark moved or deleted since, or whose folder is gone, and drops the entry', async () => {
    // Each case a bookmark added by the browser, not by a page of Bookmark Scout.
    const addRepo = async (title: string) =>
      (
        await fakeBrowser.bookmarks.create({
          parentId: 'inbox',
          title,
          url: `https://github.com/acme/${title}`,
        })
      ).id;
    const moveNew = async (id: string) => {
      await applyRulesToNewBookmarks(added(id), MOVE_ONLY);
      expect(bookmarks.get(id)?.parentId).toBe('dev');
      const [entry] = await ruleAutoLogValue.get();
      return entry?.id as string;
    };

    const changed = await addRepo('changed');
    let entryId = await moveNew(changed);
    await fakeBrowser.bookmarks.move(changed, { parentId: 'bar' });
    expect(await undoRuleAutoChange(entryId)).toEqual({ kind: 'move', result: 'changed' });
    expect(bookmarks.get(changed)?.parentId).toBe('bar');

    const deleted = await addRepo('deleted');
    entryId = await moveNew(deleted);
    await fakeBrowser.bookmarks.remove(deleted);
    expect(await undoRuleAutoChange(entryId)).toEqual({ kind: 'move', result: 'deleted' });

    const orphan = await addRepo('orphan');
    entryId = await moveNew(orphan);
    await fakeBrowser.bookmarks.removeTree('inbox');
    expect(await undoRuleAutoChange(entryId)).toEqual({ kind: 'move', result: 'parentMissing' });
    expect(bookmarks.get(orphan)?.parentId).toBe('dev');
    expect(await ruleAutoLogValue.get()).toEqual([]);
  });
});

describe('new bookmarks in the background', () => {
  it('runs each only while its own setting is on, and leaves large batches alone', async () => {
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
    registerRuleAutomation();
    const add = async (title: string, url: string) => {
      const node = await fakeBrowser.bookmarks.create({ parentId: 'inbox', title, url });
      created?.(node.id, node);
      return node.id;
    };
    const settle = async () => {
      await vi.advanceTimersByTimeAsync(BOOKMARK_RULE_LIMITS.automatic.batch_window_ms);
      await vi.waitFor(() => Promise.resolve());
    };
    const tags = async (id: string) => (await bookmarkMetadataValue.get())[id]?.tags;

    // Bookmarks from anywhere, not only those Bookmark Scout saves (off by default, below).
    await saveSettings({ bookmarkRulesNewFrom: 'any' });
    // Both off by default.
    const before = await add('Tool', 'https://github.com/acme/tool');
    await settle();
    expect(await tags(before)).toBeUndefined();
    expect(bookmarks.get(before)?.parentId).toBe('inbox');

    // Tagging on does not let the rule move.
    await saveSettings({ bookmarkRulesAutoTag: true });
    const tagged = await add('Lib', 'https://github.com/acme/lib');
    await settle();
    await vi.waitFor(async () => expect(await tags(tagged)).toEqual(['development']));
    expect(bookmarks.get(tagged)?.parentId).toBe('inbox');

    // Moving on, tagging off: moved, not tagged.
    await saveSettings({ bookmarkRulesAutoTag: false, bookmarkRulesAutoMove: true });
    const moved = await add('App', 'https://github.com/acme/app');
    await settle();
    await vi.waitFor(() => expect(bookmarks.get(moved)?.parentId).toBe('dev'));
    expect(await tags(moved)).toBeUndefined();

    // A sync adding many at once is left alone.
    const many: string[] = [];
    for (let n = 0; n <= BOOKMARK_RULE_LIMITS.automatic.max_batch; n += 1) {
      many.push(await add(`Synced ${n}`, `https://github.com/acme/synced-${n}`));
    }
    await settle();
    expect(many.map((id) => bookmarks.get(id)?.parentId)).toEqual(many.map(() => 'inbox'));
  });
});

describe('turning automation off mid-run (R36)', () => {
  /** Registers the background listener and returns a way to add a bookmark as the browser does. */
  const listen = () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
    registerRuleAutomation();
    return {
      add: async (title: string) => {
        const node = await fakeBrowser.bookmarks.create({
          parentId: 'inbox',
          title,
          url: `https://github.com/acme/${title}`,
        });
        created?.(node.id, node);
        return node.id;
      },
      settle: async () => {
        await vi.advanceTimersByTimeAsync(BOOKMARK_RULE_LIMITS.automatic.batch_window_ms);
        await vi.waitFor(() => Promise.resolve());
      },
    };
  };

  it.each([
    [
      'Tag New Bookmarks and Move New Bookmarks',
      { bookmarkRulesAutoTag: false, bookmarkRulesAutoMove: false },
    ],
    ['Smart Rules', { bookmarkRulesEnabled: false }],
  ])(
    'changes nothing when %s is turned off after a bookmark is added and before its batch runs',
    async (_name, off) => {
      await saveSettings({
        bookmarkRulesNewFrom: 'any',
        bookmarkRulesAutoTag: true,
        bookmarkRulesAutoMove: true,
      });
      const { add, settle } = listen();
      const id = await add('pending');
      await saveSettings(off);
      await settle();
      expect(await bookmarkMetadataValue.get()).toEqual({});
      expect(bookmarks.get(id)?.parentId).toBe('inbox');
      expect(await ruleAutoLogValue.get()).toEqual([]);
      expect(await auditRecords()).toEqual([]);

      // On again: only bookmarks added from then on are handled; what was committed stays.
      await saveSettings({
        bookmarkRulesEnabled: true,
        bookmarkRulesAutoTag: true,
        bookmarkRulesAutoMove: true,
      });
      const later = await add('later');
      await settle();
      await vi.waitFor(() => expect(bookmarks.get(later)?.parentId).toBe('dev'));
      expect(bookmarks.get(id)?.parentId).toBe('inbox');
      expect(Object.keys(await bookmarkMetadataValue.get())).toEqual([later]);
    },
  );

  it('turning a rule off between the add and the batch leaves the bookmark alone', async () => {
    await saveSettings({ bookmarkRulesNewFrom: 'any', bookmarkRulesAutoTag: true });
    const { add, settle } = listen();
    const id = await add('ruled');
    await bookmarkRulesValue.set([rule({ enabled: false })]);
    await settle();
    expect(await bookmarkMetadataValue.get()).toEqual({});
    expect(bookmarks.get(id)?.parentId).toBe('inbox');
  });
});

describe('deleted and restored before a run (R38)', () => {
  it("never moves to the rule's folder deleted and made again at its path (a new id)", async () => {
    await fakeBrowser.bookmarks.removeTree('dev');
    const again = await fakeBrowser.bookmarks.create({ parentId: 'bar', title: 'Dev' });
    // Blocked, never found again by its path for a move nobody reviews.
    expect(
      ruleAutoMoveBlocks(await bookmarkRulesValue.get(), await fakeBrowser.bookmarks.getTree()),
    ).toEqual(new Map([['gh', 'missingFolder']]));
    expect(await applyRulesToNewBookmarks(added('a'), BOTH)).toEqual({ tagged: 1, moved: 0 });
    expect(bookmarks.get('a')?.parentId).toBe('inbox');
    expect(bookmarks.childIds(again.id)).toEqual([]);
    expect(await auditRecords()).toEqual([]);
  });

  it('handles a bookmark deleted and restored with a new id by its new id only', async () => {
    const { id: restored } = await fakeBrowser.bookmarks.create({
      parentId: 'inbox',
      title: 'Repo',
      url: 'https://github.com/acme/repo',
    });
    await fakeBrowser.bookmarks.remove('a');
    // Both arrive in one batch: the deleted id is skipped, the restored one is handled once.
    expect(
      await applyRulesToNewBookmarks([{ id: 'a', parentId: 'inbox' }, ...added(restored)], BOTH),
    ).toEqual({ tagged: 1, moved: 1 });
    expect(await bookmarkMetadataValue.get()).toEqual({ [restored]: { tags: ['development'] } });
    expect(bookmarks.get('a')).toBeUndefined();
    expect(bookmarks.get(restored)?.parentId).toBe('dev');
    expect(bookmarks.writes.filter((write) => write.startsWith('create'))).toEqual([
      `create ${restored}`,
    ]);
  });
});

describe('which new bookmarks (MAINTAINER R4)', () => {
  const saveWithScout = async (title: string) =>
    (
      await recordBookmarkWrites({ action: 'add' }, (writer) =>
        writer.create({ parentId: 'inbox', title, url: `https://github.com/acme/${title}` }),
      )
    ).result.id;

  it('by default acts only on bookmarks saved through Bookmark Scout, never moving them', async () => {
    const saved = await saveWithScout('saved');
    // 'a' was added the way the browser's star or sync adds one: no Bookmark Scout save names it.
    expect(
      await applyRulesToNewBookmarks([...added('a'), ...added(saved)], {
        tag: true,
        move: true,
        from: 'scout',
      }),
    ).toEqual({ tagged: 1, moved: 0 });
    expect(await bookmarkMetadataValue.get()).toEqual({ [saved]: { tags: ['development'] } });
    // The user chose where it went: Move New Bookmarks leaves it there.
    expect(bookmarks.get(saved)?.parentId).toBe('inbox');
    expect(bookmarks.get('a')?.parentId).toBe('inbox');
  });

  it('acts on bookmarks from anywhere only once the user picks Anywhere', async () => {
    expect(await applyRulesToNewBookmarks(added('a'), BOTH)).toEqual({ tagged: 1, moved: 1 });
  });

  it('defaults to Bookmark Scout only, and in the background uses the stricter setting', async () => {
    expect((await getSettings()).bookmarkRulesNewFrom).toBe('scout');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
    registerRuleAutomation();
    await saveSettings({ bookmarkRulesAutoTag: true });
    const settle = () =>
      vi.advanceTimersByTimeAsync(BOOKMARK_RULE_LIMITS.automatic.batch_window_ms);
    const tags = async (id: string) => (await bookmarkMetadataValue.get())[id]?.tags;

    // From the browser: observed only.
    const star = await fakeBrowser.bookmarks.create({
      parentId: 'inbox',
      title: 'Star',
      url: 'https://github.com/acme/star',
    });
    created?.(star.id, star);
    // From Bookmark Scout: tagged.
    const saved = await saveWithScout('scout');
    const node = bookmarks.get(saved) as RawNode;
    created?.(saved, node);
    await settle();
    await vi.waitFor(async () => expect(await tags(saved)).toEqual(['development']));
    expect(await tags(star.id)).toBeUndefined();

    // Added while Bookmark Scout only was set: Anywhere chosen before its batch ran is too late.
    const late = await fakeBrowser.bookmarks.create({
      parentId: 'inbox',
      title: 'Late',
      url: 'https://github.com/acme/late',
    });
    created?.(late.id, late);
    await saveSettings({ bookmarkRulesNewFrom: 'any' });
    await settle();
    await vi.waitFor(() => Promise.resolve());
    expect(await tags(late.id)).toBeUndefined();
  });
});

describe('fail closed (R25)', () => {
  it('moves nothing when the Audit History cannot record the moves, and still tags', async () => {
    await closeAuditDb();
    globalThis.indexedDB = {
      open: () => {
        throw new Error('storage unavailable');
      },
    } as unknown as IDBFactory;
    expect(await applyRulesToNewBookmarks(added('a'), BOTH)).toEqual({ tagged: 1, moved: 0 });
    expect(bookmarks.get('a')?.parentId).toBe('inbox');
    expect(bookmarks.writes).toEqual([]);
    expect((await ruleAutoLogValue.get()).map((entry) => entry.kind)).toEqual(['tag']);
  });
});
