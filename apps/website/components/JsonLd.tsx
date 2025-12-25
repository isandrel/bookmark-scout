import { SITE_URL, AUTHOR, GITHUB_URL } from "@/lib/site-config";

export function JsonLd() {
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Bookmark Scout",
        applicationCategory: "BrowserApplication",
        operatingSystem: "Chrome, Firefox",
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
        },
        description:
            "A modern Chrome extension to quickly search, organize, and save bookmarks to specific folders. Features drag-and-drop, instant search, and dark mode.",
        author: {
            "@type": "Person",
            name: AUTHOR.name,
            url: AUTHOR.url,
        },
        url: SITE_URL,
        downloadUrl: GITHUB_URL,
        screenshot: `${SITE_URL}/icon.png`,
        softwareVersion: "0.1.0",
        aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "5",
            ratingCount: "1",
        },
        featureList: [
            "Instant bookmark search",
            "Drag and drop organization",
            "Quick bookmark saving",
            "Side panel support",
            "Dark mode",
            "Multi-language support",
        ],
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
    );
}
