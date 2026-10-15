import { JsonLd } from "@/components/JsonLd";
import { LanguageSuggestion, type LanguageSuggestionCopy } from "@/components/site/LanguageSuggestion";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { site, SOCIAL_SCREENSHOT, titleTemplate } from "@bookmark-scout/config";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "../../app/globals.css";

// The site layout for one language. `app/(default)/layout.tsx` renders it for the default
// language at unprefixed URLs and `app/[locale]/layout.tsx` for the others, so the two route
// trees cannot drift. It is the only layout that renders `<html>`, so each page gets its `lang`.

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

export const siteViewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: site.theme.light },
        { media: "(prefers-color-scheme: dark)", color: site.theme.dark },
    ],
};

export async function siteMetadata(locale: string): Promise<Metadata> {
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

/** The suggestion banner's copy in every language: it speaks the suggested language, not the page's. */
async function suggestionCopy(): Promise<Record<string, LanguageSuggestionCopy>> {
    const entries = await Promise.all(
        site.locales.supported.map(async (locale) => {
            const t = await getTranslations({ locale, namespace: "languageSuggestion" });
            const copy: LanguageSuggestionCopy = {
                label: t("label"),
                text: t("text"),
                action: t("action"),
                dismiss: t("dismiss"),
            };
            return [locale, copy] as const;
        }),
    );
    return Object.fromEntries(entries);
}

export async function SiteLayout({ locale, children }: { locale: string; children: React.ReactNode }) {
    setRequestLocale(locale);
    const [messages, suggestions] = await Promise.all([getMessages(), suggestionCopy()]);

    return (
        <html lang={locale} className={`${display.variable} ${body.variable} ${code.variable}`}>
            {/* eslint-disable-next-line @next/next/no-head-element -- App Router layout, rendered only from app/ */}
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
                <LanguageSuggestion currentLocale={locale} routing={site.locales.routing} copy={suggestions} />
            </body>
        </html>
    );
}
