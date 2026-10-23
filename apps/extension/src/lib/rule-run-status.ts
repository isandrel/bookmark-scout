/**
 * How Smart Rules did in the last reviewed run, for Settings (`BookmarkRulesPanel`):
 *
 * - **Each rule's last run:** when, and how many bookmarks it tagged, moved, and left out
 *   (skipped or failed) in it. A run applied by a background task in parts (`jobId`) adds each
 *   part to the same counts.
 * - **Conflicts:** the bookmarks that run found two rules disagreeing on (each would move it to
 *   another folder), at most `[runs] conflicts_max`, with the folders the rules named, so the user
 *   can review them where they are. A run's review leaves them out until the user picks a folder.
 *
 * A bookmark is counted under every rule that matched it. No React here: the background task
 * records its parts too.
 */
import { z } from 'zod';

const count = z.number().int().nonnegative();

const ruleStatusSchema = z.strictObject({
  at: z.number().finite(),
  tagged: count,
  moved: count,
  /** Bookmarks it matched that the run left out: changed since the review, or failed. */
  skipped: count,
  /** The background task applying the run, whose parts add to these counts. */
  jobId: z.string().min(1).optional(),
});

const conflictSchema = z.strictObject({
  bookmarkId: z.string().min(1),
  title: z.string(),
  /** The folder it is in, which the link to review it opens. */
  parentId: z.string().min(1),
  /** The folders the rules would move it to, as their paths were shown. */
  paths: z.array(z.string()).min(1),
});

const conflictsSchema = z.strictObject({
  at: z.number().finite(),
  items: z.array(conflictSchema),
  /** Conflicts past `[runs] conflicts_max`, only counted. */
  more: count,
});

export type RuleRunStatus = z.infer<typeof ruleStatusSchema>;
export type RuleConflict = z.infer<typeof conflictSchema>;
export type RuleRunStatuses = {
  /** By rule id. */
  rules: Record<string, RuleRunStatus>;
  conflicts?: z.infer<typeof conflictsSchema>;
};

/** Counts of one run, by rule id. */
export type RuleRunCounts = Record<string, Omit<RuleRunStatus, 'at' | 'jobId'>>;

export const ruleRunStatusValue = defineStoredValue<RuleRunStatuses>(STORAGE_ITEMS.ruleRunStatus, {
  // One malformed rule's status is dropped alone.
  parse: (raw) => {
    const value = isPlainObject(raw) ? raw : {};
    const conflicts = conflictsSchema.safeParse(value.conflicts);
    return {
      rules: parseValidRecord(value.rules, ruleStatusSchema),
      ...(conflicts.success ? { conflicts: conflicts.data } : {}),
    };
  },
  empty: { rules: {} },
  isEmpty: (value) => Object.keys(value.rules).length === 0 && !value.conflicts,
});

/**
 * Records one run's counts by rule (or one part of a background task's run, `jobId`, added to its
 * earlier parts). Statuses of rules no longer in `ruleIds` are dropped.
 */
export async function recordRuleRunCounts(
  counts: RuleRunCounts,
  { ruleIds, jobId }: { ruleIds: readonly string[]; jobId?: string },
): Promise<void> {
  const at = Date.now();
  const kept = new Set(ruleIds);
  await ruleRunStatusValue.update((current) => {
    const rules = Object.fromEntries(
      Object.entries(current.rules).filter(([id]) => kept.has(id)),
    ) as Record<string, RuleRunStatus>;
    for (const [id, added] of Object.entries(counts)) {
      if (!kept.has(id)) continue;
      const earlier = rules[id];
      const samePart = jobId !== undefined && earlier?.jobId === jobId;
      rules[id] = {
        at: samePart ? earlier.at : at,
        tagged: added.tagged + (samePart ? earlier.tagged : 0),
        moved: added.moved + (samePart ? earlier.moved : 0),
        skipped: added.skipped + (samePart ? earlier.skipped : 0),
        ...(jobId ? { jobId } : {}),
      };
    }
    return { ...current, rules };
  });
}

/**
 * Records the bookmarks a run's review found two rules disagreeing on, in place of the last
 * run's. `plan` is the whole review, not only what the user applied.
 */
export async function recordRuleConflicts(plan: readonly RulePlanItem[]): Promise<void> {
  const max = BOOKMARK_RULE_LIMITS.runs.conflicts_max;
  const conflicting = plan.filter((item) => item.conflicts.length > 0);
  const items = conflicting.slice(0, max).map((item) => ({
    bookmarkId: item.id,
    title: item.title,
    parentId: item.parentId,
    paths: [
      ...new Set([
        ...(item.move ? [item.move.path] : item.blocked ? [] : [item.folderPath]),
        ...item.conflicts.map((conflict) => conflict.path),
      ]),
    ],
  }));
  await ruleRunStatusValue.update((current) => ({
    ...current,
    conflicts: {
      at: Date.now(),
      items,
      more: Math.max(0, conflicting.length - max),
    },
  }));
}
