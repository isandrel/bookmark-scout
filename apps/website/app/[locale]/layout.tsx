import { SiteLayout, siteMetadata, siteViewport } from "@/components/site/SiteLayout";
import { PREFIXED_LOCALES } from "@/i18n/routing";
import type { Metadata, Viewport } from "next";

// Every language except the default, under `/<tag>/`. The default language has no prefix and
// is served by `app/(default)/`; both render the same components, so keep these files thin.

type LayoutProps = { children: React.ReactNode; params: Promise<{ locale: string }> };

export const dynamicParams = false;

export const viewport: Viewport = siteViewport;

export function generateStaticParams() {
    return PREFIXED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Pick<LayoutProps, "params">): Promise<Metadata> {
    return siteMetadata((await params).locale);
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
    return <SiteLayout locale={(await params).locale}>{children}</SiteLayout>;
}
