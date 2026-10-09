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
    ['fr-FR', 'fr'],
    ['zh-HK', 'zh_TW'],
    ['ru-RU', 'en'],
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

  it('picks plural forms by the plural rules of the language', async () => {
    i18n.setLanguage('en');
    await i18n.whenLanguageReady();
    expect(i18n.tPlural('tools_urlCleanerDialogDesc', 1)).toBe('1 bookmark can be cleaned');
    expect(i18n.tPlural('tools_urlCleanerDialogDesc', 0)).toBe('0 bookmarks can be cleaned');
    i18n.setLanguage('ja');
    await i18n.whenLanguageReady();
    // Japanese has one form, so a count of one uses the general message.
    expect(i18n.getPluralCategory(1)).toBe('other');
  });

  it('formats with language tags, not folder names', () => {
    expect(i18n.toLanguageTag('en')).toBe('en');
    expect(i18n.toLanguageTag('zh_CN' as never)).toBe('zh-CN');
  });

  it('names every locale without loading its messages', () => {
    expect(i18n.SUPPORTED_LOCALES.map(i18n.getLanguageName)).toEqual([
      'Deutsch',
      'English',
      'Español',
      'Français',
      '日本語',
      '한국어',
      'Português (Brasil)',
      '简体中文',
      '繁體中文',
    ]);
    expect(fetchFile).not.toHaveBeenCalled();
  });
});

describe('browser language matching', () => {
  // Folder names as the extension ships them; zh_CN, zh_TW, and pt_BR stand in for future locales.
  const locales = ['en', 'ja', 'ko', 'zh_CN', 'zh_TW', 'pt_BR'] as never[];

  it.each([
    ['ja-JP', 'ja'],
    ['zh-CN', 'zh_CN'],
    ['zh_CN', 'zh_CN'],
    ['zh-TW', 'zh_TW'],
    ['zh-HK', 'zh_TW'],
    ['zh-Hant-HK', 'zh_TW'],
    ['zh-SG', 'zh_CN'],
    ['zh', 'zh_CN'],
    ['pt-PT', 'pt_BR'],
    ['kok', undefined],
    ['fr-FR', undefined],
  ])('matches %s to %s', (language, locale) => {
    expect(i18n.matchBundledLocale(language, locales)).toBe(locale);
  });
});
