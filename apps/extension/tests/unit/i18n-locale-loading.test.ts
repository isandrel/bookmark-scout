import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { serveExtensionFiles } from '../locale-files';

type I18n = typeof import('@/hooks/use-i18n');

const localeUrl = (locale: string) =>
  `chrome-extension://test-extension-id/_locales/${locale}/messages.json`;

let i18n: I18n;
let fetchFile: ReturnType<typeof serveExtensionFiles>;

beforeEach(async () => {
  // A fresh module has no locales loaded, like a page or background that just started (the
  // unit-test setup registers every locale on the shared copy).
  vi.resetModules();
  fetchFile = serveExtensionFiles();
  i18n = await import('@/hooks/use-i18n');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('on-demand locale loading', () => {
  it('loads only the selected locale and applies it once loaded', async () => {
    const changes = vi.fn();
    i18n.subscribeToLanguage(changes);

    i18n.setLanguage('ja');
    // `t()` keeps the previous language until the new one has loaded.
    expect(i18n.getLanguage()).toBe('auto');
    expect(changes).not.toHaveBeenCalled();

    await i18n.whenLanguageReady();
    expect(i18n.getLanguage()).toBe('ja');
    expect(changes).toHaveBeenCalledTimes(1);
    expect(i18n.t('contextMenu_saveToFolder')).toBe('ブックマークの保存先...');
    expect(i18n.t('page_title', [i18n.t('extName'), i18n.t('page_sidePanel')])).toBe(
      'ブックマークスカウト - サイドパネル',
    );
    expect(fetchFile.mock.calls.map(([url]) => url)).toEqual([localeUrl('ja')]);
  });

  it('applies a loaded locale at once and fetches each locale only once', async () => {
    i18n.setLanguage('ko');
    await i18n.whenLanguageReady();
    i18n.setLanguage('en');
    await i18n.whenLanguageReady();

    i18n.setLanguage('ko');
    expect(i18n.getLanguage()).toBe('ko');
    expect(i18n.t('extName')).toBe('북마크 스카우트');
    expect(fetchFile.mock.calls.map(([url]) => url)).toEqual([localeUrl('ko'), localeUrl('en')]);
  });

  it('applies the latest selection when an earlier one finishes loading later', async () => {
    i18n.setLanguage('ja');
    const jaLoaded = i18n.whenLanguageReady();
    i18n.setLanguage('auto');
    await jaLoaded;
    expect(i18n.getLanguage()).toBe('auto');
  });

  it('falls back to the browser messages when a locale cannot be loaded, then retries', async () => {
    fetchFile.mockResolvedValueOnce(new Response('', { status: 500 }));
    i18n.setLanguage('ja');
    await i18n.whenLanguageReady();
    // Applied anyway: `t()` falls back to browser.i18n (not available here, so the key).
    expect(i18n.getLanguage()).toBe('ja');
    expect(i18n.t('extName')).toBe('extName');

    i18n.setLanguage('en');
    i18n.setLanguage('ja');
    await i18n.whenLanguageReady();
    expect(i18n.t('extName')).toBe('ブックマークスカウト');
  });

  it("uses the browser's own messages for its UI language instead of loading them", async () => {
    vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('ja-JP');
    const getMessage = vi.spyOn(fakeBrowser.i18n, 'getMessage').mockReturnValue('ブラウザ');
    try {
      i18n.setLanguage('ja');
      expect(i18n.getLanguage()).toBe('ja');
      expect(i18n.t('extName')).toBe('ブラウザ');
      expect(getMessage).toHaveBeenCalledWith('extName', undefined);
      // Another language still loads its own file.
      i18n.setLanguage('en');
      expect(i18n.getLanguage()).toBe('ja');
      await i18n.whenLanguageReady();
      expect(i18n.t('extName')).toBe('Bookmark Scout');
      expect(fetchFile.mock.calls.map(([url]) => url)).toEqual([localeUrl('en')]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it.each([
    ['ko', 'ko'],
    ['en-GB', 'en'],
    ['fr-FR', 'en'],
    // Konkani is not Korean: the browser falls back to the default locale.
    ['kok', 'en'],
  ])('resolves the browser UI language %s to the %s messages', (uiLanguage, locale) => {
    vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue(uiLanguage);
    try {
      expect(i18n.getResolvedLanguage()).toBe(locale);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('names every locale without loading its messages', () => {
    expect(i18n.SUPPORTED_LOCALES.map(i18n.getLanguageName)).toEqual([
      'English',
      '日本語',
      '한국어',
    ]);
    expect(fetchFile).not.toHaveBeenCalled();
  });
});
