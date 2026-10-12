/**
 * Which bookmark actions each manager menu shows, in what order and sections, from
 * `config/ui/actions.toml`, and what a menu needs to render them: the sections available for the
 * clicked items, and each action's text. The actions themselves are registry entries
 * (`actions.ts`); a menu lists ids, so adding an action to a menu is a config change.
 */
import { z } from 'zod';

/** What the manager's item menus can ask of the page. */
export type ActionItemHost = {
  showDetails: (bookmark: Bookmark) => void;
  edit: (bookmark: Bookmark) => void;
  /** Starts the manager's delete flow: confirmation when enabled, then an undo toast. */
  requestDeletion: (items: Bookmark[]) => void;
  /** Reports a failed action in an error toast titled with the message `titleKey`. */
  reportError: (titleKey: string, error: unknown) => void;
  /** Whether the row is a search result from a folder other than the one open. */
  isOutsideOpenFolder: (bookmark: Bookmark) => boolean;
  /** Opens the row's folder without the search, with the row selected (Show in folder). */
  showInFolder: (bookmark: Bookmark) => void;
  /** Copies the manager address that opens this folder. */
  copyFolderLink: (folderId: string) => void;
  /** Copies the item's bookmark id, and says so. */
  copyId: (id: string) => void;
  /** The URLs opening `items` would open: bookmarks, and the bookmarks directly in folders. */
  openableUrls: (items: readonly Bookmark[]) => string[];
  /** Opens `items` (asking first for many tabs). */
  open: (items: Bookmark[], target: BookmarkOpenTarget) => void;
  /** Whether this browser lets the manager open private (incognito) windows. */
  privateWindowsAllowed: boolean;
  cut: (items: Bookmark[]) => void;
  copy: (items: Bookmark[]) => void;
  /** Pastes next to `items` (a row menu) or into them (a folder in the tree). */
  paste: (items: Bookmark[]) => void;
  /** Whether there is something to paste where `items` are. */
  canPaste: (items: readonly Bookmark[]) => boolean;
};

/** What the menus on the folder shown can ask of the page. */
export type ActionFolderHost = {
  /** Whether items can be added to or reordered in the folder shown (a folder, no search). */
  canChangeFolder: boolean;
  /** Whether the folder shown has more than one item. */
  canSort: boolean;
  /** Whether there is something to paste. */
  canPaste: boolean;
  sort: () => void;
  addBookmark: () => void;
  addFolder: () => void;
  paste: () => void;
};

/** An action's entry in an item menu. */
export type ActionItemMenu = {
  /** The text when it depends on the items, such as "Open all (12)"; the label key otherwise. */
  label?: (items: readonly Bookmark[], host: ActionItemHost) => string;
  /** Whether the menu offers it for the items (default: always). */
  available?: (items: readonly Bookmark[], host: ActionItemHost) => boolean;
  run: (items: Bookmark[], host: ActionItemHost) => void | Promise<void>;
};

/** An action's entry in a menu on the folder shown; shown disabled when it cannot run. */
export type ActionFolderMenu = {
  enabled: (host: ActionFolderHost) => boolean;
  run: (host: ActionFolderHost) => void;
};

export type ActionMenuKind = 'item' | 'organize' | 'emptySpace';

const sectionsSchema = z.array(z.array(z.string()).min(1)).min(1);

const menuConfig = readConfig(
  'ui/actions',
  z.strictObject({
    menus: z.strictObject({
      item: sectionsSchema,
      organize: sectionsSchema,
      empty_space: sectionsSchema,
    }),
    item_menu: z.strictObject({ keep_one_of: z.array(z.string()).min(1) }),
  }),
);

/** Each menu's action ids by section, as configured, checked against the registry. */
export const ACTION_MENUS: Readonly<Record<ActionMenuKind, readonly (readonly ActionId[])[]>> = {
  item: checkMenu('item', menuConfig.menus.item),
  organize: checkMenu('organize', menuConfig.menus.organize),
  emptySpace: checkMenu('emptySpace', menuConfig.menus.empty_space),
};

/**
 * Item-menu actions available for any single bookmark or folder, of which the user's menu always
 * keeps at least one shown (`managerMenuActions`), so the menu never has nothing to offer for one
 * item.
 */
export const ITEM_MENU_KEEP_ONE_OF: readonly ActionId[] = checkMenu('item', [
  menuConfig.item_menu.keep_one_of,
])[0];

/** Fails at load when a menu names an action that is unknown or cannot appear in that menu. */
function checkMenu(kind: ActionMenuKind, sections: string[][]): ActionId[][] {
  return sections.map((section) =>
    section.map((id) => {
      if (!isActionId(id)) throw new Error(`config/ui/actions.toml: unknown action "${id}"`);
      const action = getAction(id);
      const binding = kind === 'item' ? action.itemMenu : action.folderMenu;
      if (!binding) throw new Error(`config/ui/actions.toml: "${id}" has no ${kind} menu entry`);
      return id;
    }),
  );
}

/** The item-menu actions available for `items`, by section; empty sections are dropped. */
export function getItemMenuSections(
  items: readonly Bookmark[],
  host: ActionItemHost,
  sections: readonly (readonly ActionId[])[] = ACTION_MENUS.item,
): ActionId[][] {
  return sections
    .map((section) =>
      section.filter((id) => {
        const menu = getAction(id).itemMenu;
        return menu && (menu.available?.(items, host) ?? true);
      }),
    )
    .filter((section) => section.length > 0);
}

/** The text an action shows in an item menu for `items`. */
export function getItemMenuLabel(
  id: ActionId,
  items: readonly Bookmark[],
  host: ActionItemHost,
): string {
  const action = getAction(id);
  return action.itemMenu?.label?.(items, host) ?? t(action.labelKey ?? 'error_unknown');
}

/**
 * The item menu as the user arranged it (Options > Behavior, `managerMenuActions`): the
 * configured sections, each keeping only the actions the user shows, in the user's order. An
 * empty setting is the configured menu; an action the setting does not name is hidden.
 */
export function customizeItemMenu(
  visible: readonly string[],
  sections: readonly (readonly ActionId[])[] = ACTION_MENUS.item,
): ActionId[][] {
  if (visible.length === 0) return sections.map((section) => [...section]);
  const order = new Map(visible.map((id, index) => [id, index]));
  return sections
    .map((section) =>
      section
        .filter((id) => order.has(id))
        .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0)),
    )
    .filter((section) => section.length > 0);
}
