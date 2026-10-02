import type { Metadata } from "next";
import { SITE_URL, AUTHOR } from "@bookmark-scout/config";

// `<html>` and `<body>` are rendered by `app/[locale]/layout.tsx` so each locale
// gets the correct `lang` attribute. This layout only holds metadata shared by every route.
export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    authors: [{ name: AUTHOR.name, url: AUTHOR.url }],
    creator: AUTHOR.name,
    publisher: AUTHOR.name,
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
    return children;
}
