import { MoreHorizontal } from 'lucide-react';
import type { MouseEvent } from 'react';

type BookmarkRowMenuProps = {
  bookmark: Bookmark;
  host: ActionItemHost;
};

/** A row's ⋯ menu: the item menu's actions for that row. */
export function BookmarkRowMenu({ bookmark, host }: BookmarkRowMenuProps) {
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
        <BookmarkActionMenuItems items={[bookmark]} host={host} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type BookmarkActionMenuItemsProps = {
  items: Bookmark[];
  host: ActionItemHost;
  /** The menu's sections of action ids; the configured item menu by default. */
  sections?: readonly (readonly ActionId[])[];
};

/**
 * The bookmark actions available for `items`, by section with separators, destructive ones in
 * the destructive color. Used inside a dropdown (⋯) or a right-click menu.
 */
export function BookmarkActionMenuItems({ items, host, sections }: BookmarkActionMenuItemsProps) {
  const { value: visible } = useSetting('managerMenuActions');
  // Menu items live inside a clickable row; keep clicks from reaching it.
  const renderItem = (id: ActionId) => {
    const action = getAction(id);
    const Icon = action.icon ? ACTION_ICONS[action.icon] : undefined;
    return (
      <DropdownMenuItem
        key={id}
        data-action={id}
        className={
          action.risk === 'destructive'
            ? 'text-destructive-text focus:text-destructive-text'
            : undefined
        }
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          void action.itemMenu?.run(items, host);
        }}
      >
        {Icon && <Icon className="h-4 w-4" />}
        {getItemMenuLabel(id, items, host)}
      </DropdownMenuItem>
    );
  };

  const available = getItemMenuSections(items, host, sections ?? customizeItemMenu(visible));
  // The user's menu (Options) may hide every command that applies here; say so instead of
  // opening an empty menu.
  if (available.length === 0) {
    return (
      <DropdownMenuGroup>
        <DropdownMenuItem disabled data-testid="no-menu-actions">
          {t('menu_noActions')}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    );
  }
  return available.map((section, index) => (
    <DropdownMenuGroup key={section.join()}>
      {index > 0 && <DropdownMenuSeparator />}
      {section.map(renderItem)}
    </DropdownMenuGroup>
  ));
}
