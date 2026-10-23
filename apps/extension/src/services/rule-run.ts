/**
 * Applies a reviewed Smart Rules run (Smart Rules in the Tools sidebar, after its review): the
 * tags first, then the moves. Tags are local metadata and moves are browser bookmark writes, two
 * stores that cannot be written at once, so a run is never reported as one atomic change: the
 * result counts each part, and a part that did not happen is said, never hidden (R42).
 *
 * - **Checked right before:** each bookmark is applied only while it still has the title,
 *   address, and folder the review showed, every rule that matched it is still on with the
 *   version the review saw (`ruleVersion`, R14, R23), and those rules still match it with its
 *   tags and summary as they are now, and would still move it where the review said
 *   (`stillPlanned`). Otherwise it is skipped and counted: deleted or changed since (R24), or its
 *   rule edited, turned off, or deleted (`ruleChanged`). A bookmark already as the review would
 *   leave it (its tags there, in its folder) is `done`, not changed again.
 * - **Tags:** one metadata save. The run is recorded in the rules log (`rule-auto-log.ts`, a `run`
 *   entry): the bookmarks it tagged and its moves' Audit History record, so the tags can be found
 *   and taken back after the toast's Undo is gone. Tags leave no Audit History record of their
 *   own; the log entry is their durable record.
 * - **Moves:** through `applyBookmarkChanges` with `requireRecord` (R25): they never start
 *   without their Audit History record, which `AuditStoreError` reports. Tags still go ahead then,
 *   as for every change that removes nothing.
 * - **In the page or as a background task:** up to the `jobsApplyInBackgroundAbove` setting the run
 *   is applied here at once, with Undo in the notification for both parts. Above it the whole run
 *   (tags and moves) goes to the background as an `applyRules` job, with the rule versions frozen
 *   in its options (R26 to R29): it keeps going when the page closes, takes Pause, Resume, and
 *   Cancel between parts, and after a stopped worker waits for Resume (`uncertain-write`), which
 *   checks each bookmark again, so nothing is tagged or moved twice. Each part records its tags in
 *   the run's log entry before saving them (`recordRuleRunPart`), and its moves are one History
 *   record linked to the task. Turning Smart Rules off pauses the task (`rules-off`); turning a
 *   rule off or editing it skips its bookmarks from the next part on (R36). A run applied here is
 *   at most that many bookmarks and is not stopped halfway.
 *
 * Each run also records each rule's counts and the review's conflicts for Settings
 * (`rule-run-status.ts`). No React here: the background task uses it.
 */

/** Why a reviewed bookmark was left out. */
export type RuleSkipReason =
  /** Deleted since the review. */
  | 'deleted'
  /** Its title, address, or folder changed since the review. */
  | 'changed'
  /** A rule that matched it was edited, turned off, or deleted since the review. */
  | 'ruleChanged'
  /** Already as the review would leave it: nothing to do. */
  | 'done';

/** A reviewed bookmark checked right before applying: what is left to do, or why nothing. */
type CheckedItem =
  | { item: RulePlanItem; skip: RuleSkipReason }
  | { item: RulePlanItem; skip?: undefined; tags: string[]; move: boolean };

/** Why a run's moves did not happen at all. */
export type RuleRunMovesStopped =
  /** Their Audit History record could not be stored, so none was made (fail closed). */
  | { reason: 'noRecord' }
  /** Applying them failed before any was made. */
  | { reason: 'failed'; error: unknown };

export type RuleRunResult = {
  /** Bookmarks that got tags. */
  tagged: number;
  /** Bookmarks moved here. */
  moved: number;
  /**
   * Bookmarks left out, each counted once: deleted, or moved or given another address or title
   * since the review, or a rule of theirs changed (`ruleChanged` of them), so their tags, their
   * move, or both were not applied.
   */
  skipped: number;
  /** Of `skipped`: those left out because a rule that matched them changed. */
  ruleChanged: number;
  /** Bookmarks already as the review would leave them; neither changed nor skipped. */
  already: number;
  /** Moves that failed, or that never ran because of `movesStopped`. */
  failed: number;
  movesStopped?: RuleRunMovesStopped;
  /** The whole run went to a background task (above the Settings count), applied in parts. */
  background?: { job: JobRecord; count: number };
  /** Takes back the tags and the moves made here, once. */
  undo: () => Promise<BookmarkChangesUndoResult>;
  /** When the moves' undo stops working. */
  expiresAt?: number;
  /** The moves' Audit History record. */
  historyId?: string;
  /** The run's entry in the rules log, when it tagged any bookmark. */
  logEntryId?: string;
};

