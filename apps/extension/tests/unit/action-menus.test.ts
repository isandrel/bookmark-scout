import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BookmarkActionMenuItems } from '@/components/ui/table/bookmark-row-menu';
import { setLanguage } from '@/hooks/use-i18n';
import type { Bookmark } from '@/lib/manager-bookmark';
import {
  ACTION_MENUS,
  type ActionItemHost,
  getItemMenuLabel,
  getItemMenuSections,
} from '@/services/action-menus';
import { ACTION_IDS, type ActionId, getAction } from '@/services/actions';
import enMessages from '../../public/_locales/en/messages.json';
import { readConfigToml } from '../config-files';
import { createFolderHost, createItemHost, folder, link } from './action-menu-helpers';

const sections = (items: Bookmark[], host: ActionItemHost = createItemHost()) =>
  getItemMenuSections(items, host);

function renderMenu(items: Bookmark[], menuSections?: ActionId[][]) {
  // The real menu renders its content in a portal, which does not render on the server, so the
  // items are rendered directly in an open menu root.
  return renderToStaticMarkup(
    createElement(
      MenuPrimitive.Root,
      { open: true, modal: false },
      createElement(BookmarkActionMenuItems, {
        items,
        host: createItemHost(),
        ...(menuSections ? { sections: menuSections } : {}),
      }),
    ),
  );
}

describe('bookmark action menus', () => {
  beforeAll(() => setLanguage('en'));
  afterAll(() => setLanguage('auto'));

  it('take their items, order, and sections from config/ui/actions.toml', () => {
    const config = readConfigToml('ui/actions.toml') as {
      menus: { item: string[][]; organize: string[][]; empty_space: string[][] };
    };
    expect(ACTION_MENUS).toEqual({
      item: config.menus.item,
      organize: config.menus.organize,
      emptySpace: config.menus.empty_space,
    });
  });

  it('names every menu action with an existing message and an icon', () => {
    const menuActions = ACTION_IDS.filter((id) => {
      const action = getAction(id);
      return action.itemMenu || action.folderMenu;
    });
    expect(menuActions.length).toBeGreaterThan(0);
    for (const id of menuActions) {
      const action = getAction(id);
      expect(action.labelKey && action.labelKey in enMessages, id).toBe(true);
      expect(action.icon, id).toBeTruthy();
    }
  });

  it('shows the actions a menu lists, in that order, where they are available', () => {
    // A menu is a list of ids: reordering or adding one is a config change, not code.
    const custom: ActionId[][] = [['copyId', 'viewDetails'], ['delete']];
    const markup = renderMenu([link], custom);
    expect(markup.indexOf('Copy Bookmark ID')).toBeLessThan(markup.indexOf('View Details'));
    expect(markup.indexOf('View Details')).toBeLessThan(markup.indexOf('Delete'));
    expect(markup).not.toContain('Open in new tab');
    // Destructive actions are drawn in the destructive color.
    expect(markup).toMatch(
      /text-destructive-text[^>]*data-action="delete"|data-action="delete"[^>]*text-destructive-text/,
    );
  });

  it('offers a link the configured item menu, by section', () => {
    expect(sections([link])).toEqual([
      ['edit', 'viewDetails'],
      ['cut', 'copy', 'copyId'],
      ['openInNewTab', 'openInNewWindow', 'openInPrivateWindow'],
      ['delete'],
    ]);
  });

  it('keeps edit, cut, and delete off rows the browser does not allow changing', () => {
    const rootFolder: Bookmark = { ...folder, id: '1', isRootFolder: true };
    const host = createItemHost({ isOutsideOpenFolder: () => true });
    expect(sections([rootFolder], host)).toEqual([['viewDetails'], ['copyFolderLink', 'copyId']]);
  });

  it('acts on several items: no single-item actions, and Open all counts the bookmarks', () => {
    const second: Bookmark = { ...link, id: 'link-2', url: 'https://example.org/' };
    const host = createItemHost({ canPaste: () => true });
    expect(sections([link, second], host)).toEqual([
      ['cut', 'copy', 'paste'],
      ['openInNewTab', 'openInNewWindow', 'openInPrivateWindow'],
      ['delete'],
    ]);
    expect(getItemMenuLabel('openInNewTab', [link, second], host)).toBe('Open all (2)');
    expect(getItemMenuLabel('openInNewTab', [link], host)).toBe('Open in new tab');
    void getAction('openInNewTab').itemMenu?.run([link, second], host);
    expect(host.open).toHaveBeenCalledWith([link, second], 'background-tabs');
    // A private window is offered only where the browser allows it.
    expect(sections([link], createItemHost({ privateWindowsAllowed: false }))[2]).toEqual([
      'openInNewTab',
      'openInNewWindow',
    ]);
  });

  it('names a folder edit Rename', () => {
    expect(getItemMenuLabel('edit', [folder], createItemHost())).toBe('Rename');
    expect(getItemMenuLabel('edit', [link], createItemHost())).toBe('Edit');
  });

  it('offers Show in folder only on search results from another folder', () => {
    expect(sections([link])[0]).not.toContain('showInFolder');
    const host = createItemHost({ isOutsideOpenFolder: () => true });
    expect(sections([link], host)[0]).toEqual(['showInFolder', 'edit', 'viewDetails']);
    void getAction('showInFolder').itemMenu?.run([link], host);
    expect(host.showInFolder).toHaveBeenCalledWith(link);
  });

  it('enables the folder menus by what the folder shown allows', () => {
    const host = createFolderHost({ canSort: false });
    const enabled = (menu: 'organize' | 'emptySpace') =>
      ACTION_MENUS[menu].flat().filter((id) => getAction(id).folderMenu?.enabled(host));
    expect(enabled('organize')).toEqual(['addBookmark', 'addFolder']);
    expect(enabled('emptySpace')).toEqual(['addBookmark', 'addFolder']);
    getAction('sortByName').folderMenu?.run(host);
    expect(host.sort).toHaveBeenCalled();
  });

  it('does not let a menu-only action be called as an agent tool', async () => {
    const { runAction } = await import('@/services/actions');
    expect(
      await runAction(
        'delete',
        { refs: ['b:1'] },
        {
          client: { kind: 'askAI' },
          settings: {} as Settings,
          activeTab: async () => undefined,
        },
      ),
    ).toMatchObject({ error: { code: 'not_allowed' } });
  });
});
