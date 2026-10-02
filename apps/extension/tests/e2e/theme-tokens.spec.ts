import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { folderRow, openPopup, otherBookmarksTitle, setSettings } from './popup-helpers';

type ColorScheme = 'light' | 'dark';

type ThemeCase = {
  name: string;
  osScheme: ColorScheme;
  theme: 'light' | 'dark' | 'system';
  expected: ColorScheme;
};

const THEME_CASES: ThemeCase[] = [
  { name: 'Light theme on a dark OS', osScheme: 'dark', theme: 'light', expected: 'light' },
  { name: 'Dark theme on a light OS', osScheme: 'light', theme: 'dark', expected: 'dark' },
  { name: 'System theme on a dark OS', osScheme: 'dark', theme: 'system', expected: 'dark' },
  { name: 'System theme on a light OS', osScheme: 'light', theme: 'system', expected: 'light' },
];

type ThemedPage = {
  path: string;
  /** An element colored by a theme token; defaults to an injected `text-foreground` probe. */
  target?: (page: Page, otherFolderTitle: string) => Locator;
};

const PAGES: ThemedPage[] = [
  {
    path: 'popup.html',
    target: (page, otherFolderTitle) =>
      folderRow(page, otherFolderTitle).locator('[data-slot="folder-icon"]'),
  },
  { path: 'sidepanel.html' },
  { path: 'options.html' },
  { path: 'bookmarks.html' },
];

async function injectProbe(page: Page) {
  await page.evaluate(() => {
    const element = document.createElement('span');
    element.dataset.testid = 'theme-probe';
    element.className = 'text-foreground';
    element.textContent = 'theme-probe';
    document.body.append(element);
  });
}

/** Relative luminance of an element's text and of the page background, from 0 to 1. */
function luminance(locator: Locator) {
  return locator.evaluate((element) => {
    const toLuminance = (value: string) => {
      const [r, g, b] = (value.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((channel) => {
        const c = Number(channel) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    return {
      text: toLuminance(getComputedStyle(element).color),
      background: toLuminance(getComputedStyle(document.body).backgroundColor),
    };
  });
}

for (const themeCase of THEME_CASES) {
  test(`theme tokens follow the app theme: ${themeCase.name}`, async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    await setSettings(extensionWorker, { language: 'en', theme: themeCase.theme });
    await page.emulateMedia({ colorScheme: themeCase.osScheme });
    const otherFolderTitle = await otherBookmarksTitle(extensionWorker);

    for (const themedPage of PAGES) {
      if (themedPage.path === 'popup.html') {
        await openPopup(page, extensionId);
      } else {
        await page.goto(`chrome-extension://${extensionId}/${themedPage.path}`);
      }
      const html = page.locator('html');
      await expect(html, themedPage.path).toHaveClass(new RegExp(`\\b${themeCase.expected}\\b`));

      await injectProbe(page);
      const target = themedPage.target?.(page, otherFolderTitle) ?? page.getByTestId('theme-probe');
      // Dark themes put light text on a dark page; light themes the reverse.
      await expect
        .poll(
          async () => {
            const { text, background } = await luminance(target);
            return text > background ? 'dark' : 'light';
          },
          { message: themedPage.path },
        )
        .toBe(themeCase.expected);
    }
  });
}
