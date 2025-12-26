import type { MetadataRoute } from "next";
import { SITE_URL, LOCALES } from "@bookmark-scout/config";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
    // Only include main landing page - docs are on docs.bookmark-scout.com
    const routes = [""];

    const sitemap: MetadataRoute.Sitemap = [];

    for (const locale of LOCALES) {
        for (const route of routes) {
            sitemap.push({
                url: `${SITE_URL}/${locale}${route}`,
                lastModified: new Date(),
                changeFrequency: "weekly",
                priority: 1,
            });
        }
    }

    return sitemap;
}
