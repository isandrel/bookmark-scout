import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readPageIndexFromHistory } from '@/hooks/use-bookmarks-page';
import { setLanguage } from '@/hooks/use-i18n';
import {
  buildManagerHistoryUrl,
  createSearchHistoryDwell,
  getManagerFolderLink,
  getManagerPageTitle,
  readManagerLocation,
  resolveManagerFolderAlias,
} from '@/lib/manager-url';

describe('readPageIndexFromHistory', () => {
  it('returns the table page saved on a history entry', () => {
    expect(readPageIndexFromHistory({ folderId: '7', pageIndex: 2 })).toBe(2);
  });

  it('starts on the first page for entries without a valid saved page', () => {
    expect(readPageIndexFromHistory(null)).toBe(0);
    expect(readPageIndexFromHistory({ folderId: '7' })).toBe(0);
    expect(readPageIndexFromHistory({ pageIndex: -1 })).toBe(0);
    expect(readPageIndexFromHistory({ pageIndex: 1.5 })).toBe(0);
    expect(readPageIndexFromHistory({ pageIndex: '3' })).toBe(0);
  });
});

describe('manager address', () => {
  const page = { pathname: '/bookmarks.html', search: '', hash: '' };

  it('reads the folder and the search, treating ids as opaque strings', () => {
    expect(readManagerLocation('?id=12&q=react%20hooks')).toEqual({
      folderId: '12',
      query: 'react hooks',
    });
    expect(readManagerLocation('?id=toolbar_____')).toEqual({
      folderId: 'toolbar_____',
      query: '',
    });
    expect(readManagerLocation('?id=')).toEqual({ folderId: null, query: '' });
  });

  it('builds relative addresses that keep other parameters and the hash', () => {
    expect(buildManagerHistoryUrl(page, { folderId: '5', query: '' })).toBe('?id=5');
    expect(buildManagerHistoryUrl(page, { folderId: '5', query: 'a b' })).toBe('?id=5&q=a+b');
    expect(buildManagerHistoryUrl(page, { folderId: null, query: '' })).toBe('/bookmarks.html');
    expect(
      buildManagerHistoryUrl(
        { ...page, search: '?q=old&id=3&utm=x', hash: '#top' },
        { folderId: null, query: 'new' },
      ),
    ).toBe('?q=new&utm=x#top');
  });

  it('replaces the entry for changes within the dwell time and adds one after a pause', () => {
    let time = 1000;
    const dwell = createSearchHistoryDwell(200, () => time);
    expect(dwell()).toBe('push');
    time += 150;
    expect(dwell()).toBe('replace');
    time += 199;
    expect(dwell()).toBe('replace');
    time += 200;
    expect(dwell()).toBe('push');
  });
});

describe('resolveManagerFolderAlias', () => {
  const folders = [
    { id: '1', folderType: 'bookmarks-bar', syncing: false },
    { id: '2', folderType: 'other', syncing: false },
    { id: '30', folderType: 'bookmarks-bar', syncing: true },
  ];

  it('maps the fixed folder UUIDs, preferring the synced copy', () => {
    expect(resolveManagerFolderAlias('0bc5d13f-2cba-5d74-951f-3f233fe6c908', folders)).toBe('30');
    expect(resolveManagerFolderAlias('82B081EC-3DD3-529C-8475-AB6C344590DD', folders)).toBe('2');
    expect(resolveManagerFolderAlias('2509a7dc-215d-52f7-a429-8d80431c6c75', folders)).toBeNull();
  });

  it('opens the top level for the account and device headings', () => {
    expect(resolveManagerFolderAlias('account_heading', folders)).toBeNull();
    expect(resolveManagerFolderAlias('local_heading', folders)).toBeNull();
  });

  it('leaves ordinary ids and missing folders alone', () => {
    expect(resolveManagerFolderAlias('12', folders)).toBeUndefined();
    expect(resolveManagerFolderAlias('toolbar_____', folders)).toBeUndefined();
    // The mobile folder's UUID, in a browser without one.
    expect(resolveManagerFolderAlias('4cf2e351-0e85-532b-bb37-df045d8f8d0f', folders)).toBe(
      undefined,
    );
    expect(resolveManagerFolderAlias('d0b2fc7a-0000-4000-8000-000000000000', folders)).toBe(
      undefined,
    );
  });
});

describe('manager links and titles', () => {
  beforeAll(() => setLanguage('en'));
  afterAll(() => setLanguage('auto'));
  const extensionPage = 'moz-extension://abc/bookmarks.html';

  it('links to the browser manager the page replaces, or to the page itself', () => {
    expect(getManagerFolderLink('12', 'chrome', extensionPage)).toBe('chrome://bookmarks/?id=12');
    expect(getManagerFolderLink(null, 'chrome', extensionPage)).toBe('chrome://bookmarks/');
    expect(getManagerFolderLink('12', 'edge', extensionPage)).toBe('edge://favorites/?id=12');
    expect(getManagerFolderLink('toolbar_____', 'firefox', extensionPage)).toBe(
      `${extensionPage}?id=toolbar_____`,
    );
  });

  it('names the search, else the folder, in the tab title', () => {
    expect(getManagerPageTitle('Work', '  react ')).toBe(
      'Search "react" - Bookmarks - Bookmark Scout',
    );
    expect(getManagerPageTitle('Work', '')).toBe('Work - Bookmarks - Bookmark Scout');
    expect(getManagerPageTitle(undefined, '')).toBe('Bookmarks - Bookmark Scout');
  });
});