/**
 * The ids of `items` the rules, planned again on the bookmarks as they are now
 * (`planBookmarkRules`), still match with every rule the review saw match, and would still move
 * to the folder the review said. A tag or summary changed since the review can make a rule stop
 * matching (`-tag:read`). The tags the run adds are left out of that check: a part a stopped
 * worker left may have added them already, and a rule such as `is:untagged` must still count.
 */
async function stillPlanned(
  items: readonly RulePlanItem[],
  rules: readonly BookmarkRule[],
  metadata: StoredBookmarkMetadataById,
): Promise<Set<string>> {
  if (items.length === 0) return new Set();
  const asReviewed: StoredBookmarkMetadataById = { ...metadata };
  for (const item of items) {
    const own = metadata[item.id];
    if (!own?.tags) continue;
    const adding = new Set(item.addTags.map(tagKey));
    asReviewed[item.id] = { ...own, tags: own.tags.filter((tag) => !adding.has(tagKey(tag))) };
  }
  const tree = await fetchBookmarkTree();
  const planned = new Map(
    planBookmarkRules(rules, tree, asReviewed, new Set(items.map((item) => item.id))).map(
      (entry) => [entry.id, entry],
    ),
  );
  return new Set(
    items
      .filter((item) => {
        const now = planned.get(item.id);
        if (!now || !item.ruleIds.every((id) => now.ruleIds.includes(id))) return false;
        return item.move === undefined || now.move?.folderId === item.move.folderId;
      })
      .map((item) => item.id),
  );
}

/**
 * Checks each reviewed bookmark against the live bookmark, its metadata, and the rules as they
 * are now (`rules`); see the file header.
 */
async function checkRuleItems(
  items: readonly RulePlanItem[],
  rules: readonly BookmarkRule[],
): Promise<CheckedItem[]> {
  const metadata = await bookmarkMetadataValue.get();
  const live = await Promise.all(items.map((item) => getLiveBookmark(item.id)));
  const checked = items.map((item, index): CheckedItem => {
    if (!rulesUnchanged(rules, item.ruleVersions)) return { item, skip: 'ruleChanged' };
    const node = live[index];
    if (!node) return { item, skip: 'deleted' };
    if (node.url !== item.url || node.title !== item.title) return { item, skip: 'changed' };
    // In the reviewed folder already: the move was made (by a part a stopped worker left).
    const moveDone = item.move !== undefined && node.parentId === item.move.folderId;
    if (!moveDone && node.parentId !== item.parentId) return { item, skip: 'changed' };
    const has = new Set((metadata[item.id]?.tags ?? []).map(tagKey));
    const tags = item.addTags.filter((tag) => !has.has(tagKey(tag)));
    const move = item.move !== undefined && !moveDone;
    if (tags.length === 0 && !move) return { item, skip: 'done' };
    return { item, tags, move };
  });
  // One already in its reviewed folder was moved by an earlier try of this run, which added its
  // tags first: it is not planned again in the folder the run put it in.
  const replanning = checked.flatMap((entry) =>
    !entry.skip && (entry.move || entry.item.move === undefined) ? [entry.item] : [],
  );
  const planned = await stillPlanned(replanning, rules, metadata);
  const replanned = new Set(replanning.map((item) => item.id));
  return checked.map((entry) =>
    entry.skip || !replanned.has(entry.item.id) || planned.has(entry.item.id)
      ? entry
      : { item: entry.item, skip: 'changed' },
  );
}

/** The ready items' moves, each only while the bookmark is still as the review found it. */
function moveChanges(ready: readonly CheckedItem[]): BookmarkChange[] {
  return ready.flatMap((checked) =>
    !checked.skip && checked.move && checked.item.move
      ? [
          {
            kind: 'move' as const,
            id: checked.item.id,
            title: checked.item.title,
            expect: {
              url: checked.item.url,
              title: checked.item.title,
              parentId: checked.item.parentId,
            },
            to: { parentId: checked.item.move.folderId },
          },
        ]
      : [],
  );
}

const TAG_MERGE = { tagMode: 'append', summaryMode: 'replace', dedupeTags: true } as const;

/** What happened to one reviewed bookmark, for the counts by rule. */
type ItemResult = { item: RulePlanItem; tags: readonly string[]; moved: boolean; left: boolean };

/** Each rule's counts in a run: the bookmarks it matched, tagged with its tags, moved, or left. */
function countByRule(results: readonly ItemResult[], rules: readonly BookmarkRule[]) {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const counts: RuleRunCounts = {};
  for (const { item, tags, moved, left } of results) {
    const added = new Set(tags.map(tagKey));
    for (const id of item.ruleIds) {
      const entry = counts[id] ?? { tagged: 0, moved: 0, skipped: 0 };
      counts[id] = entry;
      if (left) entry.skipped += 1;
      if (byId.get(id)?.addTags.some((tag) => added.has(tagKey(tag)))) entry.tagged += 1;
      if (moved && item.move?.ruleId === id) entry.moved += 1;
    }
  }
  return counts;
}

