import { SOCIAL_IMAGE } from "@/lib/assets";
import { AUTHOR, GITHUB_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@bookmark-scout/config";

export function JsonLd() {
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "BrowserApplication",
        operatingSystem: "Chrome, Firefox, Edge",
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
        },
        description: SITE_DESCRIPTION,
        author: {
            "@type": "Person",
            name: AUTHOR.name,
            url: AUTHOR.url,
        },
        url: SITE_URL,
        downloadUrl: `${GITHUB_URL}/releases/latest`,
        screenshot: `${SITE_URL}${SOCIAL_IMAGE.url}`,
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
        isAccessibleForFree: true,
        featureList: [
            "Instant bookmark search",
            "Drag and drop organization",
            "Quick bookmark saving",
            "Side panel support (Chrome and Edge)",
            "Saved searches",
            "Keyboard shortcuts",
            "Delete with undo",
            "Dark mode",
            "Custom bookmarks manager",
            "Duplicate cleanup",
            "Tracking parameter cleanup",
            "Dead link scanning with reviewed repairs",
            "Bookmark import and export",
            "Privacy review with optional redaction before exports",
            "Opt-in AI bookmark tools",
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
