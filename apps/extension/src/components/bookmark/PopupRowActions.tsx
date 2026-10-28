/**
 * The popup and side panel tree rows' actions: bookmark actions from the registry
 * (`services/actions.ts`) in the order `config/ui/actions.toml` and the user's menu
 * (`popupBookmarkMenu`, `popupFolderMenu`) give them (`getPopupRowActions`). A row's first actions
 * are buttons over its end, the rest are in its ⋯ menu, and right-clicking a row (or its menu key,
 * or Shift+F10) lists them all.
 *
 * The tree shares one ⋯ menu and one right-click menu (`PopupRowMenus`) instead of mounting a menu
 * per row: each row's ⋯ button is a plain button that opens the shared menu at itself. A Base UI
 * trigger per row cost the virtualized tree about a third of every scrolling frame, since rows
 * mount as they scroll in (popup.scroll.longFrames 8 before, 37 with them, 2026-10-28).
 */

import { MoreHorizontal } from 'lucide-react';
import {
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { BookmarkTreeNode } from '@/types';

/** What a row's ⋯ button hands the shared menu. */
type RowMenuPayload = { kind: PopupMenuKind; node: BookmarkTreeNode };

type RowMenuControl = {
  /** The node whose ⋯ menu is open, or null. */
  openId: string | null;
  /**
   * Opens the ⋯ menu for `payload` at `anchor`. While it is open, the modal menu covers the page,
   * so pressing the same ⋯ again is a press outside the menu and closes it.
   */
  open: (payload: RowMenuPayload, anchor: HTMLElement) => void;
};

const RowMenuContext = createContext<RowMenuControl | null>(null);

/**
 * A held Enter repeats keydown, and each repeat would activate the focused button again: after
 * a new folder is saved, focus returns here and the still-held key would reopen the input.
 */
function ignoreKeyRepeat(event: KeyboardEvent<HTMLElement>) {
  if (event.repeat) event.preventDefault();
}

const DESTRUCTIVE_BUTTON =
  'text-destructive-text hover:bg-destructive-wash hover:text-destructive-text';

/** The user's arrangement of one popup row menu. */
function usePopupMenuSetting(kind: PopupMenuKind): string[] {
  return useSetting(POPUP_MENUS[kind].setting).value;
}

/** A row's action buttons and its ⋯ button, for the row's hover overlay. */
export function PopupRowButtons({ kind, node }: { kind: PopupMenuKind; node: BookmarkTreeNode }) {
  const { actionHost: host } = usePopupTree();
  const menu = useContext(RowMenuContext);
  const visible = usePopupMenuSetting(kind);
  const { buttons, more } = getPopupRowActions(kind, visible, node, host);

  return (
    <>
      {buttons.map((id) => {
        const action = getPopupAction(id);
        const entry = action.popupMenu;
        if (!entry) return null;
        const label = getPopupMenuLabel(id, node, host);
        const iconName = entry.icon?.(node, host) ?? action.icon;
        const Icon = iconName ? ACTION_ICONS[iconName] : undefined;
        const busy = entry.busy?.(node, host) ?? false;
        return (
          <Button
            key={id}
            variant="ghost"
            size="icon-xs"
            data-action={id}
            className={cn(
              'size-(--popup-tree-button) aria-disabled:pointer-events-none aria-disabled:opacity-50',
              action.risk === 'destructive' && DESTRUCTIVE_BUTTON,
            )}
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
              if (!busy) entry.run(node, host);
            }}
            onKeyDown={ignoreKeyRepeat}
            aria-disabled={busy || undefined}
            aria-pressed={entry.pressed?.(node, host)}
            title={label}
            aria-label={label}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
          </Button>
        );
      })}
      {more.length > 0 && menu ? (
        <Button
          variant="ghost"
          size="icon-xs"
          data-slot="row-menu"
          className="size-(--popup-tree-button)"
          title={t('table_openMenu')}
          aria-label={t('table_openMenu')}
          aria-haspopup="menu"
          aria-expanded={menu.openId === node.id}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            menu.open({ kind, node }, event.currentTarget);
          }}
          onKeyDown={ignoreKeyRepeat}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </>
  );
}

/** One menu's items: the actions by section, with separators, or a disabled "No actions". */
function RowMenuItems({
  kind,
  node,
  part,
}: {
  kind: PopupMenuKind;
  node: BookmarkTreeNode;
  part: 'more' | 'all';
}) {
  const { actionHost: host } = usePopupTree();
  const visible = usePopupMenuSetting(kind);
  const sections = getPopupRowActions(kind, visible, node, host)[part];
  if (sections.length === 0) {
    return (
      <DropdownMenuGroup>
        <DropdownMenuItem disabled data-testid="no-menu-actions">
          {t('menu_noActions')}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    );
  }
  return sections.map((section, index) => (
    <DropdownMenuGroup key={section.join()}>
      {index > 0 && <DropdownMenuSeparator />}
      {section.map((id) => {
        const action = getPopupAction(id);
        const entry = action.popupMenu;
        if (!entry) return null;
        const iconName = entry.icon?.(node, host) ?? action.icon;
        const Icon = iconName ? ACTION_ICONS[iconName] : undefined;
        return (
          <DropdownMenuItem
            key={id}
            data-action={id}
            disabled={entry.busy?.(node, host)}
            className={
              action.risk === 'destructive'
                ? 'text-destructive-text focus:text-destructive-text'
                : undefined
            }
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
              entry.run(node, host);
            }}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {getPopupMenuLabel(id, node, host)}
          </DropdownMenuItem>
        );
      })}
    </DropdownMenuGroup>
  ));
}

type PopupRowMenusProps = {
  children: ReactNode;
  /** The row a right click at `target` is on: its kind and node, or null for no row. */
  resolveRow: (target: EventTarget | null) => RowMenuPayload | null;
};

/**
 * The tree's shared ⋯ menu and its right-click menu around `children`. A right click outside a
 * row (or on the new-folder input) leaves the browser's own menu alone.
 */
export function PopupRowMenus({ children, resolveRow }: PopupRowMenusProps) {
  const [clicked, setClicked] = useState<RowMenuPayload | null>(null);
  const [rowMenu, setRowMenu] = useState<(RowMenuPayload & { anchor: HTMLElement }) | null>(null);
  const openId = rowMenu?.node.id ?? null;
  const control = useMemo<RowMenuControl>(
    () => ({
      openId,
      open: (payload, anchor) => setRowMenu({ ...payload, anchor }),
    }),
    [openId],
  );

  return (
    <RowMenuContext.Provider value={control}>
      <ContextMenuRoot>
        <ContextMenuTrigger
          render={<div data-slot="popup-row-context-menu" className="contents" />}
          onContextMenu={(event) => {
            const row = resolveRow(event.target);
            if (!row) {
              (event as { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
              return;
            }
            setClicked(row);
          }}
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent data-testid="popup-row-context-menu">
          {clicked ? <RowMenuItems kind={clicked.kind} node={clicked.node} part="all" /> : null}
        </ContextMenuContent>
      </ContextMenuRoot>
      <DropdownMenu
        open={rowMenu !== null}
        onOpenChange={(open) => {
          if (!open) setRowMenu(null);
        }}
      >
        {rowMenu ? (
          <DropdownMenuContent align="end" anchor={rowMenu.anchor} data-testid="popup-row-menu">
            <RowMenuItems kind={rowMenu.kind} node={rowMenu.node} part="more" />
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>
    </RowMenuContext.Provider>
  );
}
