/**
 * Records each change Bookmark Scout makes to bookmarks in the Audit History
 * (`lib/bookmark-audit-store.ts`), around the one writer every change goes through
 * (`recordBookmarkWrites` in `bookmark-history.ts`):
 *
 * 1. `beginAuditOperation` reserves a `prepared` record and reads it back before the first write.
 *    A change that removes bookmarks does not start when that fails (fail closed); others go on
 *    without a record and say so in the console.
 * 2. The change runs; the writer notes each operation.
 * 3. `finishAuditOperation` reads every touched bookmark again, compares it with what the
 *    operation meant to leave (verification), and stores the outcome: `verified_success` only
 *    when everything planned was done and reads back as intended.
 *
 * A `prepared` record left behind (a page closed or the background stopped mid-change) shows as
 * needing review once `interrupted_after_ms` passed; nothing is replayed automatically.
 *
 * Where a change came from is known because the extension made it: the page's surface (from its
 * address), or what the caller names (a tool, Ask AI, a local agent). No React here.
 */

/** What starting a record needs; everything but the label has a default. */
export type AuditInit = {
  label: AuditLabel;
  source?: AuditSource;
  actor?: AuditActor;
  /** An agent's own name for itself, unverified. */
  actorLabel?: string;
  /** The record this one undoes or redoes. */
  relatedOperationId?: string;
};

/** Extension pages and the surface their changes come from, by file name. */
const PAGE_SOURCES: Record<string, AuditSource> = {
  'bookmarks.html': 'manager',
  'popup.html': 'popup',
  'sidepanel.html': 'sidepanel',
  'options.html': 'options',
};

/** The surface this code runs in: a page by its address, or the background. */
export function currentAuditSource(): AuditSource {
  const page = globalThis.location?.pathname.split('/').pop() ?? '';
  return PAGE_SOURCES[page] ?? 'background';
}

function newOperationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/**
 * Reserves a `prepared` record and reads it back. Throws `AuditStoreError` when it could not be
 * stored; the caller decides whether to go on without one.
 */
export async function beginAuditOperation(init: AuditInit, now = Date.now()): Promise<string> {
  const id = newOperationId();
  const source = init.source ?? (init.label.tool ? 'tools' : currentAuditSource());
  await putAuditOperation({
    id,
    schemaVersion: AUDIT_SCHEMA_VERSION,
    startedAt: now,
    label: init.label,
    source,
    actor: init.actor ?? (source === 'background' ? 'system' : 'user'),
    ...(init.actorLabel ? { actorLabel: init.actorLabel.slice(0, 200) } : {}),
    state: 'prepared',
    counts: { planned: 0, applied: 0, skipped: 0, failed: 0 },
    ...(init.relatedOperationId ? { relatedOperationId: init.relatedOperationId } : {}),
    originConfidence: 'verified_internal',
  });
  return id;
}

/** Items left out of a change, as the caller reviewed them. */
export type AuditSkippedItem = { id: string; title: string; reason: string; failed: boolean };

/** What the caller knows beyond the writer's operations: what it planned and left out. */
export type AuditReport = {
  /** Changes planned; defaults to applied plus skipped plus failed. */
  planned?: number;
  skipped?: readonly AuditSkippedItem[];
};

const nodeType = (node: { url?: string; type?: string }): AuditItem['type'] =>
  node.type === 'separator' ? 'separator' : node.url ? 'bookmark' : 'folder';

function countInside(node: RecoverableBookmarkNode): number {
  return (node.children ?? []).reduce((sum, child) => sum + 1 + countInside(child), 0);
}

/** One row per writer operation, in the order they ran. */
export function auditItemsOf(operations: readonly BookmarkHistoryOperation[]): AuditItem[] {
  return operations.map(auditItemOf);
}

