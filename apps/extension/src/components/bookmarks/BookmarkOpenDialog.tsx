/** The confirmation before opening many tabs at once (`useBookmarkOpener`). */
export function BookmarkOpenDialog({ opener }: { opener: BookmarkOpener }) {
  const count = String(opener.pending?.urls.length ?? 0);
  return (
    <ConfirmDialog
      open={opener.pending !== null}
      onOpenChange={(open) => {
        if (!open) opener.cancel();
      }}
      title={t('bookmarks_openManyTitle', count)}
      description={t('bookmarks_openManyDescription', count)}
      confirmLabel={t('bookmarks_openManyConfirm')}
      variant="default"
      onConfirm={opener.confirm}
    />
  );
}
