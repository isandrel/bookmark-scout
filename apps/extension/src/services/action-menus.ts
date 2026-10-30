/**
 * Which bookmark actions each manager menu shows, in what order and sections, from
 * `config/ui/actions.toml`, and what a menu needs to render them: the sections available for the
 * clicked items, and each action's text. The actions themselves are registry entries
 * (`actions.ts`); a menu lists ids, so adding an action to a menu is a config change. The user
 * hides, reorders, and moves actions between sections of every menu in Options (`customizeMenu`).
 */
import { z } from 'zod';

/** What the manager's item menus can ask of the page. */
export type ActionItemHost = {
  showDetails: (bookmark: Bookmark) => void;
  /** Opens the bookmark's preview: its cover, folder, tags, and summary, with its actions. */
  preview: (bookmark: Bookmark) => void;
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
  /** Whether the bookmark has a stored cover for its current address. */
  hasCover: (bookmark: Bookmark) => boolean;
  /** Deletes the stored covers of `items` that have one, with Undo. */
  removeCovers: (items: Bookmark[]) => void;
  /** Whether Fetch Covers is on, so its covers can be fetched for chosen bookmarks. */
  canFetchCovers: boolean;
  /** The bookmarks among `items` and every bookmark inside the folders among them, at any depth. */
  bookmarksWithin: (items: readonly Bookmark[]) => Bookmark[];
  /** Runs Fetch Covers on exactly `items`, asking for their sites first, with its review. */
  fetchCovers: (items: Bookmark[]) => void;
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

export type ActionMenuKind = 'item' | 'organize' | 'emptySpace' | 'preview';

/** Every manager menu, in the order Options shows them. */
export const ACTION_MENU_KINDS = [
  'item',
  'organize',
  'emptySpace',
  'preview',
] as const satisfies readonly ActionMenuKind[];

const sectionsSchema = z.array(z.array(z.string()).min(1)).min(1);
const keepOneSchema = z.array(z.string()).min(1).optional();

const menuConfig = readConfig(
  'ui/actions',
  z.strictObject({
    menus: z.strictObject({
      item: sectionsSchema,
      organize: sectionsSchema,
      empty_space: sectionsSchema,
      preview: sectionsSchema,
    }),
    keep_one_of: z.strictObject({
      item: keepOneSchema,
      organize: keepOneSchema,
      empty_space: keepOneSchema,
      preview: keepOneSchema,
    }),
  }),
);

/** Each menu's action ids by section, as configured, checked against the registry. */
export const ACTION_MENUS: Readonly<Record<ActionMenuKind, readonly (readonly ActionId[])[]>> = {
  item: checkMenu('item', menuConfig.menus.item),
  organize: checkMenu('organize', menuConfig.menus.organize),
  emptySpace: checkMenu('emptySpace', menuConfig.menus.empty_space),
  preview: checkMenu('preview', menuConfig.menus.preview),
};

/**
 * Per menu, actions of which the user's menu always keeps at least one shown, such as the item
 * menu's commands available for any single bookmark or folder, so it never has nothing to offer
 * for one item. Empty where the config names none; every menu keeps at least one action anyway.
 */
export const MENU_KEEP_ONE_OF: Readonly<Record<ActionMenuKind, readonly ActionId[]>> = {
  item: checkKept('item', menuConfig.keep_one_of.item),
  organize: checkKept('organize', menuConfig.keep_one_of.organize),
  emptySpace: checkKept('emptySpace', menuConfig.keep_one_of.empty_space),
  preview: checkKept('preview', menuConfig.keep_one_of.preview),
};

/** The setting that holds each menu as the user arranged it (Options > Behavior). */
export const MENU_SETTING_KEYS = {
  item: 'managerMenuActions',
  organize: 'managerOrganizeMenu',
  emptySpace: 'managerEmptySpaceMenu',
  preview: 'managerPreviewMenu',
} as const satisfies Record<ActionMenuKind, keyof Settings>;

/** Fails at load when a menu names an action that is unknown or cannot appear in that menu. */
function checkMenu(kind: ActionMenuKind, sections: string[][]): ActionId[][] {
  return sections.map((section) =>
    section.map((id) => {
      if (!isActionId(id)) throw new Error(`config/ui/actions.toml: unknown action "${id}"`);
      const action = getAction(id);
      // The preview's buttons act on the bookmark shown, as an item menu does.
      const binding = kind === 'item' || kind === 'preview' ? action.itemMenu : action.folderMenu;
      if (!binding) throw new Error(`config/ui/actions.toml: "${id}" has no ${kind} menu entry`);
      return id;
    }),
  );
}

/** Fails at load when a kept action is not in its menu. */
function checkKept(kind: ActionMenuKind, ids: string[] | undefined): ActionId[] {
  const inMenu = new Set<string>(ACTION_MENUS[kind].flat());
  return (ids ?? []).map((id) => {
    if (!inMenu.has(id))
      throw new Error(`config/ui/actions.toml: "${id}" is not in the ${kind} menu`);
    return id as ActionId;
  });
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
 * Runs an item-menu action on `items` from outside a menu (a key or a dialog's button), only
 * where its menu would offer it; false when it does not apply to them.
 */
export function runItemMenuAction(id: ActionId, items: Bookmark[], host: ActionItemHost): boolean {
  const menu = getAction(id).itemMenu;
  if (!menu || !isItemMenuActionAvailable(id, items, host)) return false;
  void menu.run(items, host);
  return true;
}

/** Whether an item-menu action applies to `items`, as its menu would offer it. */
export function isItemMenuActionAvailable(
  id: ActionId,
  items: readonly Bookmark[],
  host: ActionItemHost,
): boolean {
  const menu = getAction(id).itemMenu;
  return Boolean(menu) && (menu?.available?.(items, host) ?? true);
}

/**
 * A menu as the user arranged it in Options (`MENU_SETTING_KEYS`): its sections, the first action
 * of each marked by `MENU_SECTION_START` in the stored list, with the actions shown in the user's
 * order; ids that are not in the configured menu are left out. Actions the user hid are stored
 * marked (`HIDDEN_ID_MARK`); an action of the menu the setting does not name at all was added
 * since it was saved and shows in its configured place (`placeAddedIds`), so an empty setting
 * is the configured menu. (An item menu stored by 0.3.4 named only the actions it showed; the
 * storage migration `2026-10-sync-list-shards` writes it in this form when it moves it.)
 */
export function customizeMenu(kind: ActionMenuKind, stored: readonly string[]): ActionId[][] {
  const configured = ACTION_MENUS[kind];
  const { shown, added } = splitShownIds(
    stored.map((entry) =>
      entry.startsWith(MENU_SECTION_START) ? entry.slice(MENU_SECTION_START.length) : entry,
    ),
    configured.flat(),
  );
  const inMenu = new Set<string>(shown);
  const seen = new Set<string>();
  const sections: ActionId[][] = [[]];
  for (const entry of stored) {
    if (hiddenIdOf(entry) !== undefined) continue;
    const startsSection = entry.startsWith(MENU_SECTION_START);
    const id = startsSection ? entry.slice(MENU_SECTION_START.length) : entry;
    if (startsSection) sections.push([]);
    if (inMenu.has(id) && !seen.has(id)) {
      seen.add(id);
      sections[sections.length - 1]?.push(id as ActionId);
    }
  }
  return placeAddedIds(
    sections.filter((section) => section.length > 0),
    added,
    configured,
  );
}

/**
 * What the setting stores for `sections` of `kind`'s menu: their actions, the first of each
 * section marked, then the menu's other actions marked hidden.
 */
export function encodeMenu(
  kind: ActionMenuKind,
  sections: readonly (readonly ActionId[])[],
): string[] {
  return [
    ...sections.flatMap((section) =>
      section.map((id, index) => (index === 0 ? `${MENU_SECTION_START}${id}` : id)),
    ),
    ...hiddenEntries(sections.flat(), ACTION_MENUS[kind].flat()),
  ];
}

/** The actions of a menu the user hid: those it can show and `sections` leave out. */
export function getHiddenMenuActions(
  kind: ActionMenuKind,
  sections: readonly (readonly ActionId[])[],
): ActionId[] {
  const shown = new Set(sections.flat());
  return ACTION_MENUS[kind].flat().filter((id) => !shown.has(id));
}

/**
 * Whether hiding `id` would leave the menu with nothing it must keep: the last shown action, or
 * the last shown of the menu's `MENU_KEEP_ONE_OF`.
 */
export function isLastKeptMenuAction(
  kind: ActionMenuKind,
  sections: readonly (readonly ActionId[])[],
  id: ActionId,
): boolean {
  const shown = sections.flat();
  if (!shown.includes(id)) return false;
  if (shown.length === 1) return true;
  const kept = MENU_KEEP_ONE_OF[kind];
  return kept.includes(id) && !kept.some((other) => other !== id && shown.includes(other));
}
