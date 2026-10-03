"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type LanguageLink = { locale: string; name: string };

/**
 * Links to the same page in each locale. Plain links work without JavaScript and on any width.
 * Locales and their names come from config through the server header, as props.
 */
export function LanguageSwitcher({
    currentLocale,
    languages,
    label,
}: {
    currentLocale: string;
    languages: readonly LanguageLink[];
    label: string;
}) {
    const pathname = usePathname();
    // Pathname is "/<locale>/rest"; keep "rest" when switching.
    const rest = pathname.split("/").slice(2).join("/");

    return (
        <nav aria-label={label}>
            <ul className="flex items-center gap-1 text-sm">
                {languages.map(({ locale, name }) => {
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
                                {name}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
