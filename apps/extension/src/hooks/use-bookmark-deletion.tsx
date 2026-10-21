/**
 * The one delete-with-undo flow of the popup, side panel, and bookmark manager: honors
 * `confirmBeforeDelete`, captures undo snapshots before removal, and offers an Undo toast that
 * closes when the undo window ends. Several items (a table selection) are deleted and restored
 * as one operation. Items deleted or changed elsewhere since they were chosen are skipped, never
 * deleted, and an open confirmation follows those changes.
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export type BookmarkDeletionTarget = {
  id: string;
  /** The title the user chose to delete; an item renamed since then is skipped. */
  title: string;
  type: 'bookmark' | 'folder';
  /** The URL the user chose to delete, when known; an item whose URL changed is skipped. */
  url?: string;
};

/** What a deletion did: `skipped` items were deleted or changed elsewhere since they were chosen. */
export type BookmarkDeletionOutcome = { deleted: number; skipped: number; failed: number };

/** One item, or a multi-item selection that is confirmed and undone together. */
export type PendingBookmarkDeletion = BookmarkDeletionTarget & {
  items?: BookmarkDeletionTarget[];
  /** Runs once the deletion has run, even when it failed; not when the confirmation is cancelled. */
  onDone?: (outcome: BookmarkDeletionOutcome) => void;
};

export type BookmarkDeletionOptions = {
  /** Runs after items were deleted or restored, so the page shows the change. */
  onChanged: () => void | Promise<void>;
  /** Removes one item with everything inside it; the browser's bookmarks by default. */
  remove?: (id: string) => Promise<void>;
  /**
   * Records the deletion in the undo history (the manager), so Ctrl+Z restores it after the
   * toast is gone. `remove` is not used then.
   */
  recordHistory?: boolean;
};

export type BookmarkDeletion = {
  /** The deletion waiting for confirmation, if any. */
  pendingDeletion: PendingBookmarkDeletion | null;
  /** Deletes now, or asks first when the `confirmBeforeDelete` setting is on. */
  requestDeletion: (deletion: PendingBookmarkDeletion) => Promise<void>;
  confirmDeletion: () => Promise<void>;
  cancelDeletion: () => void;
};

function describeRestoreError(error: unknown): string {
  if (error instanceof BookmarkRestoreError && error.code === 'parent-missing') {
    return t('toast_restoreParentMissing');
  }
  if (error instanceof BookmarkRestoreError && error.code === 'expired') {
    return t('toast_restoreExpired');
  }
  return getErrorMessage(error);
}

/** What an undone deletion brought back: items left alone, and items back without their tags. */
type RestoreGaps = { skipped: number; metadataNotRestored: number };

/**
 * Restores lower original indexes first so every item lands back in its old position. Counts the
 * items that came back without their tags and summaries.
 */
async function restoreSnapshots(snapshots: BookmarkDeletionSnapshot[]): Promise<RestoreGaps> {
  const ordered = [...snapshots].sort(
    (left, right) => (left.node.index ?? 0) - (right.node.index ?? 0),
  );
  let metadataNotRestored = 0;
  for (const snapshot of ordered) {
    const { metadataRestored } = await restoreBookmarkDeletion(snapshot);
    if (!metadataRestored) metadataNotRestored += 1;
  }
  return { skipped: 0, metadataNotRestored };
}

/** Whether the live item is still the one the user chose: same title, and same URL if known. */
function isUnchanged(
  target: BookmarkDeletionTarget,
  live: Browser.bookmarks.BookmarkTreeNode | undefined,
): live is Browser.bookmarks.BookmarkTreeNode {
  if (!live || live.title !== target.title) return false;
  return target.url === undefined || live.url === target.url;
}

/**
 * Deletes `targets` in order. Each item is read again first and skipped when it no longer
 * exists or changed since it was chosen; a snapshot is captured before removal, so nothing is
 * deleted without a way back. A skipped or failed item never stops the rest. Reports the outcome
 * in one toast; its Undo closes when the first snapshot expires, because the undo window does not
 * pause while it is hovered.
 */