function auditItemOf(op: BookmarkHistoryOperation): AuditItem {
  switch (op.kind) {
    case 'create':
    case 'remove': {
      const inside = countInside(op.node);
      const place = { parentId: op.at.parentId, index: op.at.index };
      return {
        id: op.node.id ?? '',
        change: op.kind,
        outcome: 'applied',
        title: op.node.title,
        ...(op.node.url ? { url: op.node.url } : {}),
        type: nodeType(op.node),
        ...(op.kind === 'create' ? { after: place } : { before: place }),
        ...(inside > 0 ? { descendants: inside } : {}),
      };
    }
    case 'update':
      return {
        id: op.id,
        change: 'update',
        outcome: 'applied',
        title: op.after.title ?? op.before.title ?? '',
        type: (op.after.url ?? op.before.url) ? 'bookmark' : 'folder',
        before: { ...op.before },
        after: { ...op.after },
      };
    case 'move':
      return {
        id: op.id,
        change: 'move',
        outcome: 'applied',
        title: op.title ?? '',
        ...(op.url ? { url: op.url } : {}),
        type: op.url ? 'bookmark' : 'folder',
        before: { parentId: op.from.parentId, index: op.from.index },
        after: { parentId: op.to.parentId, index: op.to.index },
      };
  }
}

/**
 * Whether each operation's bookmark reads back as the operation left it, counting the ones that
 * do not. Only the last operation on an id is checked: a later one in the same change moves on
 * from where an earlier one left it.
 */
export async function verifyOperations(
  operations: readonly BookmarkHistoryOperation[],
): Promise<number> {
  const last = new Map<string, BookmarkHistoryOperation>();
  for (const op of operations) {
    const id = op.kind === 'create' || op.kind === 'remove' ? op.node.id : op.id;
    if (id) last.set(id, op);
  }
  let mismatches = 0;
  for (const [id, op] of last) {
    const live = await getBookmark(id).catch(() => undefined);
    const ok = (() => {
      switch (op.kind) {
        case 'remove':
          return live === undefined;
        case 'create':
          return (
            live !== undefined &&
            live.parentId === op.at.parentId &&
            live.title === op.node.title &&
            (live.url ?? undefined) === (op.node.url ?? undefined)
          );
        case 'update':
          return (
            live !== undefined &&
            (Object.keys(op.after) as (keyof BookmarkFields)[]).every(
              (field) => (live[field] ?? undefined) === (op.after[field] ?? undefined),
            )
          );
        case 'move':
          return live !== undefined && live.parentId === op.to.parentId;
      }
    })();
    if (!ok) mismatches += 1;
  }
  return mismatches;
}

/** The state a finished change ends in, from its counts and its read-back. */
export function finishedAuditState(
  counts: AuditCounts,
  mismatches: number,
  threw: boolean,
): AuditState {
  if (mismatches > 0) return 'needs_review';
  if (counts.applied === 0) return 'failed';
  if (threw || counts.skipped > 0 || counts.failed > 0) return 'partially_applied';
  return 'verified_success';
}

/**
 * Stores how a change ended: its rows (applied ones from the writer, then what the caller
 * skipped), counts, read-back, and its Ctrl+Z entry. A change that planned nothing and did
 * nothing is not a change, and its reserved record is removed.
 */
