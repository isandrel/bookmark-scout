import { site, SOCIAL_SCREENSHOT } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";

/** schema.org SoftwareApplication data, in the page's language. */
export async function JsonLd({ locale }: { locale: string }) {
    const t = await getTranslations({ locale });

    const structuredData = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: site.name,
        applicationCategory: "BrowserApplication",
        operatingSystem: site.browsers.supported.map((browser) => site.browsers.name(browser)).join(", "),
        offers: {
            "@type": "Offer",
            price: site.offer.price,
            priceCurrency: site.offer.currency,
        },
        description: t("metadata.description"),
        inLanguage: locale,
        author: {
            "@type": "Person",
            name: site.author.name,
            url: site.author.url,
        },
        url: site.url.origin,
        downloadUrl: site.repo.releasesLatest,
        screenshot: site.url.asset(SOCIAL_SCREENSHOT.url),
        license: site.license.url,
        isAccessibleForFree: true,
        featureList: t.raw("structuredData.features") as string[],
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
    );
}
