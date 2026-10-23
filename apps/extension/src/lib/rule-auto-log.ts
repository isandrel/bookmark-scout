/**
 * What Smart Rules changed lately, for Settings to list and undo (Changed by rules), newest first
 * and at most `[automatic] log_max` entries:
 *
 * - each bookmark Tag New Bookmarks tagged, with the tags (`tag`), and each bookmark Move New
 *   Bookmarks moved, with where from and to (`move`), from `rule-automation.ts`;
 * - each reviewed run from the Tools sidebar that added tags (`run`, `rule-run.ts`): the
 *   bookmarks it tagged, grouped by the tags added, how many it moved, and its moves' Audit
 *   History record, which links the two. A large run is applied by a background task in parts
 *   (`jobId`); each part adds to the run's one entry (`recordRuleRunPart`), its tags before it
 *   saves them.
 *
 * Tags live apart from the bookmarks, so the History of bookmark changes never shows them: this
 * list is their durable record, and its Undo takes them back where they still are. Moves are in
 * the History too (one record per batch or run). Undoing an automatic move is in
 * `rule-automation.ts`, which writes bookmarks; a run's moves are undone from the History.
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

const runEntrySchema = z.strictObject({
  id: z.string().min(1),
  kind: z.literal('run'),
  /**
   * The tags it added, each group to its bookmarks, by id. Empty only for a run applied by a
   * background task that has moved bookmarks but not tagged any yet.
   */
  tagged: z.array(
    z.strictObject({
      tags: z.array(z.string().min(1)).min(1),
      bookmarkIds: z.array(z.string().min(1)).min(1),
    }),
  ),
  /** Bookmarks it tagged past `[runs] log_max_bookmarks`, not listed: Undo leaves their tags. */
  omitted: z.number().int().nonnegative(),
  /** How many bookmarks it moved, or handed to a background task to move. */
  moved: z.number().int().nonnegative(),
  /** Its moves' Audit History record. */
  operationId: z.string().min(1).optional(),
  /** The background task moving them, whose parts each have their own record. */
  jobId: z.string().min(1).optional(),
  at: z.number().finite(),
});

const ruleAutoEntrySchema = z.union([tagEntrySchema, moveEntrySchema, runEntrySchema]);

export type RuleAutoEntry = z.infer<typeof ruleAutoEntrySchema>;
export type RuleAutoTagEntry = Extract<RuleAutoEntry, { kind: 'tag' }>;
export type RuleAutoMoveEntry = Extract<RuleAutoEntry, { kind: 'move' }>;
export type RuleRunEntry = Extract<RuleAutoEntry, { kind: 'run' }>;

/** Newest first. One malformed entry is dropped alone. */
export const ruleAutoLogValue = defineStoredValue<RuleAutoEntry[]>(STORAGE_ITEMS.ruleAutoLog, {
  parse: (raw) => parseValidList(raw, ruleAutoEntrySchema),
  empty: [],
  isEmpty: (entries) => entries.length === 0,
});

type NewEntry<T> = T extends RuleAutoEntry ? Omit<T, 'id' | 'at'> : never;

/**
 * Adds what one batch or run did, newest first, keeping the most recent `log_max`. Resolves to
 * the new entries' ids, in order.
 */
export async function recordRuleAutoChanges(
  entries: readonly NewEntry<RuleAutoEntry>[],
): Promise<string[]> {
  if (entries.length === 0) return [];
  const at = Date.now();
  const added = entries.map((entry) => ({ ...entry, id: crypto.randomUUID(), at }));
  await ruleAutoLogValue.update((current) =>
    [...added, ...current].slice(0, BOOKMARK_RULE_LIMITS.automatic.log_max),
  );
  return added.map((entry) => entry.id);
}

/** A run that tagged bookmarks, as its entry: each set of tags with the bookmarks that got it. */
export type RuleRunTagging = { bookmarkId: string; tags: readonly string[] };

/**
 * Records a reviewed run that added tags; resolves to its entry's id. Bookmarks past
 * `[runs] log_max_bookmarks` are only counted. Nothing is recorded when it tagged none.
 */
export async function recordRuleRun({
  tagged,
  moved,
  operationId,
}: {
  tagged: readonly RuleRunTagging[];
  moved: number;
  operationId?: string;
}): Promise<string | undefined> {
  if (tagged.length === 0) return undefined;
  const listed = tagged.slice(0, BOOKMARK_RULE_LIMITS.runs.log_max_bookmarks);
  const [id] = await recordRuleAutoChanges([
    {
      kind: 'run',
      tagged: groupTagged([], listed),
      omitted: tagged.length - listed.length,
      moved,
      ...(operationId ? { operationId } : {}),
    },
  ]);
  return id;
}