/** Records a run's counts for Settings; a failure only loses the status line. */
function recordCounts(
  results: readonly ItemResult[],
  rules: readonly BookmarkRule[],
  jobId?: string,
): Promise<void> {
  return recordRuleRunCounts(countByRule(results, rules), {
    ruleIds: rules.map((rule) => rule.id),
    ...(jobId ? { jobId } : {}),
  }).catch((error: unknown) => {
    console.warn('[Rules] Run status not recorded:', error);
  });
}

const NOTHING_UNDONE: BookmarkChangesUndoResult = { restored: 0, failed: 0 };

function toRuleRunInput(item: RulePlanItem): RuleRunInput {
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    parentId: item.parentId,
    ruleIds: item.ruleIds,
    addTags: item.addTags,
    ...(item.move ? { move: item.move } : {}),
  };
}

/** Hands the reviewed bookmarks to an `applyRules` background task. */
async function startRuleRunJob(items: readonly RulePlanItem[]): Promise<RuleRunResult> {
  const rules: Record<string, string> = {};
  for (const item of items) Object.assign(rules, item.ruleVersions);
  const response = await sendJobCommand({
    type: 'applyRules',
    // One id per click: the user approved this run once.
    commandId: crypto.randomUUID(),
    source: 'manager',
    rules,
    items: items.map(toRuleRunInput),
  });
  if (!response.ok || !response.job) throw new Error(t('jobs_commandFailed'));
  return {
    tagged: 0,
    moved: 0,
    skipped: 0,
    ruleChanged: 0,
    already: 0,
    failed: 0,
    background: { job: response.job, count: items.length },
    undo: async () => NOTHING_UNDONE,
  };
}

/**
 * Applies the rule changes the review kept (`items`); `plan` is the whole review, whose conflicts
 * Settings lists. See the file header. Never throws for the moves; throws when a background task
 * for a large run cannot start, before anything is changed.
 */
export async function applyRulePlan(
  items: readonly RulePlanItem[],
  plan: readonly RulePlanItem[] = items,
): Promise<RuleRunResult> {
  await fetchBookmarkTree()
    .then((tree) => recordRuleConflicts(plan, tree))
    .catch((error: unknown) => {
      console.warn('[Rules] Conflicts not recorded:', error);
    });
  const changing = items.filter(changesBookmark);
  const { jobsApplyInBackgroundAbove } = await getSettings();
  if (changing.length > jobsApplyInBackgroundAbove) return startRuleRunJob(changing);

  const rules = await bookmarkRulesValue.get();
  const checked = await checkRuleItems(changing, rules);
  const ready = checked.filter((entry) => !entry.skip);
  const tagging = ready.flatMap((entry) =>
    !entry.skip && entry.tags.length > 0 ? [{ id: entry.item.id, tags: entry.tags }] : [],
  );
  const tags =
    tagging.length > 0
      ? await mergeStoredBookmarkMetadataWithUndo(
          Object.fromEntries(tagging.map(({ id, tags: added }) => [id, { tags: added }])),
          TAG_MERGE,
        )
      : { undo: async () => NOTHING_UNDONE };

  const moves = moveChanges(ready);
  let here: BookmarkChangesResult | undefined;
  let movesStopped: RuleRunMovesStopped | undefined;
  if (moves.length > 0) {
    try {
      here = await applyBookmarkChanges(moves, { tool: RULE_RUN_TOOL, requireRecord: true });
    } catch (error) {
      movesStopped =
        error instanceof AuditStoreError ? { reason: 'noRecord' } : { reason: 'failed', error };
    }
  }
  const historyId = here?.recorded?.entry.operationId;
  const moveIssues = new Map((here?.issues ?? []).map((issue) => [issue.id, issue.reason]));

  const logEntryId = await recordRuleRun({
    tagged: tagging.map(({ id, tags: added }) => ({ bookmarkId: id, tags: added })),
    moved: here?.applied ?? 0,
    ...(historyId ? { operationId: historyId } : {}),
  }).catch((error: unknown) => {
    // The tags are saved either way; only the record to undo them later is missing.
    console.warn('[Rules] Run not recorded in the rules log:', error);
    return undefined;
  });

  const skippedIds = new Set<string>();
  let ruleChanged = 0;
  let already = 0;
  const results: ItemResult[] = checked.map((entry) => {
    if (entry.skip === 'done') {
      already += 1;
      return { item: entry.item, tags: [], moved: false, left: false };
    }
    if (entry.skip) {
      skippedIds.add(entry.item.id);
      if (entry.skip === 'ruleChanged') ruleChanged += 1;
      return { item: entry.item, tags: [], moved: false, left: true };
    }
    const issue = moveIssues.get(entry.item.id);
    if (issue && issue !== 'failed') skippedIds.add(entry.item.id);
    const moved = entry.move && here !== undefined && !issue;
    return { item: entry.item, tags: entry.tags, moved, left: entry.move && !moved };
  });
  await recordCounts(results, rules);

  let undone: Promise<BookmarkChangesUndoResult> | undefined;
  const undo = () => {
    undone ??= (async () => {
      const undoneMoves = here ? await here.undo() : NOTHING_UNDONE;
      const undoneTags = await tags.undo();
      if (logEntryId) await dropRuleAutoEntry(logEntryId);
      return {
        ...undoneMoves,
        restored: undoneMoves.restored + undoneTags.restored,
        failed: undoneMoves.failed + undoneTags.failed,
      };
    })();
    return undone;
  };

  return {
    tagged: tagging.length,
    moved: here?.applied ?? 0,
    skipped: skippedIds.size,
    ruleChanged,
    already,
    failed: here ? here.failed : movesStopped ? moves.length : 0,
    ...(movesStopped ? { movesStopped } : {}),
    undo,
    ...(here?.expiresAt !== undefined ? { expiresAt: here.expiresAt } : {}),
    ...(historyId ? { historyId } : {}),
    ...(logEntryId ? { logEntryId } : {}),
  };
}

