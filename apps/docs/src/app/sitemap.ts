import { site } from "@bookmark-scout/config";
import type { MetadataRoute } from "next";
import { getHreflangAlternates, getTranslatedPages } from "@/lib/source";

export const dynamic = "force-static";

const absolute = (url: string) => new URL(url, site.docs.origin).toString();

/**
 * Every page with its own content: each English page and each real translation. A page without
 * a translation is a copy of the English page, so it is left out. Pages that exist in more than
 * one language list each version as an hreflang alternate.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const { changeFrequency, homePriority, pagePriority } = site.docs.sitemap;
  return getTranslatedPages().map((page) => {
    const languages = getHreflangAlternates(page);
    return {
      url: absolute(page.url),
      lastModified: page.data.lastModified
        ? new Date(page.data.lastModified)
        : undefined,
      changeFrequency:
        changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"],
      priority: page.slugs.length === 0 ? homePriority : pagePriority,
      alternates: languages
        ? {
            languages: Object.fromEntries(
              Object.entries(languages).map(([locale, url]) => [
                locale,
                absolute(url),
              ]),
            ),
          }
        : undefined,
    };
  });
}
