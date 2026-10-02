import { DOCS_URL } from "@bookmark-scout/config";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${DOCS_URL}/sitemap.xml`,
  };
}
