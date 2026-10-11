import { MoreHorizontal } from 'lucide-react';
import type { MouseEvent } from 'react';

type BookmarkRowMenuProps = {
  bookmark: Bookmark;
  actions: readonly BookmarkRowAction[];
  context: BookmarkRowActionContext;
};

/** A row's ⋯ menu: the item-action registry for that row. */
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
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('table_actions')}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <BookmarkActionMenuItems items={[bookmark]} actions={actions} context={context} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type BookmarkActionMenuItemsProps = {
  items: Bookmark[];
  actions: readonly BookmarkRowAction[];
  context: BookmarkRowActionContext;
};

/**
 * The available actions for `items`, by section with separators, destructive ones last in the
 * destructive color. Used inside a dropdown (⋯) or a right-click menu.
 */
export function BookmarkActionMenuItems({ items, actions, context }: BookmarkActionMenuItemsProps) {
  const sections = getAvailableRowActions(items, actions, context);

  // Menu items live inside a clickable row; keep clicks from reaching it.
  const renderItem = (action: BookmarkRowAction) => (
    <DropdownMenuItem
      key={action.id}
      data-action={action.id}
      className={
        action.group === 'destructive'
          ? 'text-destructive-text focus:text-destructive-text'
          : undefined
      }
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        void action.run(items, context);
      }}
    >
      <action.icon className="h-4 w-4" />
      {getRowActionLabel(action, items, context)}
    </DropdownMenuItem>
  );

  return sections.map((section, index) => (
    <DropdownMenuGroup key={section.group}>
      {index > 0 && <DropdownMenuSeparator />}
      {section.actions.map(renderItem)}
    </DropdownMenuGroup>
  ));
}
