/**
 * The Audit History records for the manager's History, while it is open: read when it opens (old
 * finished records are pruned first), and again whenever any page or the background writes one
 * (`AUDIT_CHANNEL`). Also which records can still be undone with the session's undo history, and
 * which undone one Redo would bring back (only the newest: redo runs in order, like Ctrl+Y).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

export type AuditHistoryState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; operations: AuditOperation[]; corrupt: number };

export function useAuditHistory(open: boolean) {
  const [state, setState] = useState<AuditHistoryState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      // Pruning is housekeeping; a failure there must not hide the records.
      await pruneAuditOperations().catch(() => undefined);
      const { operations, corrupt } = await listAuditOperations();
      setState({ status: 'ready', operations, corrupt });
    } catch {
      setState({ status: 'unavailable' });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(AUDIT_CHANNEL);
      channel.onmessage = () => void load();
    } catch {
      // Without BroadcastChannel the list refreshes when History opens again.
    }
    return () => channel?.close();
  }, [load, open]);

  // Session undo entries still on the undo stack: only their changes can be undone from here.
  const { value: undoStack } = useStoredValue(bookmarkHistoryValue, (history) => history.undo);
  const undoableEntryIds = useMemo(() => new Set(undoStack.map((entry) => entry.id)), [undoStack]);

  const { value: nextRedoEntryId } = useStoredValue(
    bookmarkHistoryValue,
    (history) => history.redo.at(-1)?.id,
  );

  return { state, reload: load, undoableEntryIds, nextRedoEntryId };
}
