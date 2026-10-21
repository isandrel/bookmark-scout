/**
 * What differs between the browser builds, from config/browsers/profiles.toml. Code asks the
 * profile for a capability (`browserProfile().separators`) instead of comparing browser names, so
 * supporting another browser, or a browser changing, is a table in that file. Only this module
 * reads which browser the build is for.
 *
 * Runtime feature checks (an API that may be missing in an older version) stay feature checks.
 */
import { z } from 'zod';
import type { SupportedBrowser } from './supported-browsers';

/** `[browsers] supported` of config/project.toml, in its order. */
export const SUPPORTED_BROWSERS = z
  .tuple([z.string()], z.string())
  .parse(JSON.parse(import.meta.env.BOOKMARK_SCOUT_BROWSERS)) as readonly [
  SupportedBrowser,
  ...SupportedBrowser[],
];

const PRIVATE_WINDOW_KINDS = ['incognito', 'in_private', 'private'] as const;

/** An address with a scheme; `trailingSlash` for one that takes `?id=`. Empty for none. */
const optionalUrl = (trailingSlash: boolean) =>
  z.union([
    z.literal(''),
    z
      .string()
      .regex(trailingSlash ? /^[a-z][a-z0-9+.-]*:\/\/\S+\/$/ : /^[a-z][a-z0-9+.-]*:\/\/\S+$/),
  ]);

const profileSchema = z.strictObject({
  separators: z.boolean(),
  private_window: z.enum(PRIVATE_WINDOW_KINDS),
  private_windows_need_permission: z.boolean(),
  data_collection_consent: z.boolean(),
  bookmark_manager_url: optionalUrl(true),
  shortcut_settings_url: optionalUrl(false),
});

// Every supported browser has exactly one profile; an unknown or missing table fails the load.
const config = readConfig(
  'browsers/profiles',
  z.strictObject({
    profiles: z.strictObject(
      Object.fromEntries(SUPPORTED_BROWSERS.map((browser) => [browser, profileSchema])) as Record<
        SupportedBrowser,
        typeof profileSchema
      >,
    ),
  }),
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
    const profile = config.profiles[browser];
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

export function isSupportedBrowser(value: unknown): value is SupportedBrowser {
  return (SUPPORTED_BROWSERS as readonly unknown[]).includes(value);
}

/**
 * The browser this build is for: WXT's `BROWSER`, which the build sets from its target and the
 * manifest build checks against the supported list, so there is no other value to fall back to.
 * Read at call time, so tests can set it with `vi.stubEnv('BROWSER', ...)`.
 */
export function currentBrowser(): SupportedBrowser {
  const browser = import.meta.env.BROWSER;
  if (!isSupportedBrowser(browser)) throw new Error(`Unsupported browser build: ${browser}`);
  return browser;
}

/** The profile of `browser`, by default the one this build is for. */
export function browserProfile(browser: SupportedBrowser = currentBrowser()): BrowserProfile {
  return BROWSER_PROFILES[browser];
}
