import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@bookmark-scout/config";
import { routing } from "@/i18n/routing";

// Static export has no server redirect, and `redirect()` here would ship a JavaScript-only
// error shell. A meta refresh works for crawlers and visitors without JavaScript.
const defaultLocalePath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${routing.defaultLocale}/`;

export const metadata: Metadata = {
    title: SITE_NAME,
    robots: { index: false, follow: true },
    alternates: { canonical: `${SITE_URL}/${routing.defaultLocale}` },
};

export default function RootPage() {
    return (
        <html lang={routing.defaultLocale}>
            <head>
                <meta httpEquiv="refresh" content={`0; url=${defaultLocalePath}`} />
            </head>
            <body>
                <a href={defaultLocalePath}>{SITE_NAME}</a>
            </body>
        </html>
    );
}
