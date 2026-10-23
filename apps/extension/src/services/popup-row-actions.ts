/**
 * The popup and side panel tree rows' actions: which item actions (`item-actions.ts`, entries of
 * the action registry with a `popupMenu`) a bookmark row and a folder row offer, in what order and
 * sections (`config/ui/popup-actions.toml`), how many are buttons, and the user's arrangement
 * (`popupBookmarkMenu`, `popupFolderMenu`). Each action runs through the page's `ActionPopupHost`.
 *
 * This module reads only the item actions, not the whole registry (`actions.ts`), whose agent
 * tools the popup never needs at startup.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';
import type { BookmarkTreeNode } from '@/types';

/** What the popup and side panel tree's row actions can ask of the page, for one row's node. */
export type ActionPopupHost = {
  /** Whether the node may be deleted: not a permanent folder, not managed by the browser. */
  canModify: (node: BookmarkTreeNode) => boolean;
  /** Whether bookmarks and folders can be added inside the folder. */
  canAddTo: (folder: BookmarkTreeNode) => boolean;
  /** Whether the folder has folders inside it. */
  hasSubfolders: (folder: BookmarkTreeNode) => boolean;
  /** Whether the folder is open and so is every folder inside it. */
  allSubfoldersExpanded: (folder: BookmarkTreeNode) => boolean;
  /** Opens the folder and every folder inside it, or closes those inside when all are open. */
  toggleSubfolders: (folder: BookmarkTreeNode) => void;
  /** Whether the current page is being saved into the folder, so Add waits. */
  isSaving: (folder: BookmarkTreeNode) => boolean;
  /** Saves the current page into the folder. */
  addBookmark: (folder: BookmarkTreeNode) => void;
  /** Shows the new-folder input inside the folder. */
  addFolder: (folder: BookmarkTreeNode) => void;
  /** Starts the popup's delete flow: confirmation when enabled, then an undo toast. */
  requestDeletion: (node: BookmarkTreeNode) => void;
  /** The URLs opening the node would open: the bookmark, or the bookmarks directly in a folder. */
  openableUrls: (node: BookmarkTreeNode) => string[];
  /** Opens the node (asking first for many tabs). */
  open: (node: BookmarkTreeNode, target: BookmarkOpenTarget) => void;
  /** Whether this browser lets the extension open private (incognito) windows. */
  privateWindowsAllowed: boolean;
};

/**
 * An action's entry on the popup tree's rows: a button over the row's end or an item of its ⋯
 * and right-click menus, by where the user's menu puts it.
 */
export type ActionPopupMenu = {
  /** What the popup and Options call it, where that differs from the action's label. */
  labelKey?: MessageKey;
  /** The text when it depends on the row, such as "Open all (12)"; the name otherwise. */
  label?: (node: BookmarkTreeNode, host: ActionPopupHost) => string;
  /** The icon when it depends on the row (Expand or Collapse); the action's icon otherwise. */
  icon?: (node: BookmarkTreeNode, host: ActionPopupHost) => ActionIconName;
  /** For a toggle, whether it is on (`aria-pressed`). */
  pressed?: (node: BookmarkTreeNode, host: ActionPopupHost) => boolean;
  /** Whether the row offers it (default: always). */
  available?: (node: BookmarkTreeNode, host: ActionPopupHost) => boolean;
  /** Shown but inactive for now, such as Add while the page is still being saved there. */
  busy?: (node: BookmarkTreeNode, host: ActionPopupHost) => boolean;
  run: (node: BookmarkTreeNode, host: ActionPopupHost) => void;
};

/** The popup tree's two kinds of row. */
export type PopupMenuKind = 'bookmark' | 'folder';

/** An item action, by id. */
export type PopupActionId = keyof typeof ITEM_ACTIONS;

const sectionsSchema = z.array(z.array(z.string()).min(1)).min(1);
const byKind = <S extends z.ZodType>(schema: S) =>
  z.strictObject({ bookmark: schema, folder: schema });

const popupConfig = readConfig(
  'ui/popup-actions',
  z.strictObject({
    menus: byKind(sectionsSchema),
    buttons: byKind(boundedNumber({ integer: true })),
    keep_one_of: byKind(z.array(z.string()).min(1)),
  }),
);

export function isPopupActionId(id: string): id is PopupActionId {
  return Object.hasOwn(ITEM_ACTIONS, id);
}

/** The item action `id`, with its types erased, as the rows read it. */
export function getPopupAction(id: PopupActionId): ActionDefinition<unknown, unknown> {
  return ITEM_ACTIONS[id] as ActionDefinition<unknown, unknown>;
}

