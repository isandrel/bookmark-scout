import type { ComponentProps } from 'react';

type BookmarkDeleteDialogProps = {
  /** The page's `useBookmarkDeletion` state. */
  deletion: BookmarkDeletion;
  /** Where focus goes on close, when the dialog was opened from code rather than a trigger. */
  finalFocus?: ComponentProps<typeof ConfirmDialog>['finalFocus'];
};

/**
 * Confirmation shown before deleting when the `confirmBeforeDelete` setting is on. It fits the
 * popup with a margin on each side and keeps the usual dialog width on wider pages.
 */
export function BookmarkDeleteDialog({ deletion, finalFocus }: BookmarkDeleteDialogProps) {
  const { pendingDeletion, confirmDeletion, cancelDeletion } = deletion;
  const count = pendingDeletion?.items?.length ?? 1;
  const title =
    count > 1
      ? t('bookmarks_deleteItems', String(count))
      : pendingDeletion?.type === 'folder'
        ? t('popup_deleteFolder')
        : t('popup_deleteBookmark');
  const itemTitle = getBookmarkDisplayTitle(pendingDeletion?.title);

  return (
    <ConfirmDialog
      open={pendingDeletion !== null}
      onOpenChange={(open) => {
        if (!open) cancelDeletion();
      }}
      title={title}
      description={
        count > 1
          ? t('bookmarks_confirmDeleteItems', String(count))
          : pendingDeletion?.type === 'folder'
            ? t('popup_confirmDeleteFolder', itemTitle)
            : t('popup_confirmDeleteBookmark', itemTitle)
      }
      confirmLabel={title}
      onConfirm={() => void confirmDeletion()}
      className="max-w-[min(32rem,calc(100%-2rem))]"
      finalFocus={finalFocus}
    >
      {pendingDeletion?.items && pendingDeletion.items.length > 1 && (
        <BulkItemPreview items={pendingDeletion.items} />
      )}
    </ConfirmDialog>
  );
}
