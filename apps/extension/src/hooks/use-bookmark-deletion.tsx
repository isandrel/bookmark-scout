/**
 * Deletion flow for the bookmark manager: honors `confirmBeforeDelete`, captures undo
 * snapshots before removal, and offers a bounded undo toast (same services as the popup).
 * Several items (a table selection) are deleted and restored as one operation.
 */

import { useCallback, useState } from 'react';

export type BookmarkDeletionTarget = { id: string; title: string; type: 'bookmark' | 'folder' };

/** One item, or a multi-item selection that is confirmed and undone together. */
export type PendingBookmarkDeletion = BookmarkDeletionTarget & { items?: BookmarkDeletionTarget[] };

function describeRestoreError(error: unknown): string {
  if (error instanceof BookmarkRestoreError && error.code === 'parent-missing') {
    return t('toast_restoreParentMissing');
  }
  if (error instanceof BookmarkRestoreError && error.code === 'expired') {
    return t('toast_restoreExpired');
  }
  return error instanceof Error ? error.message : t('error_unknown');
}

/** Restores lower original indexes first so every item lands back in its old position. */
async function restoreSnapshots(snapshots: BookmarkDeletionSnapshot[]): Promise<void> {
  const ordered = [...snapshots].sort(
    (left, right) => (left.node.index ?? 0) - (right.node.index ?? 0),
  );
  for (const snapshot of ordered) await restoreBookmarkDeletion(snapshot);
}

export function useBookmarkDeletion(onChanged: () => void | Promise<void>) {
  const { toast } = useToast();
  const [pendingDeletion, setPendingDeletion] = useState<PendingBookmarkDeletion | null>(null);

  const deleteItems = useCallback(
    async (targets: BookmarkDeletionTarget[]) => {
      if (targets.length === 0) return;
      const single = targets.length === 1 ? targets[0] : undefined;
      const errorTitle =
        single?.type === 'folder'
          ? t('toast_errorDeletingFolder')
          : t('toast_errorDeletingBookmark');

      const snapshots: BookmarkDeletionSnapshot[] = [];
      let failure: unknown;
      try {
        // Capture everything first so nothing is deleted without a way back.
        for (const target of targets) snapshots.push(await captureBookmarkDeletion(target.id));
      } catch (error) {
        toast({
          title: `× ${errorTitle}`,
          description: error instanceof Error ? error.message : t('error_unknown'),
          variant: 'destructive',
        });
        return;
      }

      const deleted: BookmarkDeletionSnapshot[] = [];
      for (const [index, target] of targets.entries()) {
        try {
          await deleteBookmark(target.id);
          deleted.push(snapshots[index]);
        } catch (error) {
          failure = error;
          break;
        }
      }
      await onChanged();

      if (failure !== undefined) {
        toast({
          title: `× ${errorTitle}`,
          description: failure instanceof Error ? failure.message : t('error_unknown'),
          variant: 'destructive',
        });
      }
      if (deleted.length === 0) return;

      let undoUsed = false;
      const seconds = String(BOOKMARK_DELETION_UNDO_WINDOW_MS / 1000);
      const deletedTitle =
        deleted.length === 1 ? deleted[0].node.title.trim() || t('bookmarks_untitled') : '';
      const title =
        deleted.length > 1
          ? t('toast_itemsDeleted', String(deleted.length))
          : single?.type === 'folder'
            ? t('toast_folderDeleted')
            : t('toast_bookmarkDeleted');
      toast({
        title: `✓ ${title}`,
        description:
          deleted.length > 1
            ? t('toast_deleteManyUndoWindow', [String(deleted.length), seconds])
            : t('toast_deleteUndoWindow', [deletedTitle, seconds]),
        variant: 'success',
        duration: BOOKMARK_DELETION_UNDO_WINDOW_MS,
        action: (
          <ToastAction
            altText={t('action_undo')}
            onClick={async () => {
              // A snapshot restores at most once, so repeated clicks cannot duplicate the tree.
              if (undoUsed) return;
              undoUsed = true;
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
            }}
          >
            {t('action_undo')}
          </ToastAction>
        ),
      });
    },
    [onChanged, toast],
  );

  const requestDeletion = useCallback(
    async (deletion: PendingBookmarkDeletion) => {
      const { confirmBeforeDelete } = await getSettings();
      if (confirmBeforeDelete) {
        setPendingDeletion(deletion);
      } else {
        await deleteItems(deletion.items ?? [deletion]);
      }
    },
    [deleteItems],
  );

  const confirmDeletion = useCallback(async () => {
    if (!pendingDeletion) return;
    const deletion = pendingDeletion;
    setPendingDeletion(null);
    await deleteItems(deletion.items ?? [deletion]);
  }, [deleteItems, pendingDeletion]);

  const cancelDeletion = useCallback(() => setPendingDeletion(null), []);

  return { pendingDeletion, requestDeletion, confirmDeletion, cancelDeletion };
}
