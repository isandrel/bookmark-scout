import { type FormEvent, useState } from 'react';

type BookmarkEditDialogProps = {
  bookmark: Bookmark | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function BookmarkEditForm({
  bookmark,
  onClose,
  onSaved,
}: {
  bookmark: Bookmark;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const isLink = bookmark.type === ItemTypeEnum.Link;
  const [title, setTitle] = useState(bookmark.title);
  const [url, setUrl] = useState(bookmark.url ?? '');
  const [urlError, setUrlError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUrl = url.trim();
    const trimmedTitle = title.trim();
    if (isLink && !trimmedUrl) {
      setUrlError(t('bookmarks_editUrlRequired'));
      return;
    }
    // Only a new URL is checked, so existing bookmarklets can still be renamed.
    const urlChanged = isLink && trimmedUrl !== bookmark.url;
    const blocked = urlChanged ? getBlockedEditUrl(trimmedUrl) : null;
    if (blocked) {
      setUrlError(
        blocked.kind === 'script'
          ? t('bookmarks_editUrlScriptRejected', blocked.prefix)
          : t('bookmarks_editUrlDataRejected', blocked.prefix),
      );
      return;
    }

    setSaving(true);
    try {
      await updateBookmark(
        bookmark.id,
        urlChanged ? { title: trimmedTitle, url: trimmedUrl } : { title: trimmedTitle },
      );
      await onSaved();
      toast({ title: `✓ ${t('bookmarks_editSaved')}`, variant: 'success' });
      onClose();
    } catch (error) {
      toast({
        title: `× ${t('bookmarks_editFailed')}`,
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="bookmark-edit-title">{t('bookmarks_editName')}</Label>
        <Input
          id="bookmark-edit-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      {isLink && (
        <div className="space-y-2">
          <Label htmlFor="bookmark-edit-url">{t('bookmarks_editUrl')}</Label>
          <Input
            id="bookmark-edit-url"
            type="url"
            value={url}
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? 'bookmark-edit-url-error' : undefined}
            onChange={(event) => {
              setUrl(event.target.value);
              setUrlError('');
            }}
          />
          {urlError && (
            <p id="bookmark-edit-url-error" className="text-sm text-destructive">
              {urlError}
            </p>
          )}
        </div>
      )}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('action_cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {t('bookmarks_editSave')}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Edits a bookmark's title and URL, or a folder's title. */
export function BookmarkEditDialog({ bookmark, onClose, onSaved }: BookmarkEditDialogProps) {
  return (
    <Dialog
      open={bookmark !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {bookmark?.type === ItemTypeEnum.Folder
              ? t('bookmarks_editFolder')
              : t('bookmarks_editBookmark')}
          </DialogTitle>
          <DialogDescription>
            {bookmark?.type === ItemTypeEnum.Folder
              ? t('bookmarks_editFolderDescription')
              : t('bookmarks_editDescription')}
          </DialogDescription>
        </DialogHeader>
        {bookmark ? (
          <BookmarkEditForm
            key={bookmark.id}
            bookmark={bookmark}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
