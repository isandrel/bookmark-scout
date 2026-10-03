import { site, SOCIAL_SCREENSHOT, withSiteName } from "@bookmark-scout/config";
import type { Metadata } from "next";

/**
 * Metadata for a localized inner page: title (filled into the layout's title template),
 * description, canonical URL, hreflang alternates with `x-default`, Open Graph, and Twitter.
 * Open Graph and Twitter objects replace the layout's rather than merging, so the social
 * image is repeated here.
 */
export function localizedPageMetadata({
    locale,
    path,
    title,
    description,
}: {
    locale: string;
    path: `/${string}`;
    title: string;
    description: string;
}): Metadata {
    const url = site.url.page(locale, path);
    const socialTitle = withSiteName(title, site.name);
    const images = [{ ...SOCIAL_SCREENSHOT, alt: socialTitle }];
    return {
        title,
        description,
        alternates: {
            canonical: url,
            languages: site.url.alternates(path),
        },
        openGraph: {
            title: socialTitle,
            description,
            url,
            siteName: site.name,
            type: "website",
            locale: site.locales.ogCode(locale),
            images,
        },
        twitter: {
            card: "summary_large_image",
            title: socialTitle,
            description,
            images,
        },
    };
}
