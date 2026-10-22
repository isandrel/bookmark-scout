import { beforeEach, describe, expect, it } from 'vitest';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { BOOKMARK_RULE_LIMITS } from '@/lib/bookmark-rules';
import {
  clearRuleAutoLog,
  type RuleAutoTagEntry,
  recordRuleAutoChanges,
  ruleAutoLogValue,
  undoAutoTag,
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
});
