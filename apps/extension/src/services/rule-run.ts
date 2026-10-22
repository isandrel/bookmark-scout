/**
 * Applies a reviewed Smart Rules run (Smart Rules in the Tools sidebar, after its review): the
 * tags first, then the moves. Tags are local metadata and moves are browser bookmark writes, two
 * stores that cannot be written at once, so a run is never reported as one atomic change: the
 * result counts each part, and a part that did not happen is said, never hidden (R42).
 *
 * - **Tags:** one metadata save, each bookmark only while it still has the reviewed address (a
 *   bookmark deleted or changed since is skipped and counted, R24). The run is then recorded in
 *   the rules log (`rule-auto-log.ts`, a `run` entry): the bookmarks it tagged and its moves'
 *   Audit History record or background task, so the tags can be found and taken back after the
 *   toast's Undo is gone. Tags are stored apart from the bookmarks and leave no Audit History
 *   record of their own; the log entry is their durable record.
 * - **Moves:** through `applyReviewedChanges` with `requireRecord` (R25): they never start
 *   without their Audit History record, which `AuditStoreError` reports. Tags still go ahead then,
 *   as for every change that removes nothing: they change no bookmark and keep their own record in
 *   the log. Each move re-checks the bookmark first (still where the review found it, same
 *   address), so one moved or deleted since is skipped.
 *
 * Undo takes back both parts once: the moves (one History entry, shared with Ctrl+Z) and the tags
 * still as the run left them, and drops the log entry. No React here.
 */

/** The History's name for a reviewed run's moves: the tool's title. */
export const RULE_RUN_TOOL = 'tools_bookmarkRules' satisfies MessageKey;

/** Why a run's moves did not happen at all. */
export type RuleRunMovesStopped =
  /** Their Audit History record could not be stored, so none was made (fail closed). */
  | { reason: 'noRecord' }
  /** Applying them failed before any was made, such as the background task not starting. */
  | { reason: 'failed'; error: unknown };

export type RuleRunResult = {
  /** Bookmarks that got tags. */
  tagged: number;
  /** Bookmarks moved here; or, with `background`, handed to the background task. */
  moved: number;
  /**
   * Bookmarks left out, each counted once: deleted, or moved or given another address since the
   * review, so their tags, their move, or both were not applied.
   */
  skipped: number;
  /** Moves that failed, or that never ran because of `movesStopped`. */
  failed: number;
  movesStopped?: RuleRunMovesStopped;
  /** The moves went to a background task (above the Settings count), which applies them in parts. */
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
 * The moves of reviewed plan items as bookmark changes, each only while the bookmark is still
 * where the plan found it, with the same address.
 */
export function getRuleMoveChanges(items: readonly RulePlanItem[]): BookmarkChange[] {
  return items.flatMap((item) =>
    item.move
      ? [
          {
            kind: 'move' as const,
            id: item.id,
            title: item.title,
            expect: { url: item.url, parentId: item.parentId },
            to: { parentId: item.move.folderId },
          },
        ]
      : [],
  );
}

const NOTHING_UNDONE: BookmarkChangesUndoResult = { restored: 0, failed: 0 };

/** Applies the rule changes the review kept; see the file header. Never throws for the moves. */
export async function applyRulePlan(items: readonly RulePlanItem[]): Promise<RuleRunResult> {
  const tagging = items.filter((item) => item.addTags.length > 0);
  const tags = await saveReviewedBookmarkMetadata(
    tagging.map((item) => ({ bookmarkId: item.id, url: item.url, tags: item.addTags })),
    (item) => ({ tags: item.tags }),
    { tagMode: 'append', summaryMode: 'replace', dedupeTags: true },
  );

  const moves = getRuleMoveChanges(items);
  let applied: ReviewedApply | undefined;
  let movesStopped: RuleRunMovesStopped | undefined;
  if (moves.length > 0) {
    try {
      applied = await applyReviewedChanges(moves, { tool: RULE_RUN_TOOL, requireRecord: true });
    } catch (error) {
      movesStopped =
        error instanceof AuditStoreError ? { reason: 'noRecord' } : { reason: 'failed', error };
    }
  }
  const here = applied && !applied.background ? applied.result : undefined;
  const background = applied?.background ? { job: applied.job, count: applied.count } : undefined;
  const historyId = here?.recorded?.entry.operationId;

  const saved = new Set(tags.savedIds);
  const skipped = new Set(tagging.filter((item) => !saved.has(item.id)).map((item) => item.id));
  for (const issue of here?.issues ?? []) if (issue.reason !== 'failed') skipped.add(issue.id);
  const logEntryId = await recordRuleRun({
    tagged: tagging
      .filter((item) => saved.has(item.id))
      .map((item) => ({ bookmarkId: item.id, tags: item.addTags })),
    moved: here?.applied ?? background?.count ?? 0,
    ...(historyId ? { operationId: historyId } : {}),
    ...(background ? { jobId: background.job.id } : {}),
  }).catch((error: unknown) => {
    // The tags are saved either way; only the record to undo them later is missing.
    console.warn('[Rules] Run not recorded in the rules log:', error);
    return undefined;
  });

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
    tagged: tags.saved,
    moved: here?.applied ?? background?.count ?? 0,
    skipped: skipped.size,
    failed: here ? here.failed : movesStopped ? moves.length : 0,
    ...(movesStopped ? { movesStopped } : {}),
    ...(background ? { background } : {}),
    undo,
    ...(here?.expiresAt !== undefined ? { expiresAt: here.expiresAt } : {}),
    ...(historyId ? { historyId } : {}),
    ...(logEntryId ? { logEntryId } : {}),
  };
}
