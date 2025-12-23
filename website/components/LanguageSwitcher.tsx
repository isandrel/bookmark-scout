"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";

const localeNames: Record<Locale, string> = {
    en: "English",
    ja: "日本語",
    ko: "한국어",
};

export function LanguageSwitcher({ currentLocale }: { currentLocale: string }) {
    const pathname = usePathname();

    // Get the path without the basePath and locale prefix
    const getPathWithoutLocale = () => {
        // pathname already excludes basePath when using Next.js Link
        // e.g., pathname = "/en/docs" (not "/bookmark-scout/en/docs")
        const segments = pathname.split("/");
        // Remove locale segment (first segment after base)
        const pathWithoutLocale = segments.slice(2).join("/");
        return pathWithoutLocale ? `/${pathWithoutLocale}` : "";
    };

    return (
        <div className="flex items-center gap-2">
            {routing.locales.map((locale) => {
                const isActive = locale === currentLocale;
                // Don't include basePath - Next.js Link handles it automatically
                const newPath = `/${locale}${getPathWithoutLocale()}`;

                return (
                    <Link
                        key={locale}
                        href={newPath}
                        className={`text-sm px-2 py-1 rounded transition-colors ${isActive
                                ? "bg-white/20 font-medium"
                                : "text-muted hover:text-foreground hover:bg-white/10"
                            }`}
                    >
                        {localeNames[locale]}
                    </Link>
                );
            })}
        </div>
    );
}
