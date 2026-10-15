/**
 * The welcome page (`welcome.html`, `WelcomePage`), opened once in a new tab right after
 * Bookmark Scout is installed, never on an update. When it opens is `config/ui/welcome.toml`.
 * The background registers the listener synchronously at startup, beside the storage cleanup's
 * own `onInstalled` listener (`lib/storage/cleanup.ts`).
 */
import { z } from 'zod';

const welcomeConfig = readConfig(
  'ui/welcome',
  z.strictObject({
    open_on_install: z.boolean(),
    open_on_temporary_install: z.boolean(),
    guide_path: z.string().regex(/^\/[\w\-/]*$/),
  }),
);

export type WelcomeConfig = Pick<
  typeof welcomeConfig,
  'open_on_install' | 'open_on_temporary_install'
>;

/** What `runtime.onInstalled` reports; `temporary` is Firefox's, for an about:debugging load. */
export type InstallDetails = { reason: string; temporary?: boolean };

/** The page's path inside the extension. */
export const WELCOME_PAGE_PATH = '/welcome.html';

/** The docs page the welcome page's guide link opens. */
export const WELCOME_GUIDE_URL = `${import.meta.env.BOOKMARK_SCOUT_DOCS_URL}${welcomeConfig.guide_path}`;

/**
 * Whether an `onInstalled` event opens the welcome page: a first install only (not `update`,
 * `chrome_update`, `browser_update`, or `shared_module_update`), and a Firefox temporary add-on
 * only where the config allows it.
 */
export function shouldOpenWelcomePage(
  details: InstallDetails,
  config: WelcomeConfig = welcomeConfig,
): boolean {
  if (details.reason !== 'install' || !config.open_on_install) return false;
  return !details.temporary || config.open_on_temporary_install;
}

/** Opens the welcome page after a first install. Call synchronously when the background starts. */
export function registerWelcomePage(): void {
  browser.runtime.onInstalled.addListener((details: InstallDetails) => {
    if (!shouldOpenWelcomePage(details)) return;
    void browser.tabs
      .create({ url: browser.runtime.getURL(WELCOME_PAGE_PATH), active: true })
      .catch((error) => {
        console.error('[Welcome] Failed to open the welcome page:', error);
      });
  });
}
