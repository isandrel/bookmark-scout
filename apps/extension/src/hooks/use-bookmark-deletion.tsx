/**
 * Deletion flow for the bookmark manager: honors `confirmBeforeDelete`, captures an undo
 * snapshot before removal, and offers a bounded undo toast (same services as the popup).
 */

import { useCallback, useState } from 'react';

export type PendingBookmarkDeletion = { id: string; title: string; type: 'bookmark' | 'folder' };

export function useBookmarkDeletion(onChanged: () => void | Promise<void>) {
  const { toast } = useToast();
  const [pendingDeletion, setPendingDeletion] = useState<PendingBookmarkDeletion | null>(null);

  const deleteItem = useCallback(
    async ({ id, type }: PendingBookmarkDeletion) => {
      const errorTitle =
        type === 'folder' ? t('toast_errorDeletingFolder') : t('toast_errorDeletingBookmark');
      let snapshot: BookmarkDeletionSnapshot;
      try {
        snapshot = await captureBookmarkDeletion(id);
        await deleteBookmark(id);
      } catch (error) {
        toast({
          title: `× ${errorTitle}`,
          description: error instanceof Error ? error.message : t('error_unknown'),
          variant: 'destructive',
        });
        return;
      }
      await onChanged();

      let undoUsed = false;
      toast({
        title: `✓ ${type === 'folder' ? t('toast_folderDeleted') : t('toast_bookmarkDeleted')}`,
        description: t('toast_deleteUndoWindow'),
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
                await restoreBookmarkDeletion(snapshot);
                await onChanged();
                toast({
                  title: t('toast_deleteRestored'),
                  description: t('toast_deleteRestoredDesc', snapshot.node.title),
                  variant: 'success',
                });
              } catch (error) {
                toast({
                  title: t('toast_errorRestoringDeletion'),
                  description:
                    error instanceof BookmarkRestoreError && error.code === 'parent-missing'
                      ? t('toast_restoreParentMissing')
                      : error instanceof BookmarkRestoreError && error.code === 'expired'
                        ? t('toast_restoreExpired')
                        : error instanceof Error
                          ? error.message
                          : t('error_unknown'),
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
        await deleteItem(deletion);
      }
    },
    [deleteItem],
  );

  const confirmDeletion = useCallback(async () => {
    if (!pendingDeletion) return;
    const deletion = pendingDeletion;
    setPendingDeletion(null);
    await deleteItem(deletion);
  }, [deleteItem, pendingDeletion]);

  const cancelDeletion = useCallback(() => setPendingDeletion(null), []);

  return { pendingDeletion, requestDeletion, confirmDeletion, cancelDeletion };
}
