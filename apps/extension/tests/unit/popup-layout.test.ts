import { describe, expect, it } from 'vitest';
import { initialExpandedFolders } from '@/lib/popup-expansion-storage';
import {
  getPopupSections,
  getPopupToolbarButtons,
  POPUP_SECTION_LABEL_KEYS,
  POPUP_SECTIONS,
  POPUP_TOOLBAR_BUTTON_LABEL_KEYS,
  POPUP_TOOLBAR_BUTTONS,
} from '@/lib/popup-layout';
import { popupTreeDensity, popupTreeDensityStyle } from '@/lib/popup-tree-view';
import {
  defaultSettings,
  getSettingScope,
  getSettingsFieldMeta,
  SETTING_NUMBER_BOUNDS,
} from '@/lib/settings-schema';
import type { BookmarkTreeNode } from '@/types';
import enMessages from '../../public/_locales/en/messages.json';
import { readConfigToml } from '../config-files';

describe('popup sections', () => {
  it('default to today’s popup, top to bottom', () => {
    expect(getPopupSections(defaultSettings.popupSections)).toEqual([...POPUP_SECTIONS]);
    expect(getSettingScope('popupSections')).toBe('device');
  });

  it('follow the order set, hide what it leaves out, and always keep the bookmark tree', () => {
    const hideAllBut = (...shown: string[]) =>
      POPUP_SECTIONS.filter((id) => !shown.includes(id)).map((id) => `!${id}`);
    expect(
      getPopupSections([
        'hintBar',
        'recentFolders',
        'tree',
        ...hideAllBut('hintBar', 'recentFolders', 'tree'),
      ]),
    ).toEqual(['hintBar', 'recentFolders', 'tree']);
    // A list that hides the tree still shows it, at the end.
    expect(getPopupSections(['notices', ...hideAllBut('notices')])).toEqual(['notices', 'tree']);
    expect(getPopupSections(hideAllBut())).toEqual(['tree']);
    // A part the list does not name was added since it was saved: it shows, in its place.
    expect(getPopupSections(['tree', ...hideAllBut('tree', 'notices')])).toEqual([
      'tree',
      'notices',
    ]);
    expect(getPopupSections([])).toEqual([...POPUP_SECTIONS]);
  });

  it('name every part and button in English', () => {
    for (const key of [
      ...Object.values(POPUP_SECTION_LABEL_KEYS),
      ...Object.values(POPUP_TOOLBAR_BUTTON_LABEL_KEYS),
    ]) {
      expect(key in enMessages, key).toBe(true);
    }
  });
});

describe('popup toolbar buttons', () => {
  it('default to today’s buttons in today’s order, the Settings button hidden', () => {
    expect(getPopupToolbarButtons(defaultSettings.popupToolbarButtons)).toEqual(
      POPUP_TOOLBAR_BUTTONS.filter((id) => id !== 'openSettings'),
    );
  });

  it('hide the buttons the setting leaves out, the theme button included', () => {
    const hidden = POPUP_TOOLBAR_BUTTONS.filter((id) => !['askAI', 'openManager'].includes(id));
    expect(
      getPopupToolbarButtons(['askAI', 'openManager', ...hidden.map((id) => `!${id}`)]),
    ).toEqual(['askAI', 'openManager']);
    expect(getPopupToolbarButtons(POPUP_TOOLBAR_BUTTONS.map((id) => `!${id}`))).toEqual([]);
    // A button the list does not name was added since it was saved: it shows.
    expect(getPopupToolbarButtons(['!theme'])).toEqual(
      POPUP_TOOLBAR_BUTTONS.filter((id) => id !== 'theme'),
    );
  });
});

describe('tree density', () => {
  it('defaults to comfortable rows and reads each density’s metrics from config', () => {
    expect(defaultSettings.treeDensity).toBe('comfortable');
    const config = readConfigToml('ui/popup-tree-view.toml') as {
      density: Record<'comfortable' | 'compact', { row_height_px: number; indent_px: number }>;
    };
    expect(popupTreeDensity('comfortable')).toEqual(config.density.comfortable);
    expect(popupTreeDensity('compact').row_height_px).toBeLessThan(
      popupTreeDensity('comfortable').row_height_px,
    );
    expect(popupTreeDensityStyle('compact')['--popup-tree-row']).toBe(
      `${config.density.compact.row_height_px}px`,
    );
    expect(getSettingsFieldMeta().treeDensity.options?.map((option) => option.value)).toEqual([
      'comfortable',
      'compact',
    ]);
  });
});

describe('expand on open', () => {
  const tree: BookmarkTreeNode[] = [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          parentId: '0',
          title: 'Bookmarks bar',
          folderType: 'bookmarks-bar',
          children: [{ id: '10', parentId: '1', title: 'Work', children: [] }],
        },
        { id: '2', parentId: '0', title: 'Other bookmarks', folderType: 'other', children: [] },
      ],
    },
  ];

  it('opens nothing by default', () => {
    expect(defaultSettings.popupExpandOnOpen).toBe('none');
    expect(initialExpandedFolders('none', tree, ['1'])).toEqual([]);
  });

  it('opens the bookmarks bar, or the remembered folders that still exist', () => {
    expect(initialExpandedFolders('bookmarks_bar', tree, [])).toEqual(['1']);
    expect(initialExpandedFolders('last', tree, ['10', 'gone', '2'])).toEqual(['10', '2']);
  });
});

describe('hover card delay', () => {
  it('sits beside the tooltip delay with its own bounds', () => {
    expect(defaultSettings.hoverCardOpenDelayMs).toBe(600);
    expect(SETTING_NUMBER_BOUNDS.hoverCardOpenDelayMs).toMatchObject({ min: 0, max: 2000 });
  });
});
