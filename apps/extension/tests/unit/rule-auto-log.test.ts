import { beforeEach, describe, expect, it } from 'vitest';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { BOOKMARK_RULE_LIMITS } from '@/lib/bookmark-rules';
import {
  clearRuleAutoLog,
  type RuleAutoTagEntry,
  type RuleRunEntry,
  recordRuleAutoChanges,
  recordRuleRun,
  ruleAutoLogValue,
  undoAutoTag,
  undoRuleRunTags,
} from '@/lib/rule-auto-log';
import { STORAGE_ITEMS, seedStored } from './storage-helpers';

const tagging = (bookmarkId: string, title: string, tags: string[]) => ({
  kind: 'tag' as const,
  bookmarkId,
  title,
  tags,
});

/** The listed tagging of `bookmarkId`. */
async function tagEntryOf(bookmarkId: string): Promise<RuleAutoTagEntry> {
  const entry = (await ruleAutoLogValue.get()).find((item) => item.bookmarkId === bookmarkId);
  if (entry?.kind !== 'tag') throw new Error(`no tagging of ${bookmarkId}`);
  return entry;
}

describe('automatic changes list', () => {
  beforeEach(async () => {
    await ruleAutoLogValue.set([]);
    await bookmarkMetadataValue.set({});
  });

  it('keeps the newest changes first, up to the configured number', async () => {
    const max = BOOKMARK_RULE_LIMITS.automatic.log_max;
    for (let n = 0; n < max + 2; n += 1) {
      await recordRuleAutoChanges([tagging(`b${n}`, `Page ${n}`, ['dev'])]);
    }
    await recordRuleAutoChanges([
      {
        kind: 'move',
        bookmarkId: 'm',
        title: 'Moved',
        from: { parentId: 'inbox', index: 2 },
        to: { folderId: 'dev', path: 'Bar / Dev' },
      },
    ]);
    const entries = await ruleAutoLogValue.get();
    expect(entries).toHaveLength(max);
    expect(entries.slice(0, 2).map((entry) => entry.bookmarkId)).toEqual(['m', `b${max + 1}`]);
  });

  it('reads taggings stored before moves were listed, and drops a malformed entry alone', async () => {
    await seedStored(STORAGE_ITEMS.ruleAutoLog, [
      { id: 'old', bookmarkId: 'a', title: 'A', tags: ['dev'], at: 1 },
      { id: 'bad', kind: 'move', bookmarkId: 'b', title: 'B', at: 2 },
    ]);
    expect(await ruleAutoLogValue.get()).toEqual([
      { id: 'old', kind: 'tag', bookmarkId: 'a', title: 'A', tags: ['dev'], at: 1 },
    ]);
  });

  it('undoes one tagging: removes only its tags still there, keeps others, drops the entry', async () => {
    await bookmarkMetadataValue.set({
      a: { tags: ['mine', 'development', 'Learning'], summary: 'kept' },
    });
    await recordRuleAutoChanges([tagging('a', 'A', ['development', 'learning', 'gone'])]);
    expect(await undoAutoTag(await tagEntryOf('a'))).toBe(2);
    expect(await bookmarkMetadataValue.get()).toEqual({ a: { tags: ['mine'], summary: 'kept' } });
    expect(await ruleAutoLogValue.get()).toEqual([]);
  });

  it('removes a bookmark left with nothing, and clearing keeps the tags', async () => {
    await bookmarkMetadataValue.set({ a: { tags: ['dev'] }, b: { tags: ['dev'] } });
    await recordRuleAutoChanges([tagging('b', 'B', ['dev']), tagging('a', 'A', ['dev'])]);
    await undoAutoTag(await tagEntryOf('a'));
    expect(await bookmarkMetadataValue.get()).toEqual({ b: { tags: ['dev'] } });
    await clearRuleAutoLog();
    expect(await ruleAutoLogValue.get()).toEqual([]);
    expect(await bookmarkMetadataValue.get()).toEqual({ b: { tags: ['dev'] } });
  });

  it('records a reviewed run durably: its tags by bookmark id, its moves by their record', async () => {
    const id = await recordRuleRun({
      tagged: [
        { bookmarkId: 'a', tags: ['dev'] },
        { bookmarkId: 'b', tags: ['dev'] },
        { bookmarkId: 'c', tags: ['dev', 'code'] },
      ],
      moved: 2,
      operationId: 'op-1',
    });
    expect(await ruleAutoLogValue.get()).toEqual([
      {
        id,
        kind: 'run',
        tagged: [
          { tags: ['dev'], bookmarkIds: ['a', 'b'] },
          { tags: ['dev', 'code'], bookmarkIds: ['c'] },
        ],
        omitted: 0,
        moved: 2,
        operationId: 'op-1',
        at: expect.any(Number),
      },
    ]);
    // A run that tagged nothing leaves no entry: its moves are in the History alone.
    expect(await recordRuleRun({ tagged: [], moved: 3 })).toBeUndefined();
    expect(await ruleAutoLogValue.get()).toHaveLength(1);
  });

  it('lists at most the configured number of bookmarks of one run, counting the rest', async () => {
    const max = BOOKMARK_RULE_LIMITS.runs.log_max_bookmarks;
    await recordRuleRun({
      tagged: Array.from({ length: max + 2 }, (_, n) => ({ bookmarkId: `b${n}`, tags: ['dev'] })),
      moved: 0,
    });
    const [entry] = await ruleAutoLogValue.get();
    expect(entry).toMatchObject({ kind: 'run', omitted: 2 });
    expect((entry as RuleRunEntry).tagged[0]?.bookmarkIds).toHaveLength(max);
  });

  it("undoes a run's tags where they still are, keeping every other tag, and drops it", async () => {
    await bookmarkMetadataValue.set({
      a: { tags: ['mine', 'dev'] },
      b: { tags: ['Dev'], summary: 'kept' },
      c: { tags: ['mine'] },
    });
    await recordRuleRun({
      tagged: [
        { bookmarkId: 'a', tags: ['dev'] },
        { bookmarkId: 'b', tags: ['dev'] },
        // Its tag was removed by hand since: nothing to take back.
        { bookmarkId: 'c', tags: ['dev'] },
      ],
      moved: 0,
    });
    const [entry] = await ruleAutoLogValue.get();
    expect(await undoRuleRunTags(entry as RuleRunEntry)).toBe(2);
    expect(await bookmarkMetadataValue.get()).toEqual({
      a: { tags: ['mine'] },
      b: { summary: 'kept' },
      c: { tags: ['mine'] },
    });
    expect(await ruleAutoLogValue.get()).toEqual([]);
  });
});