/** What one reviewed bookmark of a background task's part came to. */
export type RulePartOutcome = {
  outcome: 'succeeded' | 'skipped' | 'failed';
  result: { id: string; title: string; reason?: RuleSkipReason | 'failed' };
};

/**
 * Applies one part of a background task's reviewed run (`applyRules`): checks each bookmark again,
 * records the tags it is about to add in the run's log entry, saves them, then makes the moves as
 * one History record of the part. Returns each item's outcome in order. A bookmark found already
 * done (by a part a stopped worker left) succeeds without being changed again, so it is counted
 * once. Throws when the moves cannot get their Audit History record (nothing moved); Resume then
 * applies the part again, which adds no tag twice.
 */
export async function applyRuleRunPart(
  inputs: readonly RuleRunInput[],
  versions: Readonly<Record<string, string>>,
  part: JobPart,
): Promise<RulePartOutcome[]> {
  const rules = await bookmarkRulesValue.get();
  const items: RulePlanItem[] = inputs.map((input) => ({
    ...input,
    folderPath: '',
    conflicts: [],
    ruleVersions: Object.fromEntries(input.ruleIds.map((id) => [id, versions[id] ?? ''])),
  }));
  const checked = await checkRuleItems(items, rules);
  const ready = checked.filter((entry) => !entry.skip);
  const tagging = ready.flatMap((entry) =>
    !entry.skip && entry.tags.length > 0 ? [{ bookmarkId: entry.item.id, tags: entry.tags }] : [],
  );
  if (tagging.length > 0) {
    // The record first: a worker stopped after it leaves no tag without its Undo.
    await recordRuleRunPart(part.jobId, { tagged: tagging });
    await mergeStoredBookmarkMetadata(
      Object.fromEntries(tagging.map(({ bookmarkId, tags }) => [bookmarkId, { tags }])),
      TAG_MERGE,
    );
  }
  const moves = moveChanges(ready);
  const applied =
    moves.length > 0
      ? await applyBookmarkChanges(moves, { tool: RULE_RUN_TOOL, part, requireRecord: true })
      : undefined;
  if (applied && applied.applied > 0) {
    await recordRuleRunPart(part.jobId, { moved: applied.applied });
  }
  const issues = new Map((applied?.issues ?? []).map((issue) => [issue.id, issue.reason]));

  const outcomes: RulePartOutcome[] = [];
  const results: ItemResult[] = [];
  for (const entry of checked) {
    const base = { id: entry.item.id, title: entry.item.title };
    if (entry.skip === 'done') {
      outcomes.push({ outcome: 'succeeded', result: { ...base, reason: 'done' } });
      results.push({ item: entry.item, tags: [], moved: false, left: false });
      continue;
    }
    if (entry.skip) {
      outcomes.push({ outcome: 'skipped', result: { ...base, reason: entry.skip } });
      results.push({ item: entry.item, tags: [], moved: false, left: true });
      continue;
    }
    const issue = entry.move ? issues.get(entry.item.id) : undefined;
    results.push({
      item: entry.item,
      tags: entry.tags,
      moved: entry.move && !issue,
      left: !!issue,
    });
    if (!issue) outcomes.push({ outcome: 'succeeded', result: base });
    else if (issue === 'failed')
      outcomes.push({ outcome: 'failed', result: { ...base, reason: issue } });
    else outcomes.push({ outcome: 'skipped', result: { ...base, reason: issue } });
  }
  await recordCounts(results, rules, part.jobId);
  return outcomes;
}
