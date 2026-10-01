import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Locator,
  type Page,
  type Worker,
} from '@playwright/test';

type ExtensionFixtures = {
  /** Loads a copy whose manifest pre-grants the optional web host access the network tools request. */
  grantWebHostAccess: boolean;
  context: BrowserContext;
  extensionId: string;
  extensionWorker: Worker;
};

type WorkerFixtures = {
  hostAccessExtensionPath: string;
};

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(currentDirectory, '../../dist/chrome-mv3');

export const test = base.extend<ExtensionFixtures, WorkerFixtures>({
  grantWebHostAccess: [false, { option: true }],
  hostAccessExtensionPath: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructuring fixture arguments.
    async ({}, use) => {
      // Unpacked extensions cannot answer the permission prompt headlessly, so the granted state is
      // simulated by declaring the optional origins as install-time host permissions in a copy.
      const directory = mkdtempSync(path.join(tmpdir(), 'bookmark-scout-host-access-'));
      cpSync(extensionPath, directory, { recursive: true });
      const manifestPath = path.join(directory, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.host_permissions = manifest.optional_host_permissions;
      writeFileSync(manifestPath, JSON.stringify(manifest));
      await use(directory);
      rmSync(directory, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
  context: async ({ grantWebHostAccess, hostAccessExtensionPath }, use, testInfo) => {
    if (!existsSync(extensionPath)) {
      throw new Error(`Built extension not found at ${extensionPath}`);
    }
    const loadPath = grantWebHostAccess ? hostAccessExtensionPath : extensionPath;

    const context = await chromium.launchPersistentContext(testInfo.outputPath('user-data'), {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${loadPath}`, `--load-extension=${loadPath}`],
    });

    await use(context);
    await context.close();
  },
  extensionWorker: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    serviceWorker ??= await context.waitForEvent('serviceworker');
    await use(serviceWorker);
  },
  extensionId: async ({ extensionWorker }, use) => {
    await use(new URL(extensionWorker.url()).host);
  },
});

/**
 * The visible toast viewport. Radix also copies each toast's text into a hidden aria-live
 * announcer outside this region, so unscoped text locators can match twice. `includeHidden`
 * keeps the region reachable while a modal dialog marks the rest of the page aria-hidden.
 */
export function toastRegion(page: Page): Locator {
  return page.getByRole('region', { name: 'Notifications (F8)', includeHidden: true });
}

export { expect };
