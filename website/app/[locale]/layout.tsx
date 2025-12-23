import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { JsonLd } from "@/components/JsonLd";
import "../globals.css";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const messages = await getMessages();
    const metadata = messages.metadata as { title: string; description: string };

    return {
        title: metadata.title,
        description: metadata.description,
        keywords: [
            "chrome extension",
            "bookmarks",
            "bookmark manager",
            "productivity",
            "browser extension",
            "bookmark search",
            "bookmark organizer",
            "drag and drop",
        ],
        alternates: {
            canonical: `https://isandrel.github.io/bookmark-scout/${locale}`,
            languages: {
                en: "https://isandrel.github.io/bookmark-scout/en",
                ja: "https://isandrel.github.io/bookmark-scout/ja",
                ko: "https://isandrel.github.io/bookmark-scout/ko",
            },
        },
        openGraph: {
            title: "Bookmark Scout",
            description: metadata.description,
            type: "website",
            locale: locale === "ja" ? "ja_JP" : locale === "ko" ? "ko_KR" : "en_US",
            url: `https://isandrel.github.io/bookmark-scout/${locale}`,
            images: [
                {
                    url: "/bookmark-scout/icon.png",
                    width: 128,
                    height: 128,
                    alt: "Bookmark Scout",
                },
            ],
        },
        twitter: {
            card: "summary",
            title: "Bookmark Scout",
            description: metadata.description,
            images: ["/bookmark-scout/icon.png"],
        },
    };
}

export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);

    const messages = await getMessages();

    return (
        <html lang={locale} className="dark">
            <head>
                <JsonLd />
            </head>
            <body className={`${inter.variable} font-sans antialiased`}>
                <NextIntlClientProvider messages={messages}>
                    {children}
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
