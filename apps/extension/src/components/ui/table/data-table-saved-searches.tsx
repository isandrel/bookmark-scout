/**
 * Saved searches menu in the manager toolbar: saves the current filters, sort, and folder scope
 * under a name, and opens, renames, or deletes saved searches. `s` opens it (see
 * `useManagerShortcuts`).
 */

import { BookmarkCheck, Check, Pencil, Trash2 } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react';

/** Marks the toolbar button the `s` shortcut clicks. */
export const SAVED_SEARCHES_TRIGGER_ATTRIBUTE = 'data-saved-searches-trigger';

type DataTableSavedSearchesProps = {
  /** The manager's current filters, sort, and scope. */
  currentQuery: SavedSearchQuery;
  /** Shows a saved query in the table; reports folders it skipped because they are gone. */
  onApply: (query: SavedSearchQuery) => { missingFolderCount: number };
};

function describeError(error: SavedSearchError): string {
  switch (error) {
    case 'empty-name':
      return t('savedSearches_errorEmptyName');
    case 'duplicate-name':
      return t('savedSearches_errorDuplicateName');
    case 'limit':
      return t('savedSearches_errorLimit', String(MAX_SAVED_SEARCHES));
    default:
      return t('savedSearches_errorGeneric');
  }
}

export function DataTableSavedSearches({ currentQuery, onApply }: DataTableSavedSearchesProps) {
  const { searches, create, rename, remove, restore } = useSavedSearches();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string; error?: string } | null>(
    null,
  );
  const nameInputRef = useRef<HTMLInputElement>(null);
  const canSave = hasSavedSearchFilters(currentQuery);
  const activeId = searches.find((search) =>
    isSameSavedSearchQuery(search.query, currentQuery),
  )?.id;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSaveError(null);
      setRenaming(null);
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    const result = await create(name, currentQuery);
    if (!result.ok) {
      setSaveError(describeError(result.error));
      return;
    }
    setName('');
    setSaveError(null);
    toast.success({ title: t('savedSearches_saved', result.search.name) });
  };

  const handleApply = (search: SavedSearch) => {
    const { missingFolderCount } = onApply(search.query);
    handleOpenChange(false);
    if (missingFolderCount > 0) {
      toast({
        title: t('savedSearches_missingFoldersTitle'),
        description: t('savedSearches_missingFolders', String(missingFolderCount)),
      });
    }
  };

  const handleRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;
    const result = await rename(renaming.id, renaming.name);
    if (!result.ok) {
      setRenaming({ ...renaming, error: describeError(result.error) });
      return;
    }
    setRenaming(null);
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Escape leaves renaming without closing the menu.
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setRenaming(null);
  };

  const handleDelete = async (search: SavedSearch) => {
    const index = searches.findIndex((entry) => entry.id === search.id);
    await remove(search.id);
    // The deleted row's button is gone; keep focus inside the menu.
    nameInputRef.current?.focus();
    let undone = false;
    toast.success({
      title: t('savedSearches_deleted', search.name),
      action: (
        <ToastAction
          onClick={async () => {
            if (undone) return;
            undone = true;
            const result = await restore(search, index);
            if (!result.ok) {
              toast({ title: describeError(result.error), variant: 'destructive' });
            }
          }}
        >
          {t('action_undo')}
        </ToastAction>
      ),
    });
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant={activeId ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 shrink-0"
            aria-keyshortcuts="s"
            title={t('savedSearches_buttonTitle')}
            {...{ [SAVED_SEARCHES_TRIGGER_ATTRIBUTE]: '' }}
          />
        }
      >
        <BookmarkCheck />
        {t('savedSearches_button')}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-3 p-3"
        align="end"
        initialFocus={nameInputRef}
        aria-label={t('savedSearches_button')}
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t('savedSearches_button')}</h2>
          <p className="text-xs text-muted-foreground">{t('savedSearches_description')}</p>
        </div>
        <form className="space-y-1.5" onSubmit={handleSave}>
          <div className="flex gap-2">
            <Input
              ref={nameInputRef}
              value={name}
              maxLength={SAVED_SEARCH_NAME_MAX_LENGTH}
              placeholder={t('savedSearches_namePlaceholder')}
              aria-label={t('savedSearches_nameLabel')}
              aria-invalid={saveError ? true : undefined}
              aria-describedby="savedSearchSaveHint"
              onChange={(event) => {
                setName(event.target.value);
                setSaveError(null);
              }}
              className="h-8"
            />
            <Button type="submit" size="sm" className="h-8" disabled={!canSave}>
              {t('savedSearches_save')}
            </Button>
          </div>
          <p
            id="savedSearchSaveHint"
            role={saveError ? 'alert' : undefined}
            className={cn('text-xs', saveError ? 'text-destructive' : 'text-muted-foreground')}
          >
            {saveError ?? (canSave ? t('savedSearches_saveHint') : t('savedSearches_needsFilter'))}
          </p>
        </form>
        {searches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('savedSearches_empty')}</p>
        ) : (
          <ul
            className="max-h-72 space-y-1 overflow-y-auto"
            aria-label={t('savedSearches_listLabel')}
          >
            {searches.map((search) => (
              <li key={search.id} className="flex items-center gap-1">
                {renaming?.id === search.id ? (
                  <form className="flex min-w-0 flex-1 flex-col gap-1" onSubmit={handleRename}>
                    <div className="flex gap-1">
                      <Input
                        autoFocus
                        value={renaming.name}
                        maxLength={SAVED_SEARCH_NAME_MAX_LENGTH}
                        aria-label={t('savedSearches_renameLabel', search.name)}
                        aria-invalid={renaming.error ? true : undefined}
                        onChange={(event) =>
                          setRenaming({ id: search.id, name: event.target.value })
                        }
                        onKeyDown={handleRenameKeyDown}
                        className="h-8"
                      />
                      <Button type="submit" size="sm" className="h-8">
                        {t('savedSearches_save')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => setRenaming(null)}
                      >
                        {t('action_cancel')}
                      </Button>
                    </div>
                    {renaming.error && (
                      <p role="alert" className="text-xs text-destructive">
                        {renaming.error}
                      </p>
                    )}
                  </form>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 min-w-0 flex-1 justify-start"
                      aria-current={search.id === activeId ? 'true' : undefined}
                      onClick={() => handleApply(search)}
                    >
                      <Check
                        aria-hidden="true"
                        className={cn(search.id !== activeId && 'invisible')}
                      />
                      <span className="min-w-0 truncate" title={search.name}>
                        {search.name}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={t('savedSearches_rename', search.name)}
                      title={t('savedSearches_rename', search.name)}
                      onClick={() => setRenaming({ id: search.id, name: search.name })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={t('savedSearches_delete', search.name)}
                      title={t('savedSearches_delete', search.name)}
                      onClick={() => void handleDelete(search)}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
