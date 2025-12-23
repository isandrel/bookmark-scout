import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const baseUrl = "https://bookmark-scout.vercel.app";

export const metadata: Metadata = {
    metadataBase: new URL(baseUrl),
    title: {
        default: "Bookmark Scout - Modern Chrome Bookmark Manager",
        template: "%s | Bookmark Scout",
    },
    description:
        "A modern Chrome extension to quickly search, organize, and save bookmarks to specific folders. Features drag-and-drop, instant search, dark mode, and side panel support.",
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
    authors: [{ name: "isandrel", url: "https://github.com/isandrel" }],
    creator: "isandrel",
    publisher: "isandrel",
    openGraph: {
        type: "website",
        locale: "en_US",
        alternateLocale: ["ja_JP", "ko_KR"],
        url: baseUrl,
        siteName: "Bookmark Scout",
        title: "Bookmark Scout - Modern Chrome Bookmark Manager",
        description:
            "A modern Chrome extension to quickly search, organize, and save bookmarks to specific folders. Features drag-and-drop, instant search, and dark mode.",
        images: [
            {
                url: "/icon.png",
                width: 128,
                height: 128,
                alt: "Bookmark Scout Icon",
            },
        ],
    },
    twitter: {
        card: "summary",
        title: "Bookmark Scout - Modern Chrome Bookmark Manager",
        description:
            "A modern Chrome extension to quickly search, organize, and save bookmarks to specific folders.",
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
            <body className={`${inter.variable} font-sans antialiased`}>
                {children}
            </body>
        </html>
    );
}
