import { Copy, ExternalLink, Info, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { MouseEvent } from 'react';

type BookmarkRowMenuProps = {
  bookmark: Bookmark;
  actions: BookmarkRowActionHandlers;
};

/** Row-level actions for the bookmark manager table. */
export function BookmarkRowMenu({ bookmark, actions }: BookmarkRowMenuProps) {
  const modifiable = isModifiableBookmark(bookmark);
  const isLink = isOpenableBookmark(bookmark);

  // Menu items live inside a clickable row; keep clicks from navigating into folders.
  const run = (action: (bookmark: Bookmark) => void) => (event: MouseEvent) => {
    event.stopPropagation();
    action(bookmark);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 p-0"
          aria-label={t('table_openMenu')}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel>{t('table_actions')}</DropdownMenuLabel>
        {isLink && (
          <DropdownMenuItem onClick={run(actions.onOpenInNewTab)}>
            <ExternalLink className="h-4 w-4" />
            {t('table_openInNewTab')}
          </DropdownMenuItem>
        )}
        {modifiable && (
          <DropdownMenuItem onClick={run(actions.onEdit)}>
            <Pencil className="h-4 w-4" />
            {t('table_edit')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={run(actions.onViewDetails)}>
          <Info className="h-4 w-4" />
          {t('bookmarks_viewDetails')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={run((item) => {
            void navigator.clipboard.writeText(item.id);
          })}
        >
          <Copy className="h-4 w-4" />
          {t('table_copyId')}
        </DropdownMenuItem>
        {modifiable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive-text focus:text-destructive-text"
              onClick={run(actions.onDelete)}
            >
              <Trash2 className="h-4 w-4" />
              {t('table_delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
