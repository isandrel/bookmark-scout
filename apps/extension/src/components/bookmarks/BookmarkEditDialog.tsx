import { type FormEvent, useState } from 'react';

/** Whether `url` is a complete URL with a scheme, such as `https://example.com/`. */
function isAbsoluteUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

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
  const isLink = bookmark.type === ItemTypeEnum.Link;
  const [title, setTitle] = useState(bookmark.title);
  const [url, setUrl] = useState(bookmark.url ?? '');
  const [titleError, setTitleError] = useState('');
  const [urlError, setUrlError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUrl = url.trim();
    const trimmedTitle = title.trim();
    // Bookmarks may be untitled, as in the browser; a folder needs a name to be found again.
    if (!isLink && !trimmedTitle) {
      setTitleError(t('bookmarks_editFolderNameRequired'));
      return;
    }
    if (isLink && !trimmedUrl) {
      setUrlError(t('bookmarks_editUrlRequired'));
      return;
    }
    // Only a new URL is checked, so existing bookmarklets can still be renamed.
    const urlChanged = isLink && trimmedUrl !== bookmark.url;
    if (urlChanged && !isAbsoluteUrl(trimmedUrl)) {
      setUrlError(t('bookmarks_editUrlInvalid'));
      return;
    }
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
      toast.success({ title: t('bookmarks_editSaved') });
      onClose();
    } catch (error) {
      toast.error({ title: t('bookmarks_editFailed'), description: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    // The checks above show their own messages in the page language, so the browser's
    // built-in URL validation (which only says "Please enter a URL.") stays off.
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor="bookmark-edit-title">{t('bookmarks_editName')}</Label>
        <Input
          id="bookmark-edit-title"
          value={title}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? 'bookmark-edit-title-error' : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleError('');
          }}
        />
        {titleError && (
          <p id="bookmark-edit-title-error" className="text-sm text-destructive-text">
            {titleError}
          </p>
        )}
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
            <p id="bookmark-edit-url-error" className="text-sm text-destructive-text">
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
