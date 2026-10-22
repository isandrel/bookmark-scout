/**
 * What Tag New Bookmarks did lately (`rule-auto-tag.ts`): each bookmark it tagged, the tags it
 * added, and when, newest first and at most `[auto_tag] log_max`, so Settings can list them and
 * undo one. Tags live apart from the bookmarks, so the History of bookmark changes never shows
 * them; this list is where an automatic change can be found and taken back.
 */
import { z } from 'zod';

const autoTagEntrySchema = z.strictObject({
  id: z.string().min(1),
  bookmarkId: z.string().min(1),
  title: z.string(),
  tags: z.array(z.string().min(1)).min(1),
  at: z.number().finite(),
});

export type AutoTagEntry = z.infer<typeof autoTagEntrySchema>;

/** Newest first. */
export const autoTagLogValue = defineStoredValue<AutoTagEntry[]>(STORAGE_ITEMS.autoTagLog, {
  schema: z.array(autoTagEntrySchema),
  empty: [],
  isEmpty: (entries) => entries.length === 0,
});

/** Adds what one batch tagged, newest first, keeping the most recent `log_max`. */
export function recordAutoTags(
  entries: readonly Omit<AutoTagEntry, 'id' | 'at'>[],
): Promise<unknown> {
  if (entries.length === 0) return Promise.resolve();
  const at = Date.now();
  const added = entries.map((entry) => ({ ...entry, id: crypto.randomUUID(), at }));
  return autoTagLogValue.update((current) =>
    [...added, ...current].slice(0, BOOKMARK_RULE_LIMITS.auto_tag.log_max),
  );
}

/**
 * Takes back one automatic tagging: removes its tags from the bookmark where they still are (a
 * tag removed or renamed since is left alone), then drops the entry. Returns how many tags were
 * removed.
 */
export async function undoAutoTag(entryId: string): Promise<number> {
  const entry = (await autoTagLogValue.get()).find((item) => item.id === entryId);
  let removed = 0;
  if (entry) {
    const keys = new Set(entry.tags.map(tagKey));
    await bookmarkMetadataValue.update((current) => {
      const existing = current[entry.bookmarkId];
      if (!existing?.tags) return current;
      const tags = existing.tags.filter((tag) => !keys.has(tagKey(tag)));
      removed = existing.tags.length - tags.length;
      const next = { ...current };
      if (tags.length > 0 || existing.summary) next[entry.bookmarkId] = { ...existing, tags };
      else delete next[entry.bookmarkId];
      return next;
    });
  }
  await autoTagLogValue.update((current) => current.filter((item) => item.id !== entryId));
  return removed;
}

/** Empties the list; tags already added stay. */
export function clearAutoTagLog(): Promise<unknown> {
  return autoTagLogValue.set([]);
}
