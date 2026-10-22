import { beforeEach, describe, expect, it } from 'vitest';
import { autoTagLogValue, clearAutoTagLog, recordAutoTags, undoAutoTag } from '@/lib/auto-tag-log';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { BOOKMARK_RULE_LIMITS } from '@/lib/bookmark-rules';

describe('automatic tagging list', () => {
  beforeEach(async () => {
    await autoTagLogValue.set([]);
    await bookmarkMetadataValue.set({});
  });

  it('keeps the newest taggings first, up to the configured number', async () => {
    const max = BOOKMARK_RULE_LIMITS.auto_tag.log_max;
    for (let n = 0; n < max + 2; n += 1) {
      await recordAutoTags([{ bookmarkId: `b${n}`, title: `Page ${n}`, tags: ['dev'] }]);
    }
    const entries = await autoTagLogValue.get();
    expect(entries).toHaveLength(max);
    expect(entries[0]?.bookmarkId).toBe(`b${max + 1}`);
  });

  it('undoes one tagging: removes only its tags still there, keeps others, drops the entry', async () => {
    await bookmarkMetadataValue.set({
      a: { tags: ['mine', 'development', 'Learning'], summary: 'kept' },
    });
    await recordAutoTags([
      { bookmarkId: 'a', title: 'A', tags: ['development', 'learning', 'gone'] },
    ]);
    const [entry] = await autoTagLogValue.get();
    expect(await undoAutoTag(entry?.id as string)).toBe(2);
    expect(await bookmarkMetadataValue.get()).toEqual({ a: { tags: ['mine'], summary: 'kept' } });
    expect(await autoTagLogValue.get()).toEqual([]);
  });

  it('removes a bookmark left with nothing, and clearing keeps the tags', async () => {
    await bookmarkMetadataValue.set({ a: { tags: ['dev'] }, b: { tags: ['dev'] } });
    await recordAutoTags([
      { bookmarkId: 'a', title: 'A', tags: ['dev'] },
      { bookmarkId: 'b', title: 'B', tags: ['dev'] },
    ]);
    const entries = await autoTagLogValue.get();
    await undoAutoTag(entries.find((entry) => entry.bookmarkId === 'a')?.id as string);
    expect(await bookmarkMetadataValue.get()).toEqual({ b: { tags: ['dev'] } });
    await clearAutoTagLog();
    expect(await autoTagLogValue.get()).toEqual([]);
    expect(await bookmarkMetadataValue.get()).toEqual({ b: { tags: ['dev'] } });
  });
});
