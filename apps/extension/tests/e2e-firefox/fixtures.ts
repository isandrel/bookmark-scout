import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { Builder, By, until, type WebDriver, type WebElement } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { FIREFOX_ADDON_ID } from '../../manifest.config';

/**
 * Firefox end-to-end fixtures.
 *
 * Playwright's Firefox cannot open moz-extension:// pages (navigation never commits), and its
 * WebDriver BiDi mode rejects them as well, so these tests drive the stock Firefox through
 * geckodriver (Selenium) and keep Playwright Test as the runner. geckodriver installs the MV2 build
 * as a temporary add-on, and `--allow-system-access` lets it navigate to moz-extension:// URLs.
 */

/**
 * The build's own add-on ID, so the tests install the manifest AMO receives. Firefox needs an ID
 * for storage.sync and to map the add-on to a fixed moz-extension UUID.
 */
const ADDON_ID = FIREFOX_ADDON_ID;
const ADDON_UUID = '5b0f8e1c-2f6a-4d2e-9a7c-3e1d4c5b6a70';
/** Empty page added to the test copy so extension APIs can be called from a privileged page. */
const API_PAGE = 'e2e-api.html';
const DEFAULT_WAIT_MS = 10_000;

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const firefoxBuild = path.resolve(currentDirectory, '../../dist/firefox-mv2');

/** The page-side `browser` namespace; Firefox's promise-based API matches Chrome's MV3 typings. */
export type ExtensionApi = typeof chrome;

export type FirefoxExtension = {
  driver: WebDriver;
  /** Directory Firefox saves downloads into without prompting. */
  downloadDirectory: string;
  url: (page: string) => string;
  /** Opens an extension page in the test tab. */
  open: (page: string) => Promise<void>;
  /**
   * Runs `callback(browser, arg)` in a dedicated extension tab and returns its JSON result. The
   * callback is serialized, so it must not reference variables from the test's scope.
   */
  call: <Arg, Result>(
    callback: (browser: ExtensionApi, arg: Arg) => Promise<Result>,
    arg: Arg,
  ) => Promise<Result>;
  /** Waits for a CSS selector to match a displayed element. */
  find: (css: string) => Promise<WebElement>;
  /** Waits for a displayed element of `css` whose text content includes `text`. */
  findByText: (css: string, text: string) => Promise<WebElement>;
  /** Counts displayed elements matching a CSS selector. */
  countVisible: (css: string) => Promise<number>;
};

type FirefoxFixtures = {
  extension: FirefoxExtension;
};

type FirefoxWorkerFixtures = {
  addonPath: string;
};

export const test = base.extend<FirefoxFixtures, FirefoxWorkerFixtures>({
  addonPath: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructuring fixture arguments.
    async ({}, use) => {
      if (!existsSync(firefoxBuild)) {
        throw new Error(`Built extension not found at ${firefoxBuild}`);
      }
      const directory = mkdtempSync(path.join(tmpdir(), 'bookmark-scout-firefox-'));
      cpSync(firefoxBuild, directory, { recursive: true });
      const manifestPath = path.join(directory, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const builtId = manifest.browser_specific_settings?.gecko?.id;
      if (builtId !== ADDON_ID) {
        throw new Error(`Firefox build has add-on ID ${builtId}, expected ${ADDON_ID}`);
      }
      writeFileSync(path.join(directory, API_PAGE), '<!doctype html><title>E2E API</title>');
      await use(directory);
      rmSync(directory, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
  extension: async ({ addonPath }, use, testInfo) => {
    const downloadDirectory = testInfo.outputPath('downloads');
    mkdirSync(downloadDirectory, { recursive: true });

    const options = new firefox.Options()
      .addArguments('-headless')
      .windowSize({ width: 1280, height: 900 })
      .setPreference('extensions.webextensions.uuids', JSON.stringify({ [ADDON_ID]: ADDON_UUID }))
      .setPreference('browser.download.folderList', 2)
      .setPreference('browser.download.dir', downloadDirectory)
      .setPreference('browser.download.useDownloadDir', true)
      .setPreference('browser.download.always_ask_before_handling_new_types', false)
      .setPreference('browser.download.manager.showWhenStarting', false);
    if (process.env.FIREFOX_BIN) options.setBinary(process.env.FIREFOX_BIN);

    const service = new firefox.ServiceBuilder().addArguments('--allow-system-access');
    const driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxOptions(options)
      .setFirefoxService(service)
      .build();

    try {
      await driver.installAddon(addonPath, true);
      const baseUrl = `moz-extension://${ADDON_UUID}/`;
      const url = (page: string) => `${baseUrl}${page}`;

      await driver.get(url(API_PAGE));
      const apiTab = await driver.getWindowHandle();
      await driver.switchTo().newWindow('tab');
      const testTab = await driver.getWindowHandle();

      const extension: FirefoxExtension = {
        driver,
        downloadDirectory,
        url,
        open: async (page) => {
          await driver.get(url(page));
        },
        call: async (callback, arg) => {
          const current = await driver.getWindowHandle();
          await driver.switchTo().window(apiTab);
          try {
            const result = (await driver.executeAsyncScript(
              `const done = arguments[arguments.length - 1];
               Promise.resolve()
                 .then(() => (${callback.toString()})(browser, arguments[0]))
                 .then((value) => done({ value }), (error) => done({ error: String(error) }));`,
              arg,
            )) as { value?: unknown; error?: string };
            if (result.error) throw new Error(`Extension API call failed: ${result.error}`);
            return result.value as never;
          } finally {
            await driver.switchTo().window(current);
          }
        },
        find: async (css) => {
          const element = await driver.wait(until.elementLocated(By.css(css)), DEFAULT_WAIT_MS);
          await driver.wait(until.elementIsVisible(element), DEFAULT_WAIT_MS);
          return element;
        },
        findByText: async (css, text) => {
          let match: WebElement | undefined;
          await driver.wait(async () => {
            for (const element of await driver.findElements(By.css(css))) {
              const content = await element.getText().catch(() => '');
              if (content.includes(text) && (await element.isDisplayed().catch(() => false))) {
                match = element;
                return true;
              }
            }
            return false;
          }, DEFAULT_WAIT_MS);
          if (!match) throw new Error(`No visible ${css} containing "${text}"`);
          return match;
        },
        countVisible: async (css) => {
          let count = 0;
          for (const element of await driver.findElements(By.css(css))) {
            if (await element.isDisplayed().catch(() => false)) count += 1;
          }
          return count;
        },
      };

      await driver.switchTo().window(testTab);
      await use(extension);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        const screenshot = await driver.takeScreenshot().catch(() => undefined);
        if (screenshot) {
          const screenshotPath = testInfo.outputPath('failure.png');
          writeFileSync(screenshotPath, screenshot, 'base64');
          testInfo.attachments.push({
            name: 'screenshot',
            path: screenshotPath,
            contentType: 'image/png',
          });
        }
      }
      await driver.quit();
    }
  },
});

export { By, expect };
