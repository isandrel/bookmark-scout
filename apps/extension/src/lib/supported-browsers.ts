/**
 * A browser build: one of `[browsers] supported` in config/project.toml, which
 * `lib/browser-profiles.ts` loads with what each one can do. A type only, with no auto-imported
 * names, so the manifest build can read it (the permission and command catalogs key their tables
 * by it); `browser-profiles.test.ts` keeps it in step with the config.
 */
export type SupportedBrowser = 'chrome' | 'firefox' | 'edge';
