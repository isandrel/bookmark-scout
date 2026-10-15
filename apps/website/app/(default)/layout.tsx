import { SiteLayout, siteMetadata, siteViewport } from "@/components/site/SiteLayout";
import { routing } from "@/i18n/routing";
import type { Metadata, Viewport } from "next";

// The default language at unprefixed URLs (`/`, `/privacy/`), with no redirect by browser
// language. The other languages are served by `app/[locale]/`; both render the same
// components, so keep these files thin.

export const viewport: Viewport = siteViewport;

export function generateMetadata(): Promise<Metadata> {
    return siteMetadata(routing.defaultLocale);
}

export default function DefaultLocaleLayout({ children }: { children: React.ReactNode }) {
    return <SiteLayout locale={routing.defaultLocale}>{children}</SiteLayout>;
}
