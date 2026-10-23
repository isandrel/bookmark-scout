import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import { defaultSettings, getSettingScope } from '@/lib/settings-schema';
import {
  type ActionPopupHost,
  getPopupAction as getAction,
  getPopupActionName,
  getPopupMenuLabel,
  getPopupRowActions,
  POPUP_MENUS,
} from '@/services/popup-row-actions';
import type { BookmarkTreeNode } from '@/types';
import enMessages from '../../public/_locales/en/messages.json';
import { readConfigToml } from '../config-files';

const bookmark: BookmarkTreeNode = {
  id: 'b1',
  parentId: 'f1',
  title: 'Example',
  url: 'https://example.com/',
};
const sub: BookmarkTreeNode = { id: 'f2', parentId: 'f1', title: 'Sub', children: [] };
const folder: BookmarkTreeNode = {
  id: 'f1',
  parentId: '1',
  title: 'Reading',
  children: [bookmark, sub],
};

function createPopupHost(overrides: Partial<ActionPopupHost> = {}): ActionPopupHost {
  return {
    canModify: () => true,
    canAddTo: () => true,
    hasSubfolders: (node) => node.children?.some((child) => child.children) ?? false,
    allSubfoldersExpanded: () => false,
    toggleSubfolders: vi.fn(),
    isSaving: () => false,
    addBookmark: vi.fn(),
    addFolder: vi.fn(),
    requestDeletion: vi.fn(),
    openableUrls: (node) =>
      node.children
        ? node.children.flatMap((child) => (child.url ? [child.url] : []))
        : node.url
          ? [node.url]
          : [],
    open: vi.fn(),
    privateWindowsAllowed: true,
    ...overrides,
  };
}

describe('popup row actions', () => {
  beforeAll(() => setLanguage('en'));
  afterAll(() => setLanguage('auto'));

  it('take their menus, buttons, and kept actions from config/ui/popup-actions.toml', () => {
    type ByKind<T> = { bookmark: T; folder: T };
    const config = readConfigToml('ui/popup-actions.toml') as {
      menus: ByKind<string[][]>;
      buttons: ByKind<{ value: number }>;
      keep_one_of: ByKind<string[]>;
    };
    for (const kind of ['bookmark', 'folder'] as const) {
      expect(POPUP_MENUS[kind].sections).toEqual(config.menus[kind]);
      expect(POPUP_MENUS[kind].buttons).toBe(config.buttons[kind].value);
      expect(POPUP_MENUS[kind].keepOneOf).toEqual(config.keep_one_of[kind]);
    }
  });

  it('keep each kept action in its menu, and every popup action named and drawn', () => {
    for (const menu of Object.values(POPUP_MENUS)) {
      for (const id of menu.keepOneOf) expect(menu.sections.flat()).toContain(id);
      for (const id of menu.sections.flat()) {
        const action = getAction(id);
        expect(action.popupMenu, id).toBeDefined();
        expect(action.icon, id).toBeTruthy();
        const key = action.popupMenu?.labelKey ?? action.labelKey;
        expect(key && key in enMessages, id).toBe(true);
      }
    }
  });

  it('sync the user menus, like the manager menus, starting from the configured menus', () => {
    expect(defaultSettings.popupBookmarkMenu).toEqual([]);
    expect(defaultSettings.popupFolderMenu).toEqual([]);
    expect(getSettingScope('popupBookmarkMenu')).toBe('lists');
    expect(getSettingScope('popupFolderMenu')).toBe('lists');
  });

  it('show today’s buttons by default: Delete on a bookmark, four on a folder, the rest in ⋯', () => {
    const host = createPopupHost();
    expect(getPopupRowActions('bookmark', [], bookmark, host)).toEqual({
      buttons: ['delete'],
      more: [['openInNewTab', 'openInNewWindow', 'openInPrivateWindow']],
      all: [['delete'], ['openInNewTab', 'openInNewWindow', 'openInPrivateWindow']],
    });
    const folderActions = getPopupRowActions('folder', [], folder, host);
    expect(folderActions.buttons).toEqual([
      'expandSubfolders',
      'addBookmark',
      'addFolder',
      'delete',
    ]);
    expect(folderActions.more).toEqual([
      ['openInNewTab', 'openInNewWindow', 'openInPrivateWindow'],
    ]);
  });

  it('leave out what does not apply without moving a later action onto the row', () => {
    const host = createPopupHost({ canModify: () => false, privateWindowsAllowed: false });
    const empty: BookmarkTreeNode = { ...folder, children: [] };
    expect(getPopupRowActions('folder', [], empty, host)).toEqual({
      buttons: ['addBookmark', 'addFolder'],
      more: [],
      all: [['addBookmark', 'addFolder']],
    });
    // A Firefox separator opens nothing.
    const separator: BookmarkTreeNode = { ...bookmark, url: undefined, type: 'separator' };
    expect(getPopupRowActions('bookmark', [], separator, createPopupHost()).more).toEqual([]);
  });

  it('hide and reorder actions as the user arranged them, the first ones as buttons', () => {
    const host = createPopupHost();
    const actions = getPopupRowActions(
      'bookmark',
      ['openInNewWindow', 'openInNewTab', 'delete'],
      bookmark,
      host,
    );
    // Order within a group follows the setting; groups keep their configured order.
    expect(actions.all).toEqual([['delete'], ['openInNewWindow', 'openInNewTab']]);
    expect(actions.buttons).toEqual(['delete']);
    // Hiding Delete makes the next action the button.
    expect(getPopupRowActions('bookmark', ['openInNewTab'], bookmark, host)).toEqual({
      buttons: ['openInNewTab'],
      more: [],
      all: [['openInNewTab']],
    });
  });

  it('run through the page host and word each action for the row', () => {
    const host = createPopupHost({ allSubfoldersExpanded: () => true });
    expect(getPopupMenuLabel('expandSubfolders', folder, host)).toBe('Collapse all subfolders');
    expect(getAction('expandSubfolders').popupMenu?.icon?.(folder, host)).toBe('chevronsUp');
    expect(getAction('expandSubfolders').popupMenu?.pressed?.(folder, host)).toBe(true);
    expect(getPopupMenuLabel('delete', folder, host)).toBe('Delete folder');
    expect(getPopupMenuLabel('delete', bookmark, host)).toBe('Delete bookmark');
    expect(getPopupMenuLabel('openInNewTab', folder, host)).toBe('Open all (1)');
    expect(getPopupActionName('addBookmark')).toBe('Add current page');

    getAction('openInNewTab').popupMenu?.run(folder, host);
    expect(host.open).toHaveBeenCalledWith(folder, 'background-tabs');
    getAction('openInNewTab').popupMenu?.run(bookmark, host);
    expect(host.open).toHaveBeenLastCalledWith(bookmark, 'tabs');
    getAction('delete').popupMenu?.run(bookmark, host);
    expect(host.requestDeletion).toHaveBeenCalledWith(bookmark);
    getAction('addFolder').popupMenu?.run(folder, host);
    expect(host.addFolder).toHaveBeenCalledWith(folder);
    getAction('expandSubfolders').popupMenu?.run(folder, host);
    expect(host.toggleSubfolders).toHaveBeenCalledWith(folder);
  });

  it('show Add as busy while the page is still being saved into that folder', () => {
    const host = createPopupHost({ isSaving: () => true });
    expect(getAction('addBookmark').popupMenu?.busy?.(folder, host)).toBe(true);
  });
});
