import browser from 'webextension-polyfill';

export { browser };

export function getStorageSync() {
  return browser.storage?.sync;
}

export function getStorageLocal() {
  return browser.storage?.local;
}

export function getBookmarksApi() {
  return browser.bookmarks;
}

export function getTabsApi() {
  return browser.tabs;
}
