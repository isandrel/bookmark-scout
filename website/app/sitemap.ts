import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const baseUrl = "https://bookmark-scout.vercel.app";
const locales = ["en", "ja", "ko"];

export default function sitemap(): MetadataRoute.Sitemap {
    const routes = [
        "",
        "/docs",
        "/docs/getting-started",
        "/docs/features",
        "/docs/contributing",
    ];

    const sitemap: MetadataRoute.Sitemap = [];

    for (const locale of locales) {
        for (const route of routes) {
            sitemap.push({
                url: `${baseUrl}/${locale}${route}`,
                lastModified: new Date(),
                changeFrequency: route === "" ? "weekly" : "monthly",
                priority: route === "" ? 1 : 0.8,
            });
        }
    }

    return sitemap;
}
