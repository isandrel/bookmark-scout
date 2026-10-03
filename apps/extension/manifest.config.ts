import { site } from '@bookmark-scout/config';
import type { ConfigEnv, FirefoxDataCollectionPermissions, UserManifest } from 'wxt';
import type { Browser } from 'wxt/browser';

/**
 * The manifest for each browser build, as a pure function so `tests/unit/manifest-config.test.ts`
 * can check what every store receives. `wxt.config.ts` uses it. Store reviewers read the result,
 * so keep `store/permissions.md` in step with any change here.
 */

type BuildBrowser = ConfigEnv['browser'];

/** Permanent AMO add-on ID. It cannot change once a version is published on addons.mozilla.org. */
export const FIREFOX_ADDON_ID = 'bookmark-scout@isandrel.github.io';

/**
 * Firefox 140 (also an ESR) is the first desktop release with built-in data collection consent
 * (`data_collection_permissions`). Every other key and API the build uses is older.
 */
export const FIREFOX_STRICT_MIN_VERSION = '140.0';

/**
 * Firefox for Android added the same key in 142. Android is not a supported platform (no bookmarks
 * API there, and the AMO listing is desktop only); this only keeps the declaration valid.
 */
export const FIREFOX_ANDROID_STRICT_MIN_VERSION = '142.0';

/**
 * Nothing goes to the developer. When the user turns AI on, bookmark titles, URLs, and folder
 * paths (bookmarksInfo), the active tab's URL (browsingActivity) and title (websiteContent), and
 * the user's provider API key (authenticationInfo) go to the AI provider the user chose. Declared
 * as required until the extension asks for these at first use; see store/privacy-disclosures.md.
 */
export const FIREFOX_DATA_COLLECTION_PERMISSIONS = {
  required: ['authenticationInfo', 'bookmarksInfo', 'browsingActivity', 'websiteContent'],
} satisfies FirefoxDataCollectionPermissions;

/** Website access for the network tools, page reading, and the AI Verify Service check. */
export const OPTIONAL_WEB_ORIGINS = ['http://*/*', 'https://*/*'];

/** Firefox rejects Chromium-only permissions as invalid (`MANIFEST_PERMISSIONS`). */
const CHROMIUM_ONLY: readonly BuildBrowser[] = ['chrome', 'edge'];

/** Each API permission and the browsers it is declared for; a missing list means every browser. */
const API_PERMISSIONS: Record<string, readonly BuildBrowser[] | undefined> = {
  bookmarks: undefined,
  tabs: undefined,
  favicon: CHROMIUM_ONLY,
  storage: undefined,
  sidePanel: CHROMIUM_ONLY,
  contextMenus: undefined,
};

function permissionsFor(browser: BuildBrowser): string[] {
  return Object.entries(API_PERMISSIONS)
    .filter(([, browsers]) => !browsers || browsers.includes(browser))
    .map(([permission]) => permission);
}

/**
 * There is no `web_accessible_resources` entry: the extension's own pages read `_favicon/` without
 * one, and declaring it for `<all_urls>` would only let web pages load icons through the extension.
 */
export function createManifest({ browser }: Pick<ConfigEnv, 'browser'>): UserManifest {
  return {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    // The workspace default locale (config/project.toml); _locales must contain it.
    default_locale: site.locales.default,
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      96: 'icon-96.png',
      128: 'icon-128.png',
    },
    action: {
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
      },
    },
    permissions: permissionsFor(browser) as UserManifest['permissions'],
    // Requested at click time only, never at install: website access for the dead-link and
    // metadata tools, and per-origin access for the AI provider Verify Service check.
    optional_host_permissions: OPTIONAL_WEB_ORIGINS,
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: FIREFOX_ADDON_ID,
              strict_min_version: FIREFOX_STRICT_MIN_VERSION,
              data_collection_permissions: FIREFOX_DATA_COLLECTION_PERMISSIONS,
            },
            gecko_android: { strict_min_version: FIREFOX_ANDROID_STRICT_MIN_VERSION },
          },
        }
      : {}),
  };
}

/**
 * Adapts the generated manifest for Manifest V2 (Firefox), from the `build:manifestGenerated` hook.
 * MV2 has no optional_host_permissions (WXT drops the key), so origins go in optional_permissions.
 */
export function adaptManifestV2(manifest: Browser.runtime.Manifest): void {
  manifest.optional_permissions = [
    ...(manifest.optional_permissions ?? []),
    ...OPTIONAL_WEB_ORIGINS,
  ] as typeof manifest.optional_permissions;
  delete manifest.optional_host_permissions;
}