export async function deleteBookmarksWithUndo(
  targets: readonly BookmarkDeletionTarget[],
  { onChanged, remove = deleteBookmark, recordHistory = false }: BookmarkDeletionOptions,
): Promise<BookmarkDeletionOutcome> {
  const outcome: BookmarkDeletionOutcome = { deleted: 0, skipped: 0, failed: 0 };
  if (targets.length === 0) return outcome;
  const single = targets.length === 1 ? targets[0] : undefined;
  const errorTitle =
    single?.type === 'folder' ? t('toast_errorDeletingFolder') : t('toast_errorDeletingBookmark');

  const deleted: { title: string }[] = [];
  const snapshots: BookmarkDeletionSnapshot[] = [];
  let deletedType: BookmarkDeletionTarget['type'] | undefined;
  let firstFailure: unknown;
  const deleteEach = async (removeOne: (id: string) => Promise<void>) => {
    for (const target of targets) {
      const live = await getLiveBookmark(target.id);
      if (!isUnchanged(target, live)) {
        outcome.skipped += 1;
        continue;
      }
      try {
        await removeOne(target.id);
        deleted.push({ title: live.title });
        deletedType = target.type;
      } catch (error) {
        outcome.failed += 1;
        firstFailure ??= error;
      }
    }
  };
  let recorded: RecordedBookmarkChange | null = null;
  if (recordHistory) {
    // One history entry, so Ctrl+Z (and the toast's Undo) brings every item back together.
    ({ recorded } = await recordBookmarkWrites({ action: 'delete' }, (writer) =>
      deleteEach(writer.remove),
    ));
  } else {
    await deleteEach(async (id) => {
      const snapshot = await captureBookmarkDeletion(id);
      await remove(id);
      snapshots.push(snapshot);
    });
  }
  outcome.deleted = deleted.length;
  await onChanged();

  const partial = outcome.skipped > 0 || outcome.failed > 0;
  const issues = t('toast_deleteSkippedDesc', [String(outcome.skipped), String(outcome.failed)]);
  if (deleted.length === 0) {
    toast.error({
      title: errorTitle,
      description: outcome.skipped > 0 ? issues : getErrorMessage(firstFailure),
    });
    return outcome;
  }

  const seconds = String(BOOKMARK_DELETION_UNDO_WINDOW_MS / MS_PER_SECOND);
  const deletedTitle = deleted.length === 1 ? await quoteToastItemTitle(deleted[0].title) : '';
  const restore = async (): Promise<RestoreGaps> => {
    if (!recorded) return restoreSnapshots(snapshots);
    const undone = await undoRecordedBookmarkChange(recorded);
    // Null: undone already (Ctrl+Z). Nothing applied: the folder it was in is gone, or the
    // bookmarks changed since.
    if (undone && undone.applied === 0 && undone.parentMissing) {
      throw new BookmarkRestoreError(t('toast_restoreParentMissing'), 'parent-missing');
    }
    if (undone && undone.applied === 0) throw new Error(t('toast_undoChanged'));
    return { skipped: undone?.skipped ?? 0, metadataNotRestored: undone?.metadataNotRestored ?? 0 };
  };
  const undoWindow = [
    deleted.length > 1
      ? t('toast_deleteManyUndoWindow', [String(deleted.length), seconds])
      : t('toast_deleteUndoWindow', [deletedTitle, seconds]),
    // Too large for the undo history: this toast is the only way back.
    ...(recorded && !recorded.stored ? [t('toast_deleteNotInHistory')] : []),
  ].join(' ');
  const undoToast = toast.withUndo({
    title:
      deleted.length > 1
        ? t('toast_itemsDeleted', String(deleted.length))
        : deletedType === 'folder'
          ? t('toast_folderDeleted')
          : t('toast_bookmarkDeleted'),
    description: partial ? `${undoWindow} ${issues}` : undoWindow,
    variant: partial ? 'destructive' : 'success',
    onUndo: async () => {
      try {
        const gaps = await restore();
        await onChanged();
        if (gaps.skipped > 0 || gaps.metadataNotRestored > 0) {
          // Part of it could not come back as it was; say what, never "restored" alone.
          toast.error({
            title: t('toast_deletePartlyRestored'),
            description: [
              ...(gaps.skipped > 0 ? [t('toast_historySkipped', String(gaps.skipped))] : []),
              ...(gaps.metadataNotRestored > 0
                ? [t('toast_metadataNotRestored', String(gaps.metadataNotRestored))]
                : []),
            ].join(' '),
          });
          return;
        }
        toast.success({
          title: t('toast_deleteRestored'),
          description:
            deleted.length > 1
              ? t('toast_itemsRestoredDesc', String(deleted.length))
              : t('toast_deleteRestoredDesc', deletedTitle),
        });
      } catch (error) {
        await onChanged();
        toast.error({
          title: t('toast_errorRestoringDeletion'),
          description: describeRestoreError(error),
        });
      }
    },
  });
  // A recorded deletion stays undoable with Ctrl+Z; its toast closes with the usual undo window.
  const expiresAt = recorded
    ? Date.now() + BOOKMARK_DELETION_UNDO_WINDOW_MS
    : Math.min(...snapshots.map((snapshot) => snapshot.expiresAt));
  setTimeout(undoToast.dismiss, Math.max(0, expiresAt - Date.now()));
  return outcome;
}

