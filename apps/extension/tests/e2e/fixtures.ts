import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test as base, type BrowserContext, type Worker } from '@playwright/test';

type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
  extensionWorker: Worker;
};

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(currentDirectory, '../../dist/chrome-mv3');

export const test = base.extend<ExtensionFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructuring fixture arguments.
  context: async ({}, use, testInfo) => {
    if (!existsSync(extensionPath)) {
      throw new Error(`Built extension not found at ${extensionPath}`);
    }

    const context = await chromium.launchPersistentContext(testInfo.outputPath('user-data'), {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
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

export { expect };
