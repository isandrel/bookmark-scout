import { MoreHorizontal } from 'lucide-react';
import type { MouseEvent } from 'react';

type BookmarkRowMenuProps = {
  bookmark: Bookmark;
  actions: readonly BookmarkRowAction[];
  context: BookmarkRowActionContext;
};

/** Row-level actions for the bookmark manager table, from the row-action registry. */
export function BookmarkRowMenu({ bookmark, actions, context }: BookmarkRowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            aria-label={t('table_openMenu')}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <BookmarkRowMenuItems bookmark={bookmark} actions={actions} context={context} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The menu's label and items; destructive actions follow a separator. */
export function BookmarkRowMenuItems({ bookmark, actions, context }: BookmarkRowMenuProps) {
  const { regular, destructive } = getAvailableRowActions(bookmark, actions);

  // Menu items live inside a clickable row; keep clicks from navigating into folders.
  const renderItem = (action: BookmarkRowAction) => (
    <DropdownMenuItem
      key={action.id}
      className={
        action.isDestructive ? 'text-destructive-text focus:text-destructive-text' : undefined
      }
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        void action.run(bookmark, context);
      }}
    >
      <action.icon className="h-4 w-4" />
      {t(action.labelKey)}
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t('table_actions')}</DropdownMenuLabel>
        {regular.map(renderItem)}
      </DropdownMenuGroup>
      {destructive.length > 0 && (
        <>
          <DropdownMenuSeparator />
          {destructive.map(renderItem)}
        </>
      )}
    </>
  );
}
