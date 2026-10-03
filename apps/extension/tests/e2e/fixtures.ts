import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BrowserContext,
  test as base,
  chromium,
  expect,
  type Locator,
  type Page,
  type Worker,
} from '@playwright/test';
import { profileDir, removeTempDir, workerTempDir } from './temp-dirs';

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
  /**
   * Optional API permissions (such as `tabs` or `contextMenus`) the loaded copy has from install,
   * because headless tests cannot answer the browser's permission prompt.
   */
  grantPermissions: readonly string[];
  context: BrowserContext;
  extensionId: string;
  extensionWorker: Worker;
};

type PermissionGrants = { hosts: boolean; permissions: readonly string[] };

type WorkerFixtures = ExtensionProjectOptions & {
  extensionPath: string;
  /** A copy of the build with the given optional permissions granted at install, one per set. */
  grantedBuild: (grants: PermissionGrants) => string;
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
  grantPermissions: [[], { option: true }],
  grantedBuild: [
    async ({ extensionPath }, use, workerInfo) => {
      // One copy per worker and permission set, removed when the worker ends.
      const copies = new Map<string, string>();
      await use(({ hosts, permissions }) => {
        const key = JSON.stringify({ hosts, permissions: [...permissions].sort() });
        const cached = copies.get(key);
        if (cached) return cached;
        // Unpacked extensions cannot answer permission prompts headlessly, so the granted state is
        // simulated by declaring the optional permissions as install-time ones in a copy.
        const directory = workerTempDir(workerInfo, 'granted-build');
        cpSync(extensionPath, directory, { recursive: true });
        const manifestPath = path.join(directory, 'manifest.json');
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const optional: string[] = manifest.optional_permissions ?? [];
        const notOptional = permissions.filter((permission) => !optional.includes(permission));
        if (notOptional.length > 0) {
          throw new Error(`Not optional in this build: ${notOptional.join(', ')}`);
        }
        manifest.permissions = [...manifest.permissions, ...permissions];
        manifest.optional_permissions = optional.filter(
          (permission) => !permissions.includes(permission),
        );
        if (hosts) manifest.host_permissions = manifest.optional_host_permissions;
        writeFileSync(manifestPath, JSON.stringify(manifest));
        copies.set(key, directory);
        return directory;
      });
      for (const directory of copies.values()) removeTempDir(directory);
    },
    { scope: 'worker' },
  ],
  context: async (
    { extensionBrowser, extensionPath, grantWebHostAccess, grantPermissions, grantedBuild },
    use,
    testInfo,
  ) => {
    const loadPath =
      grantWebHostAccess || grantPermissions.length > 0
        ? grantedBuild({ hosts: grantWebHostAccess, permissions: grantPermissions })
        : extensionPath;

    const userDataDir = profileDir(testInfo);
    // The profile is about 10 MB per test; traces and screenshots are saved separately.
    const context = await chromium
      .launchPersistentContext(userDataDir, {
        channel: extensionBrowser,
        headless: true,
        // Popups still animating out would sit over the next control and catch its click.
        // Reduced motion shortens every animation to a single frame and covers that path too.
        reducedMotion: 'reduce',
        args: [`--disable-extensions-except=${loadPath}`, `--load-extension=${loadPath}`],
      })
      .catch((error: unknown) => {
        removeTempDir(userDataDir);
        throw error;
      });

    try {
      await use(context);
    } finally {
      await context.close();
      removeTempDir(userDataDir);
    }
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
