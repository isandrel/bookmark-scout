/**
 * The bookmark manager settings in Options > Behavior: Manager Order, Start Folder, Sidebars
 * on Open and the sidebar widths, what cards and the preview show, and Card Size with its tag and
 * summary limits. Each test flips a setting and checks that the result changes.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BookmarkCardField } from '@/components/bookmark/BookmarkCardContent';
import { CARD_MIN_WIDTH_PX } from '@/components/ui/table/table-config';
import { setLanguage } from '@/hooks/use-i18n';
import {
  clampManagerSidebarWidth,
  getManagerSidebarsOnOpen,
  MANAGER_SIDEBAR_MAX_WIDTH,
  MANAGER_SIDEBAR_RESIZE_STEPS,
  MANAGER_SIDEBAR_WIDTHS,
} from '@/hooks/use-manager-sidebars';
import { bookmarkMetadataValue } from '@/lib/bookmark-metadata-storage';
import { type Bookmark, ItemTypeEnum } from '@/lib/manager-bookmark';
import { managerLastFolderValue, managerSidebarsValue } from '@/lib/manager-page-storage';
import {
  defaultSettings,
  getManagerCardFields,
  getPreviewFields,
  getSettingScope,
  isSettingShownWith,
  resolveManagerSortOrder,
  type Settings,
} from '@/lib/settings-schema';
import { preloadStoredValue } from '@/lib/storage/stored-value';
import { pickManagerStartFolder } from '@/services/manager-start-folder';
import type { BookmarkTreeNode } from '@/types';
import { readConfigToml } from '../config-files';
import { readStoredData, STORAGE_ITEMS, seedStored } from './storage-helpers';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('Manager Order', () => {
  it('follows Sort Order until set to an order of its own', () => {
    expect(defaultSettings.managerSortOrder).toBe('same_as_popup');
    expect(resolveManagerSortOrder('same_as_popup', 'date')).toBe('date');
    expect(resolveManagerSortOrder('alphabetical', 'date')).toBe('alphabetical');
    expect(resolveManagerSortOrder('browser', 'folders')).toBe('browser');
  });
});

describe('Start Folder', () => {
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
        {
          id: '2',
          parentId: '0',
          title: 'Other bookmarks',
          children: [{ id: '20', parentId: '2', title: 'Link', url: 'https://e2e.invalid/' }],
        },
      ],
    },
  ];
  const pick = (overrides: Partial<Settings>, last = '') =>
    pickManagerStartFolder(tree, { ...defaultSettings, ...overrides }, last);

  it('opens the bookmarks bar, the last folder, or a chosen one, and the bar when it is gone', () => {
    expect(defaultSettings.managerStartFolder).toBe('bookmarks_bar');
    expect(pick({}, '10')).toBe('1');
    expect(pick({ managerStartFolder: 'last' }, '10')).toBe('10');
    expect(pick({ managerStartFolder: 'last' }, '0')).toBe('0');
    expect(pick({ managerStartFolder: 'chosen', managerStartFolderId: '2' })).toBe('2');
    // A folder that is gone, a bookmark, or none chosen yet opens the bookmarks bar.
    expect(pick({ managerStartFolder: 'last' }, 'gone')).toBe('1');
    expect(pick({ managerStartFolder: 'chosen', managerStartFolderId: '20' })).toBe('1');
    expect(pick({ managerStartFolder: 'chosen', managerStartFolderId: '' })).toBe('1');
  });

  it('keeps the start folder on this device, and asks for a folder only when one is chosen', async () => {
    for (const key of ['managerStartFolder', 'managerStartFolderId'] as const) {
      expect(getSettingScope(key), key).toBe('device');
    }
    expect(isSettingShownWith('managerStartFolderId', defaultSettings)).toBe(false);
    expect(
      isSettingShownWith('managerStartFolderId', {
        ...defaultSettings,
        managerStartFolder: 'chosen',
      }),
    ).toBe(true);
    await managerLastFolderValue.set('10');
    expect(await readStoredData(STORAGE_ITEMS.managerLastFolder)).toBe('10');
    expect(STORAGE_ITEMS.managerLastFolder.area).toBe('local');
  });
});

describe('Sidebars on Open and sidebar widths', () => {
  const layout = readConfigToml('ui/layout.toml') as {
    manager: { folders_open: boolean; tools_open: boolean; max_width_percent: { value: number } };
  };

  it('opens the sidebars as configured, or as left last when set to remember', () => {
    const configured = { folders: layout.manager.folders_open, tools: layout.manager.tools_open };
    const saved = { foldersOpen: !configured.folders, toolsOpen: !configured.tools };
    expect(defaultSettings.managerSidebarsStart).toBe('default');
    expect(getManagerSidebarsOnOpen('default', saved)).toEqual(configured);
    expect(getManagerSidebarsOnOpen('remember', saved)).toEqual({
      folders: saved.foldersOpen,
      tools: saved.toolsOpen,
    });
    // Nothing remembered yet: as configured.
    expect(getManagerSidebarsOnOpen('remember', {})).toEqual(configured);
    expect(getSettingScope('managerSidebarsStart')).toBe('device');
  });

  it('keeps a resized sidebar within its configured bounds, on this device', async () => {
    for (const id of ['folders', 'tools'] as const) {
      const { value, min, max } = MANAGER_SIDEBAR_WIDTHS[id];
      expect(min).toBeLessThanOrEqual(value);
      expect(value).toBeLessThanOrEqual(max);
      expect(clampManagerSidebarWidth(id, min - 50)).toBe(min);
      expect(clampManagerSidebarWidth(id, max + 50)).toBe(max);
      expect(clampManagerSidebarWidth(id, value + 0.4)).toBe(value);
    }
    expect(MANAGER_SIDEBAR_RESIZE_STEPS.small).toBeLessThan(MANAGER_SIDEBAR_RESIZE_STEPS.big);
    expect(MANAGER_SIDEBAR_MAX_WIDTH).toBe(`${layout.manager.max_width_percent.value}vw`);
    await managerSidebarsValue.update((state) => ({ ...state, foldersWidth: 300 }));
    expect(await readStoredData(STORAGE_ITEMS.managerSidebars)).toEqual({ foldersWidth: 300 });
    expect(STORAGE_ITEMS.managerSidebars.area).toBe('local');
  });
});

describe('cards and the preview', () => {
  beforeAll(() => setLanguage('en'));
  afterAll(() => setLanguage('auto'));

  const item: Bookmark = {
    type: ItemTypeEnum.Link,
    id: 'card-1',
    parentId: 'folder-1',
    folderPath: 'Bookmarks bar / Reading',
    index: 0,
    title: 'Card',
    url: 'https://e2e.invalid/card',
  };

  it('shows the card details and preview details the settings list, in their order', () => {
    expect(getManagerCardFields(defaultSettings.managerCardFields)).toEqual([
      'cover',
      'url',
      'tags',
      'summary',
    ]);
    expect(
      getManagerCardFields(['summary', 'folder', 'summary', 'nope', '!cover', '!url', '!tags']),
    ).toEqual(['summary', 'folder']);
    // A detail the list does not name was added since it was saved: it shows, in its place.
    expect(getManagerCardFields(['summary', '!cover', '!url', '!tags'])).toEqual([
      'folder',
      'summary',
    ]);
    expect(getPreviewFields(defaultSettings.previewFields)).toEqual([
      'cover',
      'folder',
      'tags',
      'summary',
      'coverSource',
    ]);
    expect(
      getPreviewFields(['tags', 'url', 'cover', '!folder', '!summary', '!coverSource']),
    ).toEqual(['tags', 'cover']);
    expect(getPreviewFields(['tags', '!cover', '!folder', '!summary'])).toEqual([
      'tags',
      'coverSource',
    ]);
  });

  it('cuts tags and the summary at the card limits, and names the folder', async () => {
    await seedStored(STORAGE_ITEMS.bookmarkMetadata, {
      [item.id]: { tags: ['a', 'b', 'c', 'd'], summary: 'A summary' },
    });
    await preloadStoredValue(bookmarkMetadataValue);
    const render = (field: 'tags' | 'summary' | 'folder', maxTags = 3, summaryLines = 2) =>
      renderToStaticMarkup(
        createElement(BookmarkCardField, { item, field, limits: { maxTags, summaryLines } }),
      );
    expect(render('tags')).toContain('+1');
    expect(render('tags', 1)).toContain('+3');
    expect(render('summary')).toContain('--card-summary-lines:2');
    expect(render('summary', 3, 5)).toContain('--card-summary-lines:5');
    expect(render('folder')).toContain('Bookmarks bar / Reading');
    expect(defaultSettings).toMatchObject({ cardMaxTags: 3, cardSummaryLines: 2 });
  });

  it('keeps how cards and the preview look on this device, with a width for each Card Size', () => {
    const device: (keyof Settings)[] = [
      'managerCardFields',
      'managerCardSize',
      'cardMaxTags',
      'cardSummaryLines',
      'previewFields',
      'managerDefaultColumns',
      'managerDefaultPageSize',
      'managerDefaultSort',
    ];
    for (const key of device) expect(getSettingScope(key), key).toBe('device');
    expect(defaultSettings.managerCardSize).toBe('medium');
    expect(CARD_MIN_WIDTH_PX.small).toBeLessThan(
      CARD_MIN_WIDTH_PX[defaultSettings.managerCardSize],
    );
  });
});
