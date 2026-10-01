import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { folderRow, openPopup, setSettings } from './popup-helpers';

// The folder icon's classes: a light color with a `dark:` override.
const LIGHT_CLASS = 'text-amber-500';
const DARK_VARIANT_CLASSES = `${LIGHT_CLASS} dark:text-amber-400`;

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
  /** The element whose `dark:` class is checked; defaults to an injected probe. */
  target?: (page: Page) => Locator;
};

const PAGES: ThemedPage[] = [
  {
    path: 'popup.html',
    target: (page) => folderRow(page, 'Other bookmarks').locator('svg').first(),
  },
  { path: 'sidepanel.html' },
  { path: 'options.html' },
  { path: 'bookmarks.html' },
];

/** Adds elements using classes Tailwind already generated, for pages without a stable `dark:` element. */
async function injectProbes(page: Page) {
  await page.evaluate(
    ({ light, variant }) => {
      for (const [id, className] of [
        ['theme-reference', light],
        ['theme-probe', variant],
      ]) {
        const element = document.createElement('span');
        element.dataset.testid = id;
        element.className = className;
        element.textContent = id;
        document.body.append(element);
      }
    },
    { light: LIGHT_CLASS, variant: DARK_VARIANT_CLASSES },
  );
}

function color(locator: Locator) {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

for (const themeCase of THEME_CASES) {
  test(`dark: variants follow the app theme: ${themeCase.name}`, async ({
    extensionId,
    extensionWorker,
    page,
  }) => {
    await setSettings(extensionWorker, { language: 'en', theme: themeCase.theme });
    await page.emulateMedia({ colorScheme: themeCase.osScheme });

    for (const themedPage of PAGES) {
      if (themedPage.path === 'popup.html') {
        await openPopup(page, extensionId);
      } else {
        await page.goto(`chrome-extension://${extensionId}/${themedPage.path}`);
      }
      const html = page.locator('html');
      await expect(html, themedPage.path).toHaveClass(new RegExp(`\\b${themeCase.expected}\\b`));

      await injectProbes(page);
      const reference = page.getByTestId('theme-reference');
      const target = themedPage.target?.(page) ?? page.getByTestId('theme-probe');
      await expect(target).toHaveClass(new RegExp(DARK_VARIANT_CLASSES));
      const lightColor = await color(reference);

      await expect
        .poll(async () => (await color(target)) === lightColor, { message: themedPage.path })
        .toBe(themeCase.expected === 'light');
    }
  });
}
