import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import { EXTENSION_ROOT_ID, getExtensionPageTitle } from '@/lib/mount-extension-page';
import { appRoot } from '../config-files';

const entrypoints = path.join(appRoot, 'src/entrypoints');
const pages = readdirSync(entrypoints, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() && readdirSync(path.join(entrypoints, entry.name)).includes('index.html')
    ? [entry.name]
    : [],
);

/** Never shown: runs AI quick save's request for the background (services/quick-save-ai-runner.ts). */
const HIDDEN_PAGES = ['ai-host'];
const uiPages = pages.filter((page) => !HIDDEN_PAGES.includes(page));

afterEach(() => setLanguage('auto'));

describe('extension pages', () => {
  it('finds the four extension pages and the hidden AI host page', () => {
    expect(pages.sort()).toEqual(['ai-host', 'bookmarks', 'options', 'popup', 'sidepanel']);
  });

  it.each(uiPages)('%s renders into the root element through mountExtensionPage', (page) => {
    const html = readFileSync(path.join(entrypoints, page, 'index.html'), 'utf8');
    const main = readFileSync(path.join(entrypoints, page, 'main.tsx'), 'utf8');
    expect(html).toContain(`<div id="${EXTENSION_ROOT_ID}"></div>`);
    expect(main).toMatch(/\bmountExtensionPage\(/);
    expect(main).not.toMatch(/createRoot|ThemeProvider|storageKey/);
  });

  it('titles pages with the extension name and the page name in the current language', () => {
    setLanguage('en');
    expect(getExtensionPageTitle()).toBe('Bookmark Scout');
    expect(getExtensionPageTitle('page_options')).toBe('Bookmark Scout - Options');
    setLanguage('ja');
    expect(getExtensionPageTitle('page_sidePanel')).toBe('ブックマークスカウト - サイドパネル');
  });
});