/**
 * The pending deletion as the bookmarks are now: items deleted elsewhere are dropped and renamed
 * or re-pointed ones show their new title and URL, so the user confirms what will really happen.
 * Null when nothing is left to delete; the same object when nothing changed.
 */
async function refreshPendingDeletion(
  pending: PendingBookmarkDeletion,
): Promise<PendingBookmarkDeletion | null> {
  const items = pending.items ?? [pending];
  const live = await Promise.all(items.map((item) => getLiveBookmark(item.id)));
  const remaining = items.flatMap((item, index): BookmarkDeletionTarget[] => {
    const node = live[index];
    if (!node) return [];
    return [
      {
        id: item.id,
        title: node.title,
        type: item.type,
        ...(item.url !== undefined ? { url: node.url } : {}),
      },
    ];
  });
  if (remaining.length === 0) return null;
  if (items.every((item, index) => isUnchanged(item, live[index]))) return pending;
  return { ...pending, ...remaining[0], items: pending.items ? remaining : undefined };
}

/** Deletion state for a page; render `BookmarkDeleteDialog` with the result. */
export function useBookmarkDeletion(options: BookmarkDeletionOptions): BookmarkDeletion {
  const [pendingDeletion, setPendingDeletion] = useState<PendingBookmarkDeletion | null>(null);
  // Callers need not memoize their callbacks; a deletion always uses the latest ones.
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const pendingRef = useRef(pendingDeletion);
  pendingRef.current = pendingDeletion;

  // A confirmation left open while the bookmarks change elsewhere follows the change, and closes
  // once nothing it listed is left.
  useBookmarkEvents(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    void refreshPendingDeletion(pending).then((refreshed) => {
      if (pendingRef.current !== pending || refreshed === pending) return;
      setPendingDeletion(refreshed);
    });
  });

  const run = useCallback(async (deletion: PendingBookmarkDeletion) => {
    const outcome = await deleteBookmarksWithUndo(deletion.items ?? [deletion], latest.current);
    deletion.onDone?.(outcome);
  }, []);

  const requestDeletion = useCallback(
    async (deletion: PendingBookmarkDeletion) => {
      const { confirmBeforeDelete } = await getSettings();
      if (confirmBeforeDelete) {
        setPendingDeletion(deletion);
      } else {
        await run(deletion);
      }
    },
    [run],
  );

  const confirmDeletion = useCallback(async () => {
    if (!pendingDeletion) return;
    setPendingDeletion(null);
    await run(pendingDeletion);
  }, [pendingDeletion, run]);

  const cancelDeletion = useCallback(() => setPendingDeletion(null), []);

  return { pendingDeletion, requestDeletion, confirmDeletion, cancelDeletion };
}
