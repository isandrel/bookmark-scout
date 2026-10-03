import type { MetadataRoute } from "next";
import { site } from "@bookmark-scout/config";
import { INDEXABLE_ROUTES, type IndexableRoute, ROUTE_SITEMAP_HINTS } from "@/lib/content/routes";

export const dynamic = "force-static";

/**
 * The date a route's content last changed, for `lastmod`. Only routes with a recorded content
 * date have one; the others omit `lastmod` rather than claim the build date.
 */
function lastModified(route: IndexableRoute): string | undefined {
    return route === "/privacy" ? site.legal.privacyEffectiveDate : undefined;
}

export default function sitemap(): MetadataRoute.Sitemap {
    // Docs live on their own site with their own sitemap.
    return INDEXABLE_ROUTES.flatMap((route) =>
        site.locales.supported.map((locale) => ({
            url: site.url.page(locale, route),
            lastModified: lastModified(route),
            ...ROUTE_SITEMAP_HINTS[route],
            alternates: { languages: site.url.alternates(route) },
        })),
    );
}
