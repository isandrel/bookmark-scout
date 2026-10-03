/**
 * The one delete-with-undo flow of the popup, side panel, and bookmark manager: honors
 * `confirmBeforeDelete`, captures undo snapshots before removal, and offers an Undo toast that
 * closes when the undo window ends. Several items (a table selection) are deleted and restored
 * as one operation.
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export type BookmarkDeletionTarget = { id: string; title: string; type: 'bookmark' | 'folder' };

/** One item, or a multi-item selection that is confirmed and undone together. */
export type PendingBookmarkDeletion = BookmarkDeletionTarget & {
  items?: BookmarkDeletionTarget[];
  /** Runs once the deletion has run, even when it failed; not when the confirmation is cancelled. */
  onDone?: () => void;
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

/**
 * Deletes `targets` in order after capturing a snapshot of each, so nothing is deleted without a
 * way back, and stops at the first failure. Reports the outcome in toasts; the Undo toast closes
 * when the first snapshot expires, because the undo window does not pause while it is hovered.
 * Resolves to the number of items deleted.
 */
export async function deleteBookmarksWithUndo(
  targets: readonly BookmarkDeletionTarget[],
  { onChanged, remove = deleteBookmark }: BookmarkDeletionOptions,
): Promise<number> {
  if (targets.length === 0) return 0;
  const single = targets.length === 1 ? targets[0] : undefined;
  const errorTitle =
    single?.type === 'folder' ? t('toast_errorDeletingFolder') : t('toast_errorDeletingBookmark');

  const snapshots: BookmarkDeletionSnapshot[] = [];
  try {
    for (const target of targets) snapshots.push(await captureBookmarkDeletion(target.id));
  } catch (error) {
    toast.error({ title: errorTitle, description: getErrorMessage(error) });
    return 0;
  }

  const deleted: BookmarkDeletionSnapshot[] = [];
  let failure: unknown;
  for (const [index, target] of targets.entries()) {
    try {
      await remove(target.id);
      deleted.push(snapshots[index]);
    } catch (error) {
      failure = error;
      break;
    }
  }
  await onChanged();

  // Shown after the Undo toast: a new toast replaces earlier ones that have no action.
  const reportFailure = () => {
    if (failure !== undefined) {
      toast.error({ title: errorTitle, description: getErrorMessage(failure) });
    }
  };
  if (deleted.length === 0) {
    reportFailure();
    return 0;
  }

  const seconds = String(BOOKMARK_DELETION_UNDO_WINDOW_MS / MS_PER_SECOND);
  const deletedTitle = deleted.length === 1 ? await quoteToastItemTitle(deleted[0].node.title) : '';
  const undoToast = toast.withUndo({
    title:
      deleted.length > 1
        ? t('toast_itemsDeleted', String(deleted.length))
        : single?.type === 'folder'
          ? t('toast_folderDeleted')
          : t('toast_bookmarkDeleted'),
    description:
      deleted.length > 1
        ? t('toast_deleteManyUndoWindow', [String(deleted.length), seconds])
        : t('toast_deleteUndoWindow', [deletedTitle, seconds]),
    onUndo: async () => {
      try {
        await restoreSnapshots(deleted);
        await onChanged();
        toast({
          title: t('toast_deleteRestored'),
          description:
            deleted.length > 1
              ? t('toast_itemsRestoredDesc', String(deleted.length))
              : t('toast_deleteRestoredDesc', deletedTitle),
          variant: 'success',
        });
      } catch (error) {
        await onChanged();
        toast({
          title: t('toast_errorRestoringDeletion'),
          description: describeRestoreError(error),
          variant: 'destructive',
        });
      }
    },
  });
  const expiresAt = Math.min(...deleted.map((snapshot) => snapshot.expiresAt));
  setTimeout(undoToast.dismiss, Math.max(0, expiresAt - Date.now()));
  reportFailure();
  return deleted.length;
}

/** Deletion state for a page; render `BookmarkDeleteDialog` with the result. */
export function useBookmarkDeletion(options: BookmarkDeletionOptions): BookmarkDeletion {
  const [pendingDeletion, setPendingDeletion] = useState<PendingBookmarkDeletion | null>(null);
  // Callers need not memoize their callbacks; a deletion always uses the latest ones.
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const run = useCallback(async (deletion: PendingBookmarkDeletion) => {
    await deleteBookmarksWithUndo(deletion.items ?? [deletion], latest.current);
    deletion.onDone?.();
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
