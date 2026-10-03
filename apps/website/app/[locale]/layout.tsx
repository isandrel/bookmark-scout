import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { routing } from "@/i18n/routing";
import { site, SOCIAL_SCREENSHOT, titleTemplate } from "@bookmark-scout/config";
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
        { media: "(prefers-color-scheme: light)", color: site.theme.light },
        { media: "(prefers-color-scheme: dark)", color: site.theme.dark },
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
    const socialImage = { ...SOCIAL_SCREENSHOT, alt: title };

    return {
        title: { absolute: title, template: titleTemplate(site.name) },
        description,
        keywords: t.raw("keywords") as string[],
        alternates: {
            canonical: site.url.page(locale),
            languages: site.url.alternates(),
        },
        openGraph: {
            title,
            description,
            siteName: site.name,
            type: "website",
            locale: site.locales.ogCode(locale),
            url: site.url.page(locale),
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
                {site.analytics.enabled && (
                    <Script
                        defer
                        src={site.analytics.scriptUrl}
                        data-website-id={site.analytics.websiteId}
                        strategy="afterInteractive"
                    />
                )}
                <JsonLd locale={locale} />
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
