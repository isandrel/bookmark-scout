import { site } from '@bookmark-scout/config';
import { defineRouting } from 'next-intl/routing';

// Server-only: `@bookmark-scout/config` reads the workspace config files.
//
// The default language is served at unprefixed URLs by `app/(default)/` and every other language
// under `/<tag>/` by `app/[locale]/`. A static export has no middleware, so this is done with the
// two route trees rather than next-intl's `localePrefix: 'as-needed'`; `site.url.path()` builds
// the matching URLs.
export const routing = defineRouting({
    locales: site.locales.supported,
    defaultLocale: site.locales.default,
});

/** The languages under a `/<tag>/` prefix: every supported one except the default. */
export const PREFIXED_LOCALES = routing.locales.filter((locale) => locale !== routing.defaultLocale);
