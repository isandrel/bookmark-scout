/**
 * The browser builds. Pure, with no auto-imported names, so the manifest build can read it (the
 * permission and command catalogs key their tables by it). What each browser can do is its
 * profile, `lib/browser-profiles.ts`.
 */

/** In the order of `[browsers] supported` in config/project.toml (`browser-profiles.test.ts`). */
export const SUPPORTED_BROWSERS = ['chrome', 'firefox', 'edge'] as const;

export type SupportedBrowser = (typeof SUPPORTED_BROWSERS)[number];

export function isSupportedBrowser(value: unknown): value is SupportedBrowser {
  return (SUPPORTED_BROWSERS as readonly unknown[]).includes(value);
}
