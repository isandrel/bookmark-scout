import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { JsonLd } from "@/components/JsonLd";
import {
    SITE_URL,
    SITE_NAME,
    SITE_META_TITLE,
    SITE_DESCRIPTION,
    UMAMI_ENABLED,
    UMAMI_WEBSITE_ID,
    UMAMI_SCRIPT_URL,
} from "@bookmark-scout/config";
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
    await getMessages();

    return {
        title: `${SITE_NAME} | ${SITE_META_TITLE}`,
        description: SITE_DESCRIPTION,
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
            canonical: `${SITE_URL}/${locale}`,
            languages: {
                en: `${SITE_URL}/en`,
                ja: `${SITE_URL}/ja`,
                ko: `${SITE_URL}/ko`,
            },
        },
        openGraph: {
            title: SITE_NAME,
            description: SITE_DESCRIPTION,
            type: "website",
            locale: locale === "ja" ? "ja_JP" : locale === "ko" ? "ko_KR" : "en_US",
            url: `${SITE_URL}/${locale}`,
            images: [
                {
                    url: "/icon.png",
                    width: 128,
                    height: 128,
                    alt: SITE_NAME,
                },
            ],
        },
        twitter: {
            card: "summary",
            title: SITE_NAME,
            description: SITE_DESCRIPTION,
            images: ["/icon.png"],
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
                {UMAMI_ENABLED && (
                    <Script
                        defer
                        src={UMAMI_SCRIPT_URL}
                        data-website-id={UMAMI_WEBSITE_ID}
                        strategy="afterInteractive"
                    />
                )}
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
