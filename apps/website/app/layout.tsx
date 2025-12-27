import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import {
    SITE_URL,
    SITE_NAME,
    SITE_DESCRIPTION,
    AUTHOR,
    UMAMI_ENABLED,
    UMAMI_WEBSITE_ID,
    UMAMI_SCRIPT_URL,
} from "@bookmark-scout/config";
import "./globals.css";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: `${SITE_NAME} - Modern Chrome Bookmark Manager`,
        template: `%s | ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    keywords: [
        "Chrome extension",
        "bookmark manager",
        "bookmark organizer",
        "browser bookmarks",
        "bookmark search",
        "drag and drop bookmarks",
        "bookmark folders",
        "Chrome bookmarks",
        "Firefox bookmarks",
        "bookmark scout",
    ],
    authors: [{ name: AUTHOR.name, url: AUTHOR.url }],
    creator: AUTHOR.name,
    publisher: AUTHOR.name,
    openGraph: {
        type: "website",
        locale: "en_US",
        alternateLocale: ["ja_JP", "ko_KR"],
        url: SITE_URL,
        siteName: SITE_NAME,
        title: `${SITE_NAME} - Modern Chrome Bookmark Manager`,
        description: SITE_DESCRIPTION,
        images: [
            {
                url: "/icon.png",
                width: 128,
                height: 128,
                alt: `${SITE_NAME} Icon`,
            },
        ],
    },
    twitter: {
        card: "summary",
        title: `${SITE_NAME} - Modern Chrome Bookmark Manager`,
        description: SITE_DESCRIPTION,
        images: ["/icon.png"],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
    icons: {
        icon: "/icon.png",
        apple: "/icon.png",
    },
    manifest: "/manifest.json",
    category: "technology",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark">
            <head>
                {UMAMI_ENABLED && (
                    <Script
                        defer
                        src={UMAMI_SCRIPT_URL}
                        data-website-id={UMAMI_WEBSITE_ID}
                        strategy="afterInteractive"
                    />
                )}
            </head>
            <body className={`${inter.variable} font-sans antialiased`}>
                {children}
            </body>
        </html>
    );
}
