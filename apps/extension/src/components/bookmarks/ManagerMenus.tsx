/**
 * The manager's command menus, after Chrome's: right-click on rows (the selection's item actions,
 * or the folder actions on empty space), right-click on folders in the tree, and the header's
 * Organize menu. The items are bookmark actions from the registry (`services/actions.ts`), in the
 * order and sections `config/ui/actions.toml` gives each menu (`services/action-menus.ts`).
 */

import { MoreVertical } from 'lucide-react';
import { type HTMLAttributes, type ReactNode, useState } from 'react';

function FolderActionMenuItems({
  menu,
  host,
}: {
  menu: 'organize' | 'emptySpace';
  host: ActionFolderHost;
}) {
  return ACTION_MENUS[menu].map((section, index) => (
    <DropdownMenuGroup key={section.join()}>
      {index > 0 && <DropdownMenuSeparator />}
      {section.map((id) => {
        const action = getAction(id);
        const entry = action.folderMenu;
        if (!entry) return null;
        const Icon = action.icon ? ACTION_ICONS[action.icon] : undefined;
        return (
          <DropdownMenuItem
            key={id}
            data-action={id}
            disabled={!entry.enabled(host)}
            onClick={() => entry.run(host)}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {action.labelKey ? t(action.labelKey) : id}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  ));
}

/** The header's ⋮ menu: Sort by name, Add new bookmark, Add new folder. */
export function OrganizeMenu({ host }: { host: ActionFolderHost }) {
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
        <FolderActionMenuItems menu="organize" host={host} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ItemContextMenuProps = {
  children: ReactNode;
  /** The items a right click at `target` acts on; empty for the empty-space menu. */
  resolveItems: (target: EventTarget | null) => Bookmark[];
  itemHost: ActionItemHost;
  /** The empty-space menu; without it, right clicks outside items show no menu items. */
  folderHost?: ActionFolderHost;
  className?: string;
  testId: string;
  /** More props for the area, such as drag and drop handlers. */
  areaProps?: HTMLAttributes<HTMLDivElement>;
};

/**
 * A right-click menu over `children`: the item actions for what was clicked (the selection, for a
 * selected row), else the folder actions. The keyboard's menu key and Shift+F10 open it too.
 */
export function ItemContextMenu({
  children,
  resolveItems,
  itemHost,
  folderHost,
  className,
  testId,
  areaProps,
}: ItemContextMenuProps) {
  const [items, setItems] = useState<Bookmark[]>([]);
  return (
    <ContextMenuRoot>
      <ContextMenuTrigger
        render={<div className={className} data-testid={testId} {...areaProps} />}
        onContextMenu={(event) => {
          const resolved = resolveItems(event.target);
          if (resolved.length === 0 && !folderHost) {
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
          <BookmarkActionMenuItems items={items} host={itemHost} />
        ) : folderHost ? (
          <FolderActionMenuItems menu="emptySpace" host={folderHost} />
        ) : null}
      </ContextMenuContent>
    </ContextMenuRoot>
  );
}
