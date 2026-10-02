import { SITE_NAME } from "@bookmark-scout/config";
import { routing } from "@/i18n/routing";
import "./globals.css";

// Needed because the root layout does not render `<html>`.
export default function NotFound() {
    return (
        <html lang={routing.defaultLocale} >
            <body className="min-h-screen flex items-center justify-center font-sans">
                <main className="text-center">
                    <h1 className="text-4xl font-bold mb-4">404</h1>
                    <a
                        href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${routing.defaultLocale}/`}
                        className="text-teal hover:underline"
                    >
                        {SITE_NAME}
                    </a>
                </main>
            </body>
        </html>
    );
}