/** `tagged` as entry groups, each set of tags with its bookmarks, in the order first seen. */
function groupTagged(
  groups: readonly { tags: string[]; bookmarkIds: string[] }[],
  tagged: readonly RuleRunTagging[],
): { tags: string[]; bookmarkIds: string[] }[] {
  const byTags = new Map(
    groups.map((group) => [
      JSON.stringify(group.tags),
      { ...group, bookmarkIds: [...group.bookmarkIds] },
    ]),
  );
  for (const { bookmarkId, tags } of tagged) {
    const key = JSON.stringify(tags);
    const group = byTags.get(key) ?? { tags: [...tags], bookmarkIds: [] };
    if (!group.bookmarkIds.includes(bookmarkId)) group.bookmarkIds.push(bookmarkId);
    byTags.set(key, group);
  }
  return [...byTags.values()];
}

/**
 * Adds what one part of a background task applying a reviewed run did (`jobId`) to that run's
 * entry, creating it at the top when it is not listed (the first part, or after Clear list). The
 * tags are recorded before they are saved, so a stopped worker never leaves tags it added without
 * the record that takes them back; Undo removes a tag only where it is. Bookmarks past
 * `[runs] log_max_bookmarks` are only counted.
 */
export async function recordRuleRunPart(
  jobId: string,
  { tagged = [], moved = 0 }: { tagged?: readonly RuleRunTagging[]; moved?: number },
): Promise<void> {
  if (tagged.length === 0 && moved === 0) return;
  const max = BOOKMARK_RULE_LIMITS.runs.log_max_bookmarks;
  await ruleAutoLogValue.update((current) => {
    const index = current.findIndex((entry) => entry.kind === 'run' && entry.jobId === jobId);
    const existing = index === -1 ? undefined : (current[index] as RuleRunEntry);
    const listed = existing
      ? existing.tagged.reduce((sum, group) => sum + group.bookmarkIds.length, 0)
      : 0;
    const room = Math.max(0, max - listed);
    const entry: RuleRunEntry = {
      id: existing?.id ?? crypto.randomUUID(),
      kind: 'run',
      tagged: groupTagged(existing?.tagged ?? [], tagged.slice(0, room)),
      omitted: (existing?.omitted ?? 0) + Math.max(0, tagged.length - room),
      moved: (existing?.moved ?? 0) + moved,
      jobId,
      at: existing?.at ?? Date.now(),
    };
    if (!existing) {
      return [entry, ...current].slice(0, BOOKMARK_RULE_LIMITS.automatic.log_max);
    }
    return current.map((item, position) => (position === index ? entry : item));
  });
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
  const removed = await removeTags([{ tags: entry.tags, bookmarkIds: [entry.bookmarkId] }]);
  await dropRuleAutoEntry(entry.id);
  return removed.tags;
}

/**
 * Takes back the tags a reviewed run added, where they still are, then drops the entry. Resolves
 * to how many bookmarks lost tags. Its moves stay: they are undone from the History.
 */
export async function undoRuleRunTags(entry: RuleRunEntry): Promise<number> {
  const removed = await removeTags(entry.tagged);
  await dropRuleAutoEntry(entry.id);
  return removed.bookmarks;
}

/**
 * Removes each group's tags from its bookmarks, compared by `tagKey`; a tag removed or renamed
 * since is left alone, and so are the bookmark's other tags. A bookmark left with no tags and no
 * summary loses its entry. Counts the tags removed and the bookmarks that lost any.
 */
async function removeTags(
  groups: readonly { tags: readonly string[]; bookmarkIds: readonly string[] }[],
): Promise<{ tags: number; bookmarks: number }> {
  const removed = { tags: 0, bookmarks: 0 };
  await bookmarkMetadataValue.update((current) => {
    removed.tags = 0;
    removed.bookmarks = 0;
    const next = { ...current };
    for (const group of groups) {
      const keys = new Set(group.tags.map(tagKey));
      for (const id of group.bookmarkIds) {
        const existing = next[id];
        if (!existing?.tags) continue;
        const tags = existing.tags.filter((tag) => !keys.has(tagKey(tag)));
        if (tags.length === existing.tags.length) continue;
        removed.tags += existing.tags.length - tags.length;
        removed.bookmarks += 1;
        if (tags.length > 0 || existing.summary) next[id] = { ...existing, tags };
        else delete next[id];
      }
    }
    return next;
  });
  return removed;
}

/** Empties the list; the tags and moves it lists stay. */
export function clearRuleAutoLog(): Promise<unknown> {
  return ruleAutoLogValue.set([]);
}
