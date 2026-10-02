import type { MetadataRoute } from "next";
import { LOCALES, DEFAULT_LOCALE } from "@bookmark-scout/config";
import { INDEXABLE_ROUTES, ROUTE_SITEMAP_HINTS } from "@/lib/content/routes";
import { localizedUrl } from "@/lib/page-metadata";

export const dynamic = "force-static";

/** Sitemap URLs carry the trailing slash so they match the canonical URLs (`trailingSlash: true`). */
const pageUrl = (locale: string, path: string) => `${localizedUrl(locale, path)}/`;

export default function sitemap(): MetadataRoute.Sitemap {
    // Docs live on their own site (DOCS_URL) with their own sitemap.
    return INDEXABLE_ROUTES.flatMap((path) =>
        LOCALES.map((locale) => ({
            url: pageUrl(locale, path),
            lastModified: new Date(),
            ...ROUTE_SITEMAP_HINTS[path],
            alternates: {
                languages: {
                    ...Object.fromEntries(LOCALES.map((l) => [l, pageUrl(l, path)])),
                    "x-default": pageUrl(DEFAULT_LOCALE, path),
                },
            },
        })),
    );
}
