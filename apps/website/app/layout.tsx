import type { Metadata } from "next";
import { PUBLIC_PATHS, site } from "@bookmark-scout/config";

// `<html>` and `<body>` are rendered by `app/[locale]/layout.tsx` so each locale
// gets the correct `lang` attribute. This layout only holds metadata shared by every route.
// The web manifest comes from `app/manifest.ts`, which Next.js links automatically.
export const metadata: Metadata = {
    metadataBase: new URL(site.url.origin),
    authors: [{ name: site.author.name, url: site.author.url }],
    creator: site.author.name,
    publisher: site.author.name,
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
        icon: PUBLIC_PATHS.icon,
        apple: PUBLIC_PATHS.icon,
    },
    category: "technology",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return children;
}
