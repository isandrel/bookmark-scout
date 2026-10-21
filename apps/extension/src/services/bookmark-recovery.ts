/**
 * Brings back items a recorded change removed, from its recovery points
 * (`lib/bookmark-audit-store.ts`), after the session's undo is gone (the toast expired, the
 * browser restarted). The items come back with their contents, titles, addresses, tags, and
 * summaries, as one new change linked to the original, so it is recorded and can itself be
 * undone with Ctrl+Z. The browser gives them new ids and dates.
 *
 * Nothing is put somewhere else on its own: an item whose folder no longer exists is left out
 * and reported. A change already undone, or being restored from another tab right now, is not
 * restored again. No React here.
 */

export type RecoveryOutcome = {
  /** Items brought back (top-level items; their contents come with them). */
  restored: number;
  /** Items left out because the folder they were in no longer exists. */
  parentMissing: number;
  /** Nothing was done: the change was undone or restored already. */
  alreadyUndone?: boolean;
};

/** Whether `id` is still a folder. */
async function isFolder(id: string): Promise<boolean> {
  const folder = await getBookmark(id).catch(() => undefined);
  return folder !== undefined && !folder.url;
}

/** Recreates `node` and everything inside it through `writer`, tags and summaries included. */
async function recreate(
  writer: BookmarkWriter,
  node: RecoverableBookmarkNode,
  parentId: string,
  index?: number,
): Promise<void> {
  const created = await writer.create({
    parentId,
    ...(index === undefined ? {} : { index }),
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    ...(node.type ? { type: node.type } : {}),
    ...(node.metadata ? { metadata: node.metadata } : {}),
  });
  for (const child of node.children ?? []) await recreate(writer, child, created.id);
}

/** Where to put an item back: next to a sibling that is still there, else its old position. */
async function restoreIndex(at: RecoveryCheckpoint['at']): Promise<number> {
  const siblings = await getBookmarkChildren(at.parentId);
  const previous = at.previousId
    ? siblings.findIndex((sibling) => sibling.id === at.previousId)
    : -1;
  if (previous >= 0) return previous + 1;
  const next = at.nextId ? siblings.findIndex((sibling) => sibling.id === at.nextId) : -1;
  if (next >= 0) return next;
  return Math.min(at.index, siblings.length);
}

async function restore(operation: AuditOperation): Promise<RecoveryOutcome> {
  const current = await getAuditOperation(operation.id);
  if (!current || current.undo) return { restored: 0, parentMissing: 0, alreadyUndone: true };
  // In removal order, so items that sat next to each other come back in that order.
  const checkpoints = await getRecoveryCheckpoints(operation.id);
  const outcome: RecoveryOutcome = { restored: 0, parentMissing: 0 };
  const missing: { id: string; title: string }[] = [];
  const { action, ...label } = current.label;
  const { recorded } = await recordBookmarkWrites(
    // An import's label reads as an addition in the undo history.
    { ...label, action: action === 'import' ? 'add' : action },
    async (writer) => {
      for (const checkpoint of [...checkpoints].sort((a, b) => a.at.index - b.at.index)) {
        if (!(await isFolder(checkpoint.at.parentId))) {
          outcome.parentMissing += 1;
          missing.push({ id: checkpoint.node.id ?? '', title: checkpoint.node.title });
          continue;
        }
        await recreate(
          writer,
          checkpoint.node,
          checkpoint.at.parentId,
          await restoreIndex(checkpoint.at),
        );
        outcome.restored += 1;
      }
    },
    {
      replay: 'undo',
      relatedOperationId: operation.id,
      report: () => ({
        planned: checkpoints.length,
        skipped: missing.map((item) => ({ ...item, reason: 'parent_missing', failed: false })),
      }),
    },
  );
  const restoreId = recorded?.entry.operationId;
  if (restoreId) {
    await markAuditOperationUndone(operation.id, restoreId, outcome.parentMissing === 0);
  }
  return outcome;
}

/**
 * Restores the items `operation` removed. One restore at a time per change, across every page
 * (Web Locks), so two tabs never bring the same items back twice.
 */
export async function restoreFromCheckpoints(operation: AuditOperation): Promise<RecoveryOutcome> {
  const locks = globalThis.navigator?.locks;
  if (!locks) return restore(operation);
  return locks.request(`bookmark-scout:recovery:${operation.id}`, () => restore(operation));
}
