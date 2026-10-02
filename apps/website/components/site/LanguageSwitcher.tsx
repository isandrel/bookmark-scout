"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";

const localeNames: Record<Locale, string> = {
    en: "English",
    ja: "日本語",
    ko: "한국어",
};

/** Links to the same page in each locale. Plain links work without JavaScript and on any width. */
export function LanguageSwitcher({ currentLocale, label }: { currentLocale: string; label: string }) {
    const pathname = usePathname();
    // Pathname is "/<locale>/rest"; keep "rest" when switching.
    const rest = pathname.split("/").slice(2).join("/");

    return (
        <nav aria-label={label}>
            <ul className="flex items-center gap-1 text-sm">
                {routing.locales.map((locale) => {
                    const isCurrent = locale === currentLocale;
                    return (
                        <li key={locale}>
                            <Link
                                href={`/${locale}/${rest}`}
                                hrefLang={locale}
                                lang={locale}
                                aria-current={isCurrent ? "true" : undefined}
                                className={`rounded-full px-2.5 py-1 transition-colors ${
                                    isCurrent
                                        ? "bg-ink text-paper"
                                        : "text-ink-soft hover:bg-sunken hover:text-ink"
                                }`}
                            >
                                {localeNames[locale]}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
