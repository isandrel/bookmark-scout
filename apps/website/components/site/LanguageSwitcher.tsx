"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type LanguageLink = { locale: string; name: string };

/**
 * Links to the same page in each locale. Plain links work without JavaScript and on any width.
 * Locales and their names come from config through the server header, as props.
 *
 * `menu` (the desktop header) folds the list into a <details> dropdown labeled with the current
 * language, because every language name in a row no longer fits; `list` (inside the mobile menu)
 * shows them all as wrapping pills.
 */
export function LanguageSwitcher({
    currentLocale,
    languages,
    label,
    variant = "list",
}: {
    currentLocale: string;
    languages: readonly LanguageLink[];
    label: string;
    variant?: "menu" | "list";
}) {
    const pathname = usePathname();
    // Pathname is "/<locale>/rest"; keep "rest" when switching.
    const rest = pathname.split("/").slice(2).join("/");
    const current = languages.find(({ locale }) => locale === currentLocale);

    const links = (className: string, itemClass: (isCurrent: boolean) => string) => (
        <ul className={className}>
            {languages.map(({ locale, name }) => {
                const isCurrent = locale === currentLocale;
                return (
                    <li key={locale}>
                        <Link
                            href={`/${locale}/${rest}`}
                            hrefLang={locale}
                            lang={locale}
                            aria-current={isCurrent ? "true" : undefined}
                            className={itemClass(isCurrent)}
                        >
                            {name}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );

    if (variant === "list") {
        return (
            <nav aria-label={label}>
                {links("flex flex-wrap items-center gap-1 text-sm", (isCurrent) =>
                    `block rounded-full px-2.5 py-1 transition-colors ${
                        isCurrent ? "bg-ink text-paper" : "text-ink-soft hover:bg-sunken hover:text-ink"
                    }`,
                )}
            </nav>
        );
    }

    return (
        <nav aria-label={label}>
            <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
                        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M1.75 8h12.5M8 1.75c1.7 1.8 2.5 3.8 2.5 6.25S9.7 12.45 8 14.25C6.3 12.45 5.5 10.45 5.5 8S6.3 3.55 8 1.75Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                    <span lang={currentLocale}>{current?.name ?? currentLocale}</span>
                    <span className="sr-only">{label}</span>
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3 transition-transform group-open:rotate-180">
                        <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </summary>
                <div className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-line bg-surface p-2 shadow-xl shadow-ink/10">
                    {links("flex flex-col text-sm", (isCurrent) =>
                        `block rounded-lg px-3 py-1.5 transition-colors ${
                            isCurrent ? "bg-sunken font-semibold text-ink" : "text-ink-soft hover:bg-sunken hover:text-ink"
                        }`,
                    )}
                </div>
            </details>
        </nav>
    );
}
