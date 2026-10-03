import type { MetadataRoute } from "next";

// No `@bookmark-scout/config` import here: the browser tests load this file as CommonJS.

/** Every indexable page, rendered once per locale. `""` is the locale home. No trailing slash. */
export const INDEXABLE_ROUTES = ["", "/privacy", "/support"] as const;

export type IndexableRoute = (typeof INDEXABLE_ROUTES)[number];

type SitemapHints = Required<Pick<MetadataRoute.Sitemap[number], "changeFrequency" | "priority">>;

/** Crawl hints for each indexable route, used by the sitemap. */
export const ROUTE_SITEMAP_HINTS: Record<IndexableRoute, SitemapHints> = {
    "": { changeFrequency: "weekly", priority: 1 },
    "/privacy": { changeFrequency: "yearly", priority: 0.5 },
    "/support": { changeFrequency: "monthly", priority: 0.6 },
};
