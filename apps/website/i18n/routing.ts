import { site } from '@bookmark-scout/config';
import { defineRouting } from 'next-intl/routing';

// Server-only: `@bookmark-scout/config` reads the workspace config files.
export const routing = defineRouting({
    locales: site.locales.supported,
    defaultLocale: site.locales.default,
});
