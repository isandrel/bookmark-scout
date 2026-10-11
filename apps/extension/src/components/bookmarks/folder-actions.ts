/**
 * Actions on the folder the manager shows, after Chrome's manager: the header's Organize menu
 * (Sort by name, Add new bookmark, Add new folder) and the right-click menu on the table's empty
 * space (Add new bookmark, Add new folder, Paste). One entry per action; the menus list ids.
 */

import {
  ArrowDownAZ,
  BookmarkPlus,
  ClipboardPaste,
  FolderPlus,
  type LucideIcon,
} from 'lucide-react';

export type FolderActionContext = {
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

export type FolderActionId = 'sort' | 'addBookmark' | 'addFolder' | 'paste';

export type FolderAction = {
  id: FolderActionId;
  labelKey: MessageKey;
  icon: LucideIcon;
  isEnabled: (context: FolderActionContext) => boolean;
  run: (context: FolderActionContext) => void;
};

export const FOLDER_ACTIONS: Readonly<Record<FolderActionId, FolderAction>> = {
  sort: {
    id: 'sort',
    labelKey: 'menu_sortByName',
    icon: ArrowDownAZ,
    isEnabled: (context) => context.canChangeFolder && context.canSort,
    run: (context) => context.sort(),
  },
  addBookmark: {
    id: 'addBookmark',
    labelKey: 'menu_addBookmark',
    icon: BookmarkPlus,
    isEnabled: (context) => context.canChangeFolder,
    run: (context) => context.addBookmark(),
  },
  addFolder: {
    id: 'addFolder',
    labelKey: 'menu_addFolder',
    icon: FolderPlus,
    isEnabled: (context) => context.canChangeFolder,
    run: (context) => context.addFolder(),
  },
  paste: {
    id: 'paste',
    labelKey: 'menu_paste',
    icon: ClipboardPaste,
    isEnabled: (context) => context.canChangeFolder && context.canPaste,
    run: (context) => context.paste(),
  },
};

/** Each menu's sections of folder actions, separated in the menu. */
export const FOLDER_ACTION_MENUS = {
  organize: [['sort'], ['addBookmark', 'addFolder']],
  emptySpace: [['addBookmark', 'addFolder'], ['paste']],
} as const satisfies Record<string, readonly (readonly FolderActionId[])[]>;
