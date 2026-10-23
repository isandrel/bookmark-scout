import { describe, expect, it } from 'vitest';
import type { Browser } from 'wxt/browser';
import {
  BOOKMARK_SHORTCUT_TAKEOVER,
  BROWSER_KEPT_SHORTCUTS,
  COMMAND_SUGGESTED_KEYS,
} from '@/lib/keyboard-shortcuts';
import { adaptManifestV2, createManifest, FIREFOX_ADDON_ID } from '../../manifest.config';

describe('manifest config', () => {
  it('gives the Firefox build its permanent add-on ID and asks for no data at install', () => {
    const manifest = createManifest({ browser: 'firefox' });

    expect(FIREFOX_ADDON_ID).toBe('bookmark-scout@isandrel.github.io');
    expect(manifest.browser_specific_settings?.gecko).toEqual({
      id: 'bookmark-scout@isandrel.github.io',
      strict_min_version: '140.0',
      data_collection_permissions: {
        required: ['none'],
        optional: ['authenticationInfo', 'bookmarksInfo', 'browsingActivity', 'websiteContent'],
      },
    });
    expect(manifest.browser_specific_settings?.gecko_android).toEqual({
      strict_min_version: '142.0',
    });
  });

  it.each(['chrome', 'edge'])('leaves browser_specific_settings out of the %s build', (browser) => {
    expect(createManifest({ browser })).not.toHaveProperty('browser_specific_settings');
  });

  it('asks at install only for what the extension cannot work without', () => {
    for (const browser of ['chrome', 'edge']) {
      const manifest = createManifest({ browser });
      expect(manifest.permissions).toEqual([
        'bookmarks',
        'storage',
        'activeTab',
        'sidePanel',
        'scripting',
        'offscreen',
        'alarms',
      ]);
      expect(manifest.optional_permissions).toEqual([
        'tabs',
        'favicon',
        'contextMenus',
        'nativeMessaging',
      ]);
      // `<all_urls>` only for Capture Covers While Browsing, asked for when it is turned on.
      expect(manifest.optional_host_permissions).toEqual([
        'http://*/*',
        'https://*/*',
        '<all_urls>',
      ]);
    }
    // Firefox cannot make contextMenus optional and has no favicon or sidePanel permission.
    const firefox = createManifest({ browser: 'firefox' });
    expect(firefox.permissions).toEqual([
      'bookmarks',
      'storage',
      'activeTab',
      'scripting',
      'alarms',
      'contextMenus',
    ]);
    expect(firefox.optional_permissions).toEqual(['tabs', 'nativeMessaging']);
  });

  it.each(['chrome', 'edge', 'firefox'] as const)(
    'installs the %s build with the bookmarks warning only',
    (browser) => {
      // Permissions no browser warns about at install (checked with Chromium's
      // getPermissionWarningsByManifest and Firefox's permission strings). Anything with a warning
      // is optional and asked for when a feature needs it; tests/e2e/install-warnings.spec.ts
      // asks Chromium itself.
      const warningFree = [
        'storage',
        'activeTab',
        'sidePanel',
        'scripting',
        'offscreen',
        'alarms',
        'contextMenus',
      ];
      const manifest = createManifest({ browser }) as Browser.runtime.Manifest & {
        host_permissions?: string[];
      };
      const warned = (manifest.permissions ?? []).filter(
        (permission) => !warningFree.includes(String(permission)),
      );
      expect(warned).toEqual(['bookmarks']);
      expect(manifest.host_permissions ?? []).toEqual([]);
      expect(manifest.content_scripts ?? []).toEqual([]);
    },
  );

  it.each(['chrome', 'edge', 'firefox'] as const)(
    'suggests no key the %s build would leave unassigned or never receive',
    (browser) => {
      const manifest = createManifest({ browser });
      const suggested = Object.values(manifest.commands ?? {}).map(
        (command) => command.suggested_key?.default,
      );
      expect(suggested).toEqual(Object.values(COMMAND_SUGGESTED_KEYS));
      // Chrome and Edge never auto-assign their bookmark keys, and Firefox keeps them for itself.
      const bookmarkKeys = [
        BOOKMARK_SHORTCUT_TAKEOVER.shortcut,
        ...(BROWSER_KEPT_SHORTCUTS.firefox ?? []),
      ];
      for (const key of bookmarkKeys) expect(suggested).not.toContain(key);
      // The command offered the bookmark keys exists, and no manifest asks to take them over.
      expect(manifest.commands).toHaveProperty(BOOKMARK_SHORTCUT_TAKEOVER.command);
      expect(manifest).not.toHaveProperty('chrome_ui_overrides');
    },
  );

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

    expect(manifest.optional_permissions).toEqual([
      'tabs',
      'nativeMessaging',
      'http://*/*',
      'https://*/*',
      '<all_urls>',
    ]);
    expect(manifest).not.toHaveProperty('optional_host_permissions');
  });
});
