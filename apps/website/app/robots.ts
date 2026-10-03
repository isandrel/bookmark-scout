import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, site } from "@bookmark-scout/config";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
        },
        sitemap: site.url.asset(PUBLIC_PATHS.sitemap),
    };
}
