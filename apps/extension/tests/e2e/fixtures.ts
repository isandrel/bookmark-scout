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

/** Chromium-family browsers: Playwright's bundled Chromium, or the installed Microsoft Edge. */
export type ExtensionBrowser = 'chromium' | 'msedge';

export type ExtensionProjectOptions = {
  /** Playwright channel used to launch the browser. */
  extensionBrowser: ExtensionBrowser;
  /** WXT output directory under `dist/` that is loaded unpacked. */
  extensionBuild: string;
};

type ExtensionFixtures = {
  /** Loads a copy whose manifest pre-grants the optional web host access the network tools request. */
  grantWebHostAccess: boolean;
  context: BrowserContext;
  extensionId: string;
  extensionWorker: Worker;
};

type WorkerFixtures = ExtensionProjectOptions & {
  extensionPath: string;
  hostAccessExtensionPath: string;
};

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(currentDirectory, '../../dist');

export const test = base.extend<ExtensionFixtures, WorkerFixtures>({
  extensionBrowser: ['chromium', { option: true, scope: 'worker' }],
  extensionBuild: ['chrome-mv3', { option: true, scope: 'worker' }],
  extensionPath: [
    async ({ extensionBuild }, use) => {
      const extensionPath = path.join(distDirectory, extensionBuild);
      if (!existsSync(extensionPath)) {
        throw new Error(`Built extension not found at ${extensionPath}`);
      }
      await use(extensionPath);
    },
    { scope: 'worker' },
  ],
  grantWebHostAccess: [false, { option: true }],
  hostAccessExtensionPath: [
    async ({ extensionPath }, use) => {
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
  context: async (
    { extensionBrowser, extensionPath, grantWebHostAccess, hostAccessExtensionPath },
    use,
    testInfo,
  ) => {
    const loadPath = grantWebHostAccess ? hostAccessExtensionPath : extensionPath;

    const context = await chromium.launchPersistentContext(testInfo.outputPath('user-data'), {
      channel: extensionBrowser,
      headless: true,
      // Popups that are still animating out would sit over the next control and catch its click.
      // Reduced motion shortens every animation to a single frame and covers that code path too.
      reducedMotion: 'reduce',
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
 * The visible toast viewport, named after Base UI's fixed F6 shortcut in the given locale's label.
 * `includeHidden` keeps the region reachable while a modal dialog marks the rest of the page
 * aria-hidden.
 */
export function toastRegion(page: Page, label = 'Notifications'): Locator {
  return page.getByRole('region', { name: `${label} (F6)`, includeHidden: true });
}

export { expect };
