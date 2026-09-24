type BookmarkDeleteDialogProps = {
  deletion: PendingBookmarkDeletion | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirmation shown before deleting when the `confirmBeforeDelete` setting is on. */
export function BookmarkDeleteDialog({ deletion, onCancel, onConfirm }: BookmarkDeleteDialogProps) {
  const title =
    deletion?.type === 'folder' ? t('popup_deleteFolder') : t('popup_deleteBookmark');

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
            {deletion?.type === 'folder'
              ? t('popup_confirmDeleteFolder', deletion.title)
              : t('popup_confirmDeleteBookmark', deletion?.title ?? '')}
          </DialogDescription>
        </DialogHeader>
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