/** Fails at load when a menu names an unknown action or one with no popup entry for the row. */
function checkMenu(kind: PopupMenuKind, sections: string[][]): PopupActionId[][] {
  return sections.map((section) =>
    section.map((id) => {
      if (!isPopupActionId(id)) {
        throw new Error(`config/ui/popup-actions.toml: unknown action "${id}"`);
      }
      const action = getPopupAction(id);
      // A row acts on one bookmark or one folder, so the action must take that target.
      if (!action.popupMenu || !action.targets.includes(kind)) {
        throw new Error(`config/ui/popup-actions.toml: "${id}" has no popup ${kind} entry`);
      }
      return id;
    }),
  );
}

/** For each popup row menu: its configured sections, setting, buttons, and kept actions. */
export const POPUP_MENUS: Readonly<
  Record<
    PopupMenuKind,
    {
      sections: readonly (readonly PopupActionId[])[];
      setting: 'popupBookmarkMenu' | 'popupFolderMenu';
      /** How many of the menu's first actions are buttons on the row. */
      buttons: number;
      /** Options keeps at least one of these shown. */
      keepOneOf: readonly PopupActionId[];
    }
  >
> = {
  bookmark: {
    sections: checkMenu('bookmark', popupConfig.menus.bookmark),
    setting: 'popupBookmarkMenu',
    buttons: popupConfig.buttons.bookmark,
    keepOneOf: checkMenu('bookmark', [popupConfig.keep_one_of.bookmark])[0],
  },
  folder: {
    sections: checkMenu('folder', popupConfig.menus.folder),
    setting: 'popupFolderMenu',
    buttons: popupConfig.buttons.folder,
    keepOneOf: checkMenu('folder', [popupConfig.keep_one_of.folder])[0],
  },
};

/**
 * A popup menu as the user arranged it: the configured sections, each keeping only the actions
 * the user shows, in the user's order (`readShownIds`). An empty setting is the configured menu,
 * and an action added since the setting was saved shows until the user hides it.
 */
export function customizePopupMenu(kind: PopupMenuKind, stored: readonly string[]) {
  const { sections } = POPUP_MENUS[kind];
  const visible = readShownIds(stored, sections.flat());
  const order = new Map(visible.map((id, index) => [id, index]));
  return sections
    .map((section) =>
      section
        .filter((id) => order.has(id))
        .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0)),
    )
    .filter((section) => section.length > 0);
}

/** A popup row's actions as the user arranged them, split into its buttons and its ⋯ menu. */
export type PopupRowActions = {
  /** The first actions of the user's menu that apply to the row, shown as buttons. */
  buttons: PopupActionId[];
  /** The rest that apply, by section, for the ⋯ menu. */
  more: PopupActionId[][];
  /** Every action that applies, by section, for the right-click menu. */
  all: PopupActionId[][];
};

/**
 * The actions a popup row shows: the user's menu (`visible`), its first `buttons` actions as
 * buttons and the rest in ⋯, each kept only where it applies to `node`. A button that does not
 * apply is left out, not replaced by a later action.
 */
export function getPopupRowActions(
  kind: PopupMenuKind,
  visible: readonly string[],
  node: BookmarkTreeNode,
  host: ActionPopupHost,
): PopupRowActions {
  const arranged = customizePopupMenu(kind, visible);
  const applies = (id: PopupActionId) =>
    getPopupAction(id).popupMenu?.available?.(node, host) ?? true;
  const buttonIds = new Set(arranged.flat().slice(0, POPUP_MENUS[kind].buttons));
  const keep = (include: (id: PopupActionId) => boolean) =>
    arranged
      .map((section) => section.filter((id) => include(id) && applies(id)))
      .filter((section) => section.length > 0);
  return {
    buttons: arranged.flat().filter((id) => buttonIds.has(id) && applies(id)),
    more: keep((id) => !buttonIds.has(id)),
    all: keep(() => true),
  };
}

/** What the popup calls an action, apart from any row (Options lists it so). */
export function getPopupActionName(id: PopupActionId): string {
  const action = getPopupAction(id);
  return t(action.popupMenu?.labelKey ?? action.labelKey ?? 'error_unknown');
}

/** The text a popup row shows for an action: its own wording for the row, else its name. */
export function getPopupMenuLabel(
  id: PopupActionId,
  node: BookmarkTreeNode,
  host: ActionPopupHost,
): string {
  return getPopupAction(id).popupMenu?.label?.(node, host) ?? getPopupActionName(id);
}
