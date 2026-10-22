/**
 * What Smart Rules did on their own lately (`rule-automation.ts`): each bookmark Tag New
 * Bookmarks tagged, with the tags, and each bookmark Move New Bookmarks moved, with where from and
 * to, newest first and at most `[automatic] log_max`, so Settings can list them and undo one.
 * Tags live apart from the bookmarks, so the History of bookmark changes never shows them; moves
 * are in the History too (one record per batch), and this list is where either can be found and
 * taken back. Undoing a move is in `rule-automation.ts`, which writes bookmarks.
 *
 * The storage key still says tags: it held only taggings before moves were added, and keeping it
 * keeps the list across the update. Entries stored then have no `kind` and read as taggings.
 */
import { z } from 'zod';

const placeSchema = z.strictObject({
  parentId: z.string().min(1),
  index: z.number().int().nonnegative(),
});

const tagEntrySchema = z
  .strictObject({
    id: z.string().min(1),
    kind: z.literal('tag').optional(),
    bookmarkId: z.string().min(1),
    title: z.string(),
    tags: z.array(z.string().min(1)).min(1),
    at: z.number().finite(),
  })
  .transform((entry) => ({ ...entry, kind: 'tag' as const }));

const moveEntrySchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal('move'),
  bookmarkId: z.string().min(1),
  title: z.string(),
  /** Where it was before the move, to put it back. */
  from: placeSchema,
  /** The rule's folder it was moved to, with its path as shown then. */
  to: z.strictObject({ folderId: z.string().min(1), path: z.string() }),
  /** The move's Audit History record, which an undo is linked to. */
  operationId: z.string().min(1).optional(),
  at: z.number().finite(),
});

const ruleAutoEntrySchema = z.union([tagEntrySchema, moveEntrySchema]);

export type RuleAutoEntry = z.infer<typeof ruleAutoEntrySchema>;
export type RuleAutoTagEntry = Extract<RuleAutoEntry, { kind: 'tag' }>;
export type RuleAutoMoveEntry = Extract<RuleAutoEntry, { kind: 'move' }>;

/** Newest first. One malformed entry is dropped alone. */
export const ruleAutoLogValue = defineStoredValue<RuleAutoEntry[]>(STORAGE_ITEMS.ruleAutoLog, {
  parse: (raw) => parseValidList(raw, ruleAutoEntrySchema),
  empty: [],
  isEmpty: (entries) => entries.length === 0,
});

type NewEntry<T> = T extends RuleAutoEntry ? Omit<T, 'id' | 'at'> : never;

/** Adds what one batch did, newest first, keeping the most recent `log_max`. */
export function recordRuleAutoChanges(
  entries: readonly NewEntry<RuleAutoEntry>[],
): Promise<unknown> {
  if (entries.length === 0) return Promise.resolve();
  const at = Date.now();
  const added = entries.map((entry) => ({ ...entry, id: crypto.randomUUID(), at }));
  return ruleAutoLogValue.update((current) =>
    [...added, ...current].slice(0, BOOKMARK_RULE_LIMITS.automatic.log_max),
  );
}

/** One entry, if it is still listed. */
export async function getRuleAutoEntry(entryId: string): Promise<RuleAutoEntry | undefined> {
  return (await ruleAutoLogValue.get()).find((item) => item.id === entryId);
}

/** Drops one entry from the list; what it did stays. */
export function dropRuleAutoEntry(entryId: string): Promise<unknown> {
  return ruleAutoLogValue.update((current) => current.filter((item) => item.id !== entryId));
}

/**
 * Takes back one automatic tagging: removes its tags from the bookmark where they still are (a
 * tag removed or renamed since is left alone), then drops the entry. Returns how many tags were
 * removed.
 */
export async function undoAutoTag(entry: RuleAutoTagEntry): Promise<number> {
  const keys = new Set(entry.tags.map(tagKey));
  let removed = 0;
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
  await dropRuleAutoEntry(entry.id);
  return removed;
}

/** Empties the list; the tags and moves it lists stay. */
export function clearRuleAutoLog(): Promise<unknown> {
  return ruleAutoLogValue.set([]);
}
