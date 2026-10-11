/**
 * The manager's command menus, after Chrome's: right-click on rows (the selection's item actions,
 * or the folder actions on empty space), right-click on folders in the tree, and the header's
 * Organize menu. The items come from the item-action registry (`bookmark-row-actions.ts`) and the
 * folder-action registry (`folder-actions.ts`).
 */

import { MoreVertical } from 'lucide-react';
import { type ReactNode, useState } from 'react';

type FolderMenu = keyof typeof FOLDER_ACTION_MENUS;

function FolderActionMenuItems({
  menu,
  context,
}: {
  menu: FolderMenu;
  context: FolderActionContext;
}) {
  return FOLDER_ACTION_MENUS[menu].map((section, index) => (
    <DropdownMenuGroup key={section.join()}>
      {index > 0 && <DropdownMenuSeparator />}
      {section.map((id) => {
        const action = FOLDER_ACTIONS[id];
        return (
          <DropdownMenuItem
            key={id}
            data-action={id}
            disabled={!action.isEnabled(context)}
            onClick={() => action.run(context)}
          >
            <action.icon className="h-4 w-4" />
            {t(action.labelKey)}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  ));
}

/** The header's ⋮ menu: Sort by name, Add new bookmark, Add new folder. */
export function OrganizeMenu({ context }: { context: FolderActionContext }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label={t('menu_organize')}
            data-testid="organize-menu"
            title={t('menu_organize')}
          />
        }
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <FolderActionMenuItems menu="organize" context={context} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ItemContextMenuProps = {
  children: ReactNode;
  /** The items a right click at `target` acts on; empty for the empty-space menu. */
  resolveItems: (target: EventTarget | null) => Bookmark[];
  actions: readonly BookmarkRowAction[];
  itemContext: BookmarkRowActionContext;
  /** The empty-space menu; without it, right clicks outside items show no menu items. */
  folderContext?: FolderActionContext;
  className?: string;
  testId: string;
};

/**
 * A right-click menu over `children`: the item actions for what was clicked (the selection, for a
 * selected row), else the folder actions. The keyboard's menu key and Shift+F10 open it too.
 */
export function ItemContextMenu({
  children,
  resolveItems,
  actions,
  itemContext,
  folderContext,
  className,
  testId,
}: ItemContextMenuProps) {
  const [items, setItems] = useState<Bookmark[]>([]);
  return (
    <ContextMenuRoot>
      <ContextMenuTrigger
        render={<div className={className} data-testid={testId} />}
        onContextMenu={(event) => {
          const resolved = resolveItems(event.target);
          if (resolved.length === 0 && !folderContext) {
            // Nothing to offer here: leave the browser's own menu alone.
            (event as { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
            return;
          }
          setItems(resolved);
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {items.length > 0 ? (
          <BookmarkActionMenuItems items={items} actions={actions} context={itemContext} />
        ) : folderContext ? (
          <FolderActionMenuItems menu="emptySpace" context={folderContext} />
        ) : null}
      </ContextMenuContent>
    </ContextMenuRoot>
  );
}
