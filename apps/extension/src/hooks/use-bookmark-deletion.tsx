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

/** Restores lower original indexes first so every item lands back in its old position. */
async function restoreSnapshots(snapshots: BookmarkDeletionSnapshot[]): Promise<void> {
  const ordered = [...snapshots].sort(
    (left, right) => (left.node.index ?? 0) - (right.node.index ?? 0),
  );
  for (const snapshot of ordered) await restoreBookmarkDeletion(snapshot);
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
  { onChanged, remove = deleteBookmark }: BookmarkDeletionOptions,
): Promise<BookmarkDeletionOutcome> {
  const outcome: BookmarkDeletionOutcome = { deleted: 0, skipped: 0, failed: 0 };
  if (targets.length === 0) return outcome;
  const single = targets.length === 1 ? targets[0] : undefined;
  const errorTitle =
    single?.type === 'folder' ? t('toast_errorDeletingFolder') : t('toast_errorDeletingBookmark');

  const deleted: BookmarkDeletionSnapshot[] = [];
  let deletedType: BookmarkDeletionTarget['type'] | undefined;
  let firstFailure: unknown;
  for (const target of targets) {
    if (!isUnchanged(target, await getLiveBookmark(target.id))) {
      outcome.skipped += 1;
      continue;
    }
    try {
      const snapshot = await captureBookmarkDeletion(target.id);
      await remove(target.id);
      deleted.push(snapshot);
      deletedType = target.type;
    } catch (error) {
      outcome.failed += 1;
      firstFailure ??= error;
    }
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
  const deletedTitle = deleted.length === 1 ? await quoteToastItemTitle(deleted[0].node.title) : '';
  const undoWindow =
    deleted.length > 1
      ? t('toast_deleteManyUndoWindow', [String(deleted.length), seconds])
      : t('toast_deleteUndoWindow', [deletedTitle, seconds]);
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
        await restoreSnapshots(deleted);
        await onChanged();
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
  const expiresAt = Math.min(...deleted.map((snapshot) => snapshot.expiresAt));
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
