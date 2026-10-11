/** A stand-in for the manager page behind the bookmark actions' item and folder menus. */
import { vi } from 'vitest';
import { type Bookmark, ItemTypeEnum } from '@/lib/manager-bookmark';
import type { ActionFolderHost, ActionItemHost } from '@/services/action-menus';

export const link: Bookmark = {
  type: ItemTypeEnum.Link,
  id: 'link-1',
  parentId: 'folder-1',
  folderPath: 'Bookmarks Bar',
  index: 0,
  title: 'Example',
  url: 'https://example.com/',
};

export const folder: Bookmark = {
  type: ItemTypeEnum.Folder,
  id: 'folder-2',
  parentId: 'folder-1',
  folderPath: 'Bookmarks Bar',
  index: 1,
  title: 'Reading',
};

export function createItemHost(overrides: Partial<ActionItemHost> = {}): ActionItemHost {
  return {
    showDetails: vi.fn(),
    edit: vi.fn(),
    requestDeletion: vi.fn(),
    reportError: vi.fn(),
    isOutsideOpenFolder: () => false,
    showInFolder: vi.fn(),
    copyFolderLink: vi.fn(),
    copyId: vi.fn(),
    openableUrls: (items) => items.flatMap((item) => (item.url ? [item.url] : [])),
    open: vi.fn(),
    privateWindowsAllowed: true,
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    canPaste: () => false,
    ...overrides,
  };
}

export function createFolderHost(overrides: Partial<ActionFolderHost> = {}): ActionFolderHost {
  return {
    canChangeFolder: true,
    canSort: true,
    canPaste: false,
    sort: vi.fn(),
    addBookmark: vi.fn(),
    addFolder: vi.fn(),
    paste: vi.fn(),
    ...overrides,
  };
}
