import type { MetadataRoute } from "next";
import { SITE_URL, LOCALES } from "@/lib/site-config";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
    const routes = [
        "",
        "/docs",
        "/docs/getting-started",
        "/docs/features",
        "/docs/contributing",
    ];

    const sitemap: MetadataRoute.Sitemap = [];

    for (const locale of LOCALES) {
        for (const route of routes) {
            sitemap.push({
                url: `${SITE_URL}/${locale}${route}`,
                lastModified: new Date(),
                changeFrequency: route === "" ? "weekly" : "monthly",
                priority: route === "" ? 1 : 0.8,
            });
        }
    }

    return sitemap;
}
