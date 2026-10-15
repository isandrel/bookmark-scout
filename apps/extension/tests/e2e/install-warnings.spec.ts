import type { Worker } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * What the browser shows when someone installs the extension, computed by the browser itself
 * (`management.getPermissionWarningsByManifest`) for the built manifest. Installing must ask only
 * to read and change bookmarks; everything else is optional and asked for when a feature needs
 * it. A permission with a warning added to the required list fails here, whatever the unit tests
 * think its warning is.
 *
 * The runtime prompts are pinned too, in English in Chromium, because the store listings and the
 * docs quote them ("What your browser will ask, and why").
 */

type Manifest = chrome.runtime.Manifest & {
  optional_permissions?: string[];
  optional_host_permissions?: string[];
  host_permissions?: string[];
};

/** Warnings for the installed manifest and for variants of it with one more permission. */
async function readWarnings(worker: Worker) {
  return worker.evaluate(async () => {
    const manifest = chrome.runtime.getManifest() as Manifest;
    const { optional_permissions = [], optional_host_permissions = [], ...installed } = manifest;
    const warnings = (variant: object) =>
      chrome.management.getPermissionWarningsByManifest(JSON.stringify(variant));
    const withPermissions = (permissions: string[], hosts: string[] = []) =>
      warnings({ ...installed, permissions, host_permissions: hosts });
    const optionalAlone: Record<string, string[]> = {};
    for (const permission of optional_permissions) {
      optionalAlone[permission] = await withPermissions([permission]);
    }
    return {
      install: await warnings(manifest),
      installedHosts: manifest.host_permissions ?? [],
      bookmarksAlone: await withPermissions(['bookmarks']),
      optionalAlone,
      optionalHosts: optional_host_permissions,
      allWebsites: await withPermissions([], optional_host_permissions),
      oneSite: await withPermissions([], ['http://*.example.com/*', 'https://*.example.com/*']),
      // Distinct names: Chrome merges sites that differ only in their top-level domain.
      fourSites: await withPermissions(
        [],
        ['example.com', 'wikipedia.org', 'github.com', 'bbc.co.uk'].map(
          (site) => `https://*.${site}/*`,
        ),
      ),
    };
  });
}

test('installing asks only to read and change bookmarks', async ({ extensionWorker }) => {
  const warnings = await readWarnings(extensionWorker);

  expect(warnings.installedHosts).toEqual([]);
  expect(warnings.bookmarksAlone).toHaveLength(1);
  expect(warnings.install).toEqual(warnings.bookmarksAlone);
  // Website access is optional only, for http and https.
  expect(warnings.optionalHosts).toEqual(['http://*/*', 'https://*/*']);
});

test('each optional permission prompts with the wording the listings and docs quote', async ({
  extensionWorker,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Wording pinned for Chromium in English');
  const warnings = await readWarnings(extensionWorker);

  expect(warnings.bookmarksAlone).toEqual(['Read and change your bookmarks']);
  expect(warnings.optionalAlone).toEqual({
    tabs: ['Read your browsing history'],
    favicon: ['Read the icons of the websites you visit'],
    contextMenus: [],
    nativeMessaging: ['Communicate with cooperating native applications'],
  });
  expect(warnings.allWebsites).toEqual(['Read and change all your data on all websites']);
  // A tool run over a few bookmarked sites asks for just those (lib/site-access.ts).
  expect(warnings.oneSite).toEqual(['Read and change your data on all example.com sites']);
  expect(warnings.fourSites).toEqual(['Read and change your data on a number of websites']);
});
