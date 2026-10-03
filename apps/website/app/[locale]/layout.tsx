import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { routing } from "@/i18n/routing";
import { SOCIAL_IMAGE } from "@/lib/assets";
import { OG_LOCALES, SITE_KEYWORDS } from "@/lib/seo";
import {
    SITE_NAME,
    SITE_URL,
    UMAMI_ENABLED,
    UMAMI_SCRIPT_URL,
    UMAMI_WEBSITE_ID,
} from "@bookmark-scout/config";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "../globals.css";

const display = Bricolage_Grotesque({
    variable: "--font-bricolage",
    subsets: ["latin"],
    axes: ["opsz", "wdth"],
});

const body = Instrument_Sans({
    variable: "--font-instrument",
    subsets: ["latin"],
});

const code = JetBrains_Mono({
    variable: "--font-jetbrains",
    subsets: ["latin"],
});

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
        { media: "(prefers-color-scheme: dark)", color: "#0d1b2a" },
    ],
};

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
        alt: title,
    };

    return {
        title: { absolute: title, template: `%s | ${SITE_NAME}` },
        description,
        keywords: [...SITE_KEYWORDS],
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
            locale: OG_LOCALES[locale] ?? OG_LOCALES[routing.defaultLocale],
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
        <html lang={locale} className={`${display.variable} ${body.variable} ${code.variable}`}>
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
            <body className="min-h-screen font-sans">
                <NextIntlClientProvider messages={messages}>
                    <SiteHeader locale={locale} />
                    <main id="main">{children}</main>
                    <SiteFooter locale={locale} />
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
