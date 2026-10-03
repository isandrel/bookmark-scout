import { describe, expect, it } from 'vitest';
import type { Browser } from 'wxt/browser';
import { adaptManifestV2, createManifest, FIREFOX_ADDON_ID } from '../../manifest.config';

describe('manifest config', () => {
  it('gives the Firefox build its permanent add-on ID and data collection declaration', () => {
    const manifest = createManifest({ browser: 'firefox' });

    expect(FIREFOX_ADDON_ID).toBe('bookmark-scout@isandrel.github.io');
    expect(manifest.browser_specific_settings?.gecko).toEqual({
      id: 'bookmark-scout@isandrel.github.io',
      strict_min_version: '140.0',
      data_collection_permissions: {
        required: ['authenticationInfo', 'bookmarksInfo', 'browsingActivity', 'websiteContent'],
      },
    });
    expect(manifest.browser_specific_settings?.gecko_android).toEqual({
      strict_min_version: '142.0',
    });
  });

  it.each(['chrome', 'edge'])('leaves browser_specific_settings out of the %s build', (browser) => {
    expect(createManifest({ browser })).not.toHaveProperty('browser_specific_settings');
  });

  it('declares the Chromium-only permissions for Chrome and Edge only', () => {
    expect(createManifest({ browser: 'chrome' }).permissions).toEqual([
      'bookmarks',
      'tabs',
      'favicon',
      'storage',
      'sidePanel',
      'contextMenus',
    ]);
    expect(createManifest({ browser: 'edge' }).permissions).toEqual(
      createManifest({ browser: 'chrome' }).permissions,
    );
    expect(createManifest({ browser: 'firefox' }).permissions).toEqual([
      'bookmarks',
      'tabs',
      'storage',
      'contextMenus',
    ]);
  });

  it('exposes no extension resources to web pages', () => {
    for (const browser of ['chrome', 'edge', 'firefox']) {
      expect(createManifest({ browser })).not.toHaveProperty('web_accessible_resources');
    }
  });

  it('moves optional website access into optional_permissions for Manifest V2', () => {
    const manifest = {
      manifest_version: 2,
      name: 'Test',
      version: '1.0.0',
      ...createManifest({ browser: 'firefox' }),
    } as Browser.runtime.Manifest;

    adaptManifestV2(manifest);

    expect(manifest.optional_permissions).toEqual(['http://*/*', 'https://*/*']);
    expect(manifest).not.toHaveProperty('optional_host_permissions');
  });
});
