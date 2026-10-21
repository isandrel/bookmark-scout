/**
 * What differs between the browser builds, from config/browsers/profiles.toml. Code asks the
 * profile for a capability (`browserProfile().separators`) instead of comparing browser names, so
 * supporting another browser, or a browser changing, is a table in that file. Only this module
 * reads which browser the build is for.
 *
 * Runtime feature checks (an API that may be missing in an older version) stay feature checks.
 */
import { z } from 'zod';
import {
  isSupportedBrowser,
  SUPPORTED_BROWSERS,
  type SupportedBrowser,
} from './supported-browsers';

const PRIVATE_WINDOW_KINDS = ['incognito', 'in_private', 'private'] as const;

/** A URL with a scheme, ending in `/` where it takes `?id=`; empty for none. */
const optionalUrl = z.union([z.literal(''), z.string().regex(/^[a-z][a-z0-9+.-]*:\/\/\S+$/)]);

const profileSchema = z.strictObject({
  separators: z.boolean(),
  private_window: z.enum(PRIVATE_WINDOW_KINDS),
  private_windows_need_permission: z.boolean(),
  data_collection_consent: z.boolean(),
  bookmark_manager_url: z.union([z.literal(''), z.string().regex(/^[a-z][a-z0-9+.-]*:\/\/\S+\/$/)]),
  shortcut_settings_url: optionalUrl,
});

// Every supported browser has exactly one profile; an unknown or missing table fails the load.
const profiles = readConfig(
  'browsers/profiles',
  z.strictObject(
    Object.fromEntries(SUPPORTED_BROWSERS.map((browser) => [browser, profileSchema])) as Record<
      SupportedBrowser,
      typeof profileSchema
    >,
  ),
);

export type BrowserProfile = {
  separators: boolean;
  privateWindow: (typeof PRIVATE_WINDOW_KINDS)[number];
  privateWindowsNeedPermission: boolean;
  dataCollectionConsent: boolean;
  /** Null where the extension's manager page does not replace the browser's own. */
  bookmarkManagerUrl: string | null;
  /** Null where the browser's shortcut editor opens through its API instead. */
  shortcutSettingsUrl: string | null;
};

const BROWSER_PROFILES = Object.fromEntries(
  SUPPORTED_BROWSERS.map((browser) => {
    const profile = profiles[browser];
    return [
      browser,
      Object.freeze({
        separators: profile.separators,
        privateWindow: profile.private_window,
        privateWindowsNeedPermission: profile.private_windows_need_permission,
        dataCollectionConsent: profile.data_collection_consent,
        bookmarkManagerUrl: profile.bookmark_manager_url || null,
        shortcutSettingsUrl: profile.shortcut_settings_url || null,
      } satisfies BrowserProfile),
    ];
  }),
) as Readonly<Record<SupportedBrowser, BrowserProfile>>;

/**
 * The browser this build is for (WXT's `BROWSER`), Chrome for any other Chromium build. Read at
 * call time, so tests can set it with `vi.stubEnv('BROWSER', ...)`.
 */
export function currentBrowser(): SupportedBrowser {
  const browser = import.meta.env.BROWSER;
  return isSupportedBrowser(browser) ? browser : 'chrome';
}

/** The profile of `browser`, by default the one this build is for. */
export function browserProfile(browser: SupportedBrowser = currentBrowser()): BrowserProfile {
  return BROWSER_PROFILES[browser];
}
