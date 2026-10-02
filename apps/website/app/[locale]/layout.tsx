import { JsonLd } from "@/components/JsonLd";
import { routing } from "@/i18n/routing";
import { SOCIAL_IMAGE } from "@/lib/assets";
import {
    SITE_META_TITLE,
    SITE_NAME,
    SITE_URL,
    UMAMI_ENABLED,
    UMAMI_SCRIPT_URL,
    UMAMI_WEBSITE_ID,
} from "@bookmark-scout/config";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Inter } from "next/font/google";
import Script from "next/script";
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
    const t = await getTranslations({ locale, namespace: "metadata" });
    const title = t("title");
    const description = t("description");
    const socialImage = {
        url: SOCIAL_IMAGE.url,
        width: SOCIAL_IMAGE.width,
        height: SOCIAL_IMAGE.height,
        alt: `${SITE_NAME} — ${SITE_META_TITLE}`,
    };

    return {
        title: { absolute: title, template: `%s | ${SITE_NAME}` },
        description,
        keywords: [
            "browser extension",
            "chrome extension",
            "firefox addon",
            "edge extension",
            "bookmarks",
            "bookmark manager",
            "productivity",
            "bookmark search",
            "bookmark organizer",
            "drag and drop",
            "bookmark cleanup",
            "AI bookmark tools",
        ],
        alternates: {
            canonical: `${SITE_URL}/${locale}`,
            languages: {
                ...Object.fromEntries(
                    routing.locales.map((l) => [l, `${SITE_URL}/${l}`]),
                ),
                "x-default": `${SITE_URL}/${routing.defaultLocale}`,
            },
        },
        openGraph: {
            title,
            description,
            siteName: SITE_NAME,
            type: "website",
            locale: locale === "ja" ? "ja_JP" : locale === "ko" ? "ko_KR" : "en_US",
            url: `${SITE_URL}/${locale}`,
            images: [socialImage],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [socialImage],
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
