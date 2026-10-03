import { site } from "@bookmark-scout/config";
import "./globals.css";

// Needed because the root layout does not render `<html>`.
export default function NotFound() {
    return (
        <html lang={site.locales.default}>
            <body className="min-h-screen flex items-center justify-center font-sans">
                <main className="text-center">
                    <h1 className="text-4xl font-bold mb-4">404</h1>
                    <a
                        href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${site.url.path(site.locales.default)}`}
                        className="text-teal hover:underline"
                    >
                        {site.name}
                    </a>
                </main>
            </body>
        </html>
    );
}
