import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BookmarkActionMenuItems } from '@/components/ui/table/bookmark-row-menu';
import { setLanguage } from '@/hooks/use-i18n';
import { type Bookmark, ItemTypeEnum, previewNeighbors } from '@/lib/manager-bookmark';
import { getSettingScope, getSettingsFieldMeta, settingsSchema } from '@/lib/settings-schema';
import {
  ACTION_MENU_KINDS,
  ACTION_MENUS,
  type ActionItemHost,
  customizeMenu,
  encodeMenu,
  getHiddenMenuActions,
  getItemMenuLabel,
  getItemMenuSections,
  isLastKeptMenuAction,
  MENU_KEEP_ONE_OF,
  MENU_SETTING_KEYS,
  runItemMenuAction,
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
      menus: {
        item: string[][];
        organize: string[][];
        empty_space: string[][];
        preview: string[][];
      };
    };
    expect(ACTION_MENUS).toEqual({
      item: config.menus.item,
      organize: config.menus.organize,
      emptySpace: config.menus.empty_space,
      preview: config.menus.preview,
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
      ['preview', 'edit', 'viewDetails'],
      ['cut', 'copy', 'copyId'],
      ['openInNewTab', 'openInNewWindow', 'openInPrivateWindow'],
      ['delete'],
    ]);
  });

  it('offers a Firefox separator only what works on one: no edit, details, or open', () => {
    const separator: Bookmark = {
      ...link,
      id: 'separator-1',
      type: ItemTypeEnum.Separator,
      title: '',
      url: undefined,
    };
    expect(sections([separator])).toEqual([['cut', 'copy', 'copyId'], ['delete']]);
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

  it('offers Fetch cover for web bookmarks while Fetch Covers is on, and Remove cover only where a cover is stored', () => {
    const second: Bookmark = { ...link, id: 'link-2', url: 'https://example.org/' };
    const local: Bookmark = { ...link, id: 'link-3', url: 'file:///notes.html' };
    // Off by default here: neither shows.
    expect(sections([link]).flat()).not.toContain('fetchCover');
    expect(sections([link]).flat()).not.toContain('removeCover');
    const host = createItemHost({
      canFetchCovers: true,
      hasCover: (item) => item.id === 'link-2',
    });
    expect(sections([link], host).at(-1)).toEqual(['fetchCover', 'delete']);
    expect(sections([second], host).at(-1)).toEqual(['fetchCover', 'removeCover', 'delete']);
    // Never for a folder, or a page Fetch Covers cannot read.
    expect(sections([folder], host).flat()).not.toContain('fetchCover');
    expect(sections([local], host).flat()).not.toContain('fetchCover');
    // A selection: each runs on exactly the bookmarks it applies to.
    expect(runItemMenuAction('fetchCover', [link, local, second, folder], host)).toBe(true);
    expect(host.fetchCovers).toHaveBeenCalledWith([link, second]);
    expect(runItemMenuAction('removeCover', [link, second], host)).toBe(true);
    expect(host.removeCovers).toHaveBeenCalledWith([second]);
    expect(runItemMenuAction('removeCover', [link], host)).toBe(false);
    // Fetch Covers turned off: no Fetch cover, however many bookmarks.
    expect(sections([link, second], createItemHost({ hasCover: () => true })).at(-1)).toEqual([
      'removeCover',
      'delete',
    ]);
  });

  it('hide and reorder item-menu actions as the user arranged them', () => {
    expect(customizeMenu('item', [])).toEqual(ACTION_MENUS.item);
    // The user's sections and order, without what they hid; actions the list does not name show
    // in their configured place. (0.3.4's unmarked item menu is converted by its storage
    // migration, `tests/unit/migrations/2026-10-sync-list-shards.test.ts`.)
    const hidden = ACTION_MENUS.item
      .flat()
      .filter((id) => !['preview', 'edit', 'copyId'].includes(id))
      .map((id) => `!${id}`);
    const custom = customizeMenu('item', ['-copyId', '-edit', ...hidden]);
    expect(custom).toEqual([['copyId'], ['preview', 'edit']]);
    expect(getItemMenuSections([link], createItemHost(), custom)).toEqual([
      ['copyId'],
      ['preview', 'edit'],
    ]);
    // A list with no marks reads as any list of shown ids: its order kept, every other action shown.
    const plain = customizeMenu('item', ['delete', 'edit']).flat();
    expect([...plain].sort()).toEqual([...ACTION_MENUS.item.flat()].sort());
    expect(plain.indexOf('delete')).toBeLessThan(plain.indexOf('edit'));
    // Hidden once more, they stay hidden.
    const rearranged = encodeMenu('item', [['edit'], ['copyId']]);
    expect(customizeMenu('item', rearranged)).toEqual([['edit'], ['copyId']]);
  });

  it('shows an action added after the user arranged a menu, in its configured place', () => {
    for (const kind of ACTION_MENU_KINDS) {
      const configured = ACTION_MENUS[kind];
      for (const added of configured.flat()) {
        // The user's menu as saved before `added` existed: every other action, one hidden.
        const others = configured
          .map((section) => section.filter((id) => id !== added))
          .filter((section) => section.length > 0);
        const hidden = others.flat().find((id) => !MENU_KEEP_ONE_OF[kind].includes(id));
        const saved = encodeMenu(
          kind,
          others
            .map((section) => section.filter((id) => id !== hidden))
            .filter((s) => s.length > 0),
        ).filter((entry) => entry !== `!${added}`);
        const menu = customizeMenu(kind, saved);
        expect(menu.flat(), `${kind}: ${added}`).toContain(added);
        if (hidden && hidden !== added)
          expect(menu.flat(), `${kind}: ${hidden}`).not.toContain(hidden);
        // Beside the configured action before it, or the one after it.
        const section = configured.find((ids) => ids.includes(added)) ?? [];
        const index = section.indexOf(added);
        const shown = menu.flat();
        const neighbor = [...section.slice(0, index)].reverse().find((id) => shown.includes(id));
        if (neighbor)
          expect(shown.indexOf(added), `${kind}: ${added}`).toBe(shown.indexOf(neighbor) + 1);
      }
    }
  });

  it('moves actions between sections, hides and reorders them, in every menu', () => {
    // Each section's first action is marked, so sections cost no entries of their own.
    const moved = encodeMenu('item', [
      ['delete', 'edit'],
      ['copy', 'viewDetails'],
    ]);
    expect(moved.slice(0, 4)).toEqual(['-delete', 'edit', '-copy', 'viewDetails']);
    // Then every other action, marked hidden.
    expect(moved.slice(4).sort()).toEqual(
      ACTION_MENUS.item
        .flat()
        .filter((id) => !['delete', 'edit', 'copy', 'viewDetails'].includes(id))
        .map((id) => `!${id}`)
        .sort(),
    );
    expect(customizeMenu('item', moved)).toEqual([
      ['delete', 'edit'],
      ['copy', 'viewDetails'],
    ]);
    // One section, which an older release could not have stored, is still the user's own.
    expect(customizeMenu('organize', ['-addFolder', 'sortByName', '!addBookmark'])).toEqual([
      ['addFolder', 'sortByName'],
    ]);
    expect(getHiddenMenuActions('organize', [['addFolder', 'sortByName']])).toEqual([
      'addBookmark',
    ]);
    // Paste moved into a section of its own, ahead of the rest.
    expect(customizeMenu('emptySpace', ['-paste', '-addFolder', 'addBookmark'])).toEqual([
      ['paste'],
      ['addFolder', 'addBookmark'],
    ]);
    expect(customizeMenu('preview', ['-edit', 'openInNewTab', '!copy'])).toEqual([
      ['edit', 'openInNewTab'],
    ]);
    // Ids another menu holds, unknown ids, repeats, and empty sections are left out.
    expect(
      customizeMenu('organize', [
        '-delete',
        '-sortByName',
        'sortByName',
        'nope',
        '-addBookmark',
        '!addFolder',
        '!nope',
      ]),
    ).toEqual([['sortByName'], ['addBookmark']]);
    // Reset is the empty setting: the configured menu.
    for (const kind of ACTION_MENU_KINDS) {
      expect(customizeMenu(kind, [])).toEqual(ACTION_MENUS[kind]);
      expect(customizeMenu(kind, encodeMenu(kind, ACTION_MENUS[kind]))).toEqual(ACTION_MENUS[kind]);
    }
  });

  it('stores each menu in a setting that holds every arrangement of its actions', () => {
    const meta = getSettingsFieldMeta();
    for (const kind of ACTION_MENU_KINDS) {
      const field = meta[MENU_SETTING_KEYS[kind]];
      const ids = ACTION_MENUS[kind].flat();
      // Every action in a section of its own is the longest arrangement; one shown action and
      // every other hidden holds as many entries.
      for (const arrangement of [
        encodeMenu(
          kind,
          ids.map((id) => [id]),
        ),
        encodeMenu(kind, [[ids[0] as ActionId]]),
      ]) {
        expect(arrangement.length, kind).toBeLessThanOrEqual(field.maxItems ?? 0);
        for (const entry of arrangement)
          expect(entry.length, entry).toBeLessThanOrEqual(field.maxLength ?? 0);
        expect(
          settingsSchema.shape[MENU_SETTING_KEYS[kind]].safeParse(arrangement).success,
          kind,
        ).toBe(true);
      }
    }
    // Every menu syncs, each in its own synced list item.
    for (const kind of ACTION_MENU_KINDS) {
      expect(getSettingScope(MENU_SETTING_KEYS[kind]), kind).toBe('lists');
    }
  });

  it('keeps one command for any single item, and says so when none applies', () => {
    const rootFolder: Bookmark = { ...folder, id: '1', isRootFolder: true };
    expect(MENU_KEEP_ONE_OF.item.length).toBeGreaterThan(0);
    for (const id of MENU_KEEP_ONE_OF.item) {
      for (const item of [link, folder, rootFolder]) {
        const menu = getItemMenuSections(
          [item],
          createItemHost(),
          customizeMenu('item', encodeMenu('item', [[id]])),
        );
        expect(menu, `${id} for ${item.title}`).toEqual([[id]]);
      }
    }
    // The last kept command cannot be hidden, unless another kept one is shown; every menu keeps
    // its last command.
    expect(isLastKeptMenuAction('item', [['viewDetails', 'delete']], 'viewDetails')).toBe(true);
    expect(isLastKeptMenuAction('item', [['viewDetails'], ['copyId']], 'viewDetails')).toBe(false);
    expect(isLastKeptMenuAction('item', [['viewDetails', 'delete']], 'delete')).toBe(false);
    expect(isLastKeptMenuAction('organize', [['sortByName']], 'sortByName')).toBe(true);
    expect(isLastKeptMenuAction('organize', [['sortByName', 'addFolder']], 'addFolder')).toBe(
      false,
    );
    // Show in folder alone applies only to search results, so a row of the folder shown gets a
    // disabled note rather than an empty menu.
    const markup = renderMenu([link], [['showInFolder']]);
    expect(markup).toContain('No actions available');
    expect(markup).toContain('data-disabled');
  });

  it('fits every menu and agent action id within the settings that list them', () => {
    const meta = getSettingsFieldMeta();
    const lists = {
      askAiDisabledActions: ACTION_IDS.filter((id) => getAction(id).agent),
    } as const;
    for (const [key, ids] of Object.entries(lists)) {
      const field = meta[key as keyof typeof lists];
      expect(ids.length, key).toBeLessThanOrEqual(field.maxItems ?? 0);
      for (const id of ids) expect(id.length, id).toBeLessThanOrEqual(field.maxLength ?? 0);
    }
  });

  it('names a folder edit Rename', () => {
    expect(getItemMenuLabel('edit', [folder], createItemHost())).toBe('Rename');
    expect(getItemMenuLabel('edit', [link], createItemHost())).toBe('Edit');
  });

  it('offers Show in folder only on search results from another folder', () => {
    expect(sections([link])[0]).not.toContain('showInFolder');
    const host = createItemHost({ isOutsideOpenFolder: () => true });
    expect(sections([link], host)[0]).toEqual(['preview', 'showInFolder', 'edit', 'viewDetails']);
    void getAction('showInFolder').itemMenu?.run([link], host);
    expect(host.showInFolder).toHaveBeenCalledWith(link);
  });

  it('previews one bookmark, from a menu, a key, or nowhere for folders and selections', () => {
    const host = createItemHost();
    expect(runItemMenuAction('preview', [link], host)).toBe(true);
    expect(host.preview).toHaveBeenCalledWith(link);
    // The preview key on a folder, several rows, or nothing does nothing, as the menu offers none.
    const second: Bookmark = { ...link, id: 'link-2', url: 'https://example.org/' };
    for (const items of [[folder], [link, second], []]) {
      expect(runItemMenuAction('preview', items, host)).toBe(false);
    }
    expect(host.preview).toHaveBeenCalledTimes(1);
    expect(sections([folder]).flat()).not.toContain('preview');
  });

  it("steps a preview through the page's bookmarks, skipping folders and separators, and stops at the ends", () => {
    const bookmark = (id: string): Bookmark => ({ ...link, id, url: `https://${id}.example/` });
    const separator: Bookmark = { ...link, id: 'separator', type: ItemTypeEnum.Separator };
    const noAddress: Bookmark = { ...link, id: 'no-address', url: undefined };
    const [first, second, last] = [bookmark('first'), bookmark('second'), bookmark('last')];
    const rows = [folder, first, separator, second, noAddress, folder, last, folder];
    expect(previewNeighbors(rows, first.id)).toEqual({ previous: undefined, next: second });
    expect(previewNeighbors(rows, second.id)).toEqual({ previous: first, next: last });
    expect(previewNeighbors(rows, last.id)).toEqual({ previous: second, next: undefined });
    // A bookmark no longer among the rows has nowhere to go.
    expect(previewNeighbors(rows, 'gone')).toEqual({});
    // Preview itself is offered on the same rows the steps land on.
    expect(sections([separator]).flat()).not.toContain('preview');
    expect(sections([noAddress]).flat()).not.toContain('preview');
  });

  it("offers the preview's buttons from config, where they apply to the bookmark shown", () => {
    const host = createItemHost();
    expect(getItemMenuSections([link], host, ACTION_MENUS.preview)).toEqual(ACTION_MENUS.preview);
    expect(getItemMenuLabel('openInNewTab', [link], host)).toBe('Open in new tab');
    // A managed bookmark cannot be edited, so its preview has no Edit.
    const managed: Bookmark = { ...link, unmodifiable: 'managed' };
    expect(getItemMenuSections([managed], host, ACTION_MENUS.preview).flat()).not.toContain('edit');
    expect(runItemMenuAction('copy', [link], host)).toBe(true);
    expect(host.copy).toHaveBeenCalledWith([link]);
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
