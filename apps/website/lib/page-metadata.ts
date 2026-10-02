import { routing } from "@/i18n/routing";
import { SOCIAL_IMAGE } from "@/lib/assets";
import { OG_LOCALES } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@bookmark-scout/config";
import type { Metadata } from "next";

/** Absolute URL of a localized page. Next.js adds the trailing slash (`trailingSlash: true`). */
export function localizedUrl(locale: string, path: string): string {
    return `${SITE_URL}/${locale}${path}`;
}

/**
 * Metadata for a localized inner page: title (filled into the layout's `%s | site` template),
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
    const url = localizedUrl(locale, path);
    const socialTitle = `${title} | ${SITE_NAME}`;
    const images = [{ ...SOCIAL_IMAGE, alt: socialTitle }];
    return {
        title,
        description,
        alternates: {
            canonical: url,
            languages: {
                ...Object.fromEntries(routing.locales.map((l) => [l, localizedUrl(l, path)])),
                "x-default": localizedUrl(routing.defaultLocale, path),
            },
        },
        openGraph: {
            title: socialTitle,
            description,
            url,
            siteName: SITE_NAME,
            type: "website",
            locale: OG_LOCALES[locale] ?? OG_LOCALES[routing.defaultLocale],
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
