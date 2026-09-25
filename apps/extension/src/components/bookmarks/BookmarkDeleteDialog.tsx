type BookmarkDeleteDialogProps = {
  deletion: PendingBookmarkDeletion | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirmation shown before deleting when the `confirmBeforeDelete` setting is on. */
export function BookmarkDeleteDialog({ deletion, onCancel, onConfirm }: BookmarkDeleteDialogProps) {
  const count = deletion?.items?.length ?? 1;
  const title =
    count > 1
      ? t('bookmarks_deleteItems', String(count))
      : deletion?.type === 'folder'
        ? t('popup_deleteFolder')
        : t('popup_deleteBookmark');
  const itemTitle = deletion?.title.trim() || t('bookmarks_untitled');

  return (
    <Dialog
      open={deletion !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {count > 1
              ? t('bookmarks_confirmDeleteItems', String(count))
              : deletion?.type === 'folder'
                ? t('popup_confirmDeleteFolder', itemTitle)
                : t('popup_confirmDeleteBookmark', itemTitle)}
          </DialogDescription>
        </DialogHeader>
        {deletion?.items && deletion.items.length > 1 && <BulkItemPreview items={deletion.items} />}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t('action_cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
