/**
 * Applies changes the user reviewed in a page. Up to the Settings count (`jobsApplyInBackgroundAbove`)
 * they are applied here at once, with Undo in the notification. Above it they go to the
 * background as an `applyChanges` job, which applies them in parts with the same writer, so
 * closing the page does not stop them halfway; each part is one change in the History.
 *
 * Changes with a `check` (code, which cannot be stored) are always applied here.
 */

/** Applied here, with the writer's result; or handed to a background job. */
export type ReviewedApply =
  | { background: false; result: BookmarkChangesResult }
  | { background: true; job: JobRecord; count: number };

/** The stored form of a change: its data, without `check`. */
function toStoredChange(change: BookmarkChange): StoredBookmarkChange {
  const { check: _code, ...data } = change;
  return storedBookmarkChangeSchema.parse(
    data.kind === 'move' && data.to.createPath
      ? { ...data, to: { ...data.to, createPath: [...data.to.createPath] } }
      : data,
  );
}

export async function applyReviewedChanges(
  changes: readonly BookmarkChange[],
  { tool, requireRecord = false }: { tool: string; requireRecord?: boolean },
): Promise<ReviewedApply> {
  const { jobsApplyInBackgroundAbove } = await getSettings();
  const storable = changes.every((change) => change.check === undefined);
  if (changes.length <= jobsApplyInBackgroundAbove || !storable) {
    return {
      background: false,
      result: await applyBookmarkChanges(changes, { tool, requireRecord }),
    };
  }
  const response = await sendJobCommand({
    type: 'apply',
    // One id per click: the user approved this set once.
    commandId: crypto.randomUUID(),
    source: 'manager',
    tool,
    ...(requireRecord ? { requireRecord } : {}),
    changes: changes.map(toStoredChange),
  });
  if (!response.ok || !response.job) throw new Error(t('jobs_commandFailed'));
  return { background: true, job: response.job, count: changes.length };
}