export async function finishAuditOperation(
  id: string,
  {
    label,
    operations,
    report,
    undoHistoryId,
    threw,
    now = Date.now(),
  }: {
    label: AuditLabel;
    operations: readonly BookmarkHistoryOperation[];
    report?: AuditReport;
    undoHistoryId?: string;
    threw: boolean;
    now?: number;
  },
): Promise<void> {
  const skipped = report?.skipped ?? [];
  const failed = skipped.filter((item) => item.failed).length;
  const counts: AuditCounts = {
    applied: operations.length,
    skipped: skipped.length - failed,
    failed,
    planned: report?.planned ?? operations.length + skipped.length,
  };
  if (counts.planned === 0 && counts.applied === 0 && !threw) {
    await removeAuditOperation(id);
    return;
  }
  const mismatches = operations.length > 0 ? await verifyOperations(operations) : 0;
  const items = [
    ...auditItemsOf(operations),
    ...skipped.map(
      (item): AuditItem => ({
        id: item.id,
        change: 'update',
        outcome: item.failed ? 'failed' : 'skipped',
        title: item.title,
        type: 'bookmark',
        reason: item.reason,
      }),
    ),
  ];
  await putAuditDetails(id, items);
  await patchAuditOperation(id, (current) => ({
    ...current,
    label,
    finishedAt: now,
    counts,
    state: finishedAuditState(counts, mismatches, threw),
    verification:
      operations.length > 0
        ? { status: mismatches > 0 ? 'failed' : 'passed', mismatchCount: mismatches }
        : { status: 'not_run' },
    ...(undoHistoryId ? { undoHistoryId } : {}),
    ...(threw ? { errorCodes: ['write-threw'] } : {}),
  }));
}

/**
 * Marks `originalId` as undone by `undoId` (a transition, not a rewrite: its own outcome stays
 * as it was), so History can say whether all of it came back.
 */
export async function markAuditOperationUndone(
  originalId: string,
  undoId: string,
  complete: boolean,
  now = Date.now(),
): Promise<void> {
  await patchAuditOperation(originalId, (current) => ({
    ...current,
    undo: { operationId: undoId, at: now, complete },
  }));
}

/** The operation that undoes `op`: what undo does, as a row in its own record. */
export function invertOperation(op: BookmarkHistoryOperation): BookmarkHistoryOperation {
  switch (op.kind) {
    case 'create':
      return { ...op, kind: 'remove' };
    case 'remove':
      return { ...op, kind: 'create' };
    case 'update':
      return { ...op, before: op.after, after: op.before };
    case 'move':
      return { ...op, from: op.to, to: op.from };
  }
}

/**
 * Finishes the record of an undo or redo: rows for what it did (in the order it ran), each
 * applied or skipped (changed since), and a read-back of the applied ones.
 */
export async function finishReplayAuditOperation(
  id: string,
  {
    label,
    operations,
    done,
    direction,
    now = Date.now(),
  }: {
    label: AuditLabel;
    operations: readonly BookmarkHistoryOperation[];
    done: readonly boolean[];
    direction: 'undo' | 'redo';
    now?: number;
  },
): Promise<void> {
  const ran = operations.map((op) => (direction === 'undo' ? invertOperation(op) : op));
  const order = direction === 'undo' ? [...ran.keys()].reverse() : [...ran.keys()];
  const rows = auditItemsOf(order.map((position) => ran[position])).map(
    (item, row): AuditItem =>
      done[order[row]] ? item : { ...item, outcome: 'skipped', reason: 'changed' },
  );
  const applied = ran.filter((_, position) => done[position]);
  const counts: AuditCounts = {
    planned: ran.length,
    applied: applied.length,
    skipped: ran.length - applied.length,
    failed: 0,
  };
  const mismatches = applied.length > 0 ? await verifyOperations(applied) : 0;
  await putAuditDetails(id, rows);
  await patchAuditOperation(id, (current) => ({
    ...current,
    label,
    finishedAt: now,
    counts,
    state: finishedAuditState(counts, mismatches, false),
    verification:
      applied.length > 0
        ? { status: mismatches > 0 ? 'failed' : 'passed', mismatchCount: mismatches }
        : { status: 'not_run' },
  }));
}

/** Clears the undone mark of `originalId` after a redo applied it again. */
export async function markAuditOperationRedone(originalId: string): Promise<void> {
  await patchAuditOperation(originalId, ({ undo: _undo, ...current }) => current);
}

/** Whether a record still reserved is old enough to count as interrupted. */
export function isInterruptedAuditOperation(operation: AuditOperation, now = Date.now()): boolean {
  return (
    operation.state === 'prepared' && now - operation.startedAt > AUDIT_LIMITS.interruptedAfterMs
  );
}
