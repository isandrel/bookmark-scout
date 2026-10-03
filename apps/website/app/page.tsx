import type { Metadata } from "next";
import { site } from "@bookmark-scout/config";

// Static export has no server redirect, and `redirect()` here would ship a JavaScript-only
// error shell. A meta refresh works for crawlers and visitors without JavaScript.
const defaultLocalePath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${site.url.path(site.locales.default)}`;

export const metadata: Metadata = {
    title: site.name,
    robots: { index: false, follow: true },
    alternates: { canonical: site.url.page(site.locales.default) },
};

export default function RootPage() {
    return (
        <html lang={site.locales.default}>
            <head>
                <meta httpEquiv="refresh" content={`0; url=${defaultLocalePath}`} />
            </head>
            <body>
                <a href={defaultLocalePath}>{site.name}</a>
            </body>
        </html>
    );
}
