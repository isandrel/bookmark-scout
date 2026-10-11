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

/** Edit an item, or add a bookmark or folder at the end of `parentId` (Chrome's add dialog). */
export type BookmarkEditTarget =
  | { mode: 'edit'; bookmark: Bookmark }
  | { mode: 'add'; kind: 'bookmark' | 'folder'; parentId: string };

type BookmarkEditDialogProps = {
  target: BookmarkEditTarget | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const isFolderTarget = (target: BookmarkEditTarget) =>
  target.mode === 'edit' ? target.bookmark.type === ItemTypeEnum.Folder : target.kind === 'folder';

function BookmarkEditForm({
  target,
  onClose,
  onSaved,
}: {
  target: BookmarkEditTarget;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const bookmark = target.mode === 'edit' ? target.bookmark : undefined;
  const isLink = !isFolderTarget(target);
  const [title, setTitle] = useState(bookmark?.title ?? '');
  const [url, setUrl] = useState(bookmark?.url ?? '');
  const [titleError, setTitleError] = useState('');
  const [urlError, setUrlError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // `example.com/path` gets `https://`, as in the browser's own add dialog; an unchanged URL is
    // kept exactly as stored.
    const typedUrl = url.trim();
    const trimmedUrl = typedUrl === bookmark?.url ? typedUrl : withDefaultScheme(typedUrl);
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
    const urlChanged = isLink && trimmedUrl !== bookmark?.url;
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
      if (target.mode === 'add') {
        await addBookmarkItem({
          parentId: target.parentId,
          title: trimmedTitle,
          ...(isLink ? { url: trimmedUrl } : {}),
        });
        await onSaved();
        toast.success({ title: t('bookmarks_added', getBookmarkDisplayTitle(trimmedTitle)) });
        onClose();
        return;
      }
      // Recorded, so Ctrl+Z in the manager restores the previous name and URL.
      await recordBookmarkWrites({ action: 'edit', title: target.bookmark.title }, (writer) =>
        writer.update(
          target.bookmark.id,
          urlChanged ? { title: trimmedTitle, url: trimmedUrl } : { title: trimmedTitle },
        ),
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

/** Title and description keys by mode and kind. */
const DIALOG_TEXT = {
  edit: {
    folder: ['bookmarks_editFolder', 'bookmarks_editFolderDescription'],
    bookmark: ['bookmarks_editBookmark', 'bookmarks_editDescription'],
  },
  add: {
    folder: ['bookmarks_addFolderTitle', 'bookmarks_addFolderDescription'],
    bookmark: ['bookmarks_addBookmarkTitle', 'bookmarks_addBookmarkDescription'],
  },
} as const satisfies Record<string, Record<string, readonly [MessageKey, MessageKey]>>;

/** Edits a bookmark's title and URL or a folder's title, or adds a bookmark or folder. */
export function BookmarkEditDialog({ target, onClose, onSaved }: BookmarkEditDialogProps) {
  const [titleKey, descriptionKey] = target
    ? DIALOG_TEXT[target.mode][isFolderTarget(target) ? 'folder' : 'bookmark']
    : DIALOG_TEXT.edit.bookmark;
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descriptionKey)}</DialogDescription>
        </DialogHeader>
        {target ? (
          <BookmarkEditForm
            key={target.mode === 'edit' ? target.bookmark.id : `add-${target.kind}`}
            target={target}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
