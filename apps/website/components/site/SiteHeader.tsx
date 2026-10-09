import { PUBLIC_PATHS, site } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { type LanguageLink, LanguageSwitcher } from "./LanguageSwitcher";

const LANGUAGES: LanguageLink[] = site.locales.supported.map((locale) => ({
    locale,
    name: site.locales.name(locale),
}));

export async function SiteHeader({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "nav" });
    const links = [
        { href: site.url.path(locale, "", "features"), label: t("features"), external: false },
        { href: site.url.path(locale, "/privacy"), label: t("privacy"), external: false },
        { href: site.url.path(locale, "", "install"), label: t("install"), external: false },
        { href: site.docs.url(), label: t("docs"), external: true },
        { href: site.repo.url(), label: t("github"), external: true },
    ];

    const linkList = (className: string) => (
        <ul className={className}>
            {links.map((link) => (
                <li key={link.href}>
                    {link.external ? (
                        <a href={link.href} className="text-ink-soft transition-colors hover:text-ink">
                            {link.label}
                        </a>
                    ) : (
                        <Link href={link.href} className="text-ink-soft transition-colors hover:text-ink">
                            {link.label}
                        </Link>
                    )}
                </li>
            ))}
        </ul>
    );

    return (
        <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
            >
                {t("skip")}
            </a>
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
                <Link href={site.url.path(locale)} aria-label={t("home")} className="flex shrink-0 items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static export, icon is already 128px */}
                    <img src={PUBLIC_PATHS.icon} alt="" width={28} height={28} className="size-7" />
                    <span className="font-display text-lg font-bold tracking-tight">{site.name}</span>
                </Link>

                <nav aria-label={t("menu")} className="hidden lg:block">
                    {linkList("flex items-center gap-6 whitespace-nowrap text-[0.95rem]")}
                </nav>

                <div className="hidden lg:block">
                    <LanguageSwitcher currentLocale={locale} languages={LANGUAGES} label={t("languages")} variant="menu" />
                </div>

                <details className="group relative lg:hidden">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm [&::-webkit-details-marker]:hidden">
                        {t("menu")}
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 transition-transform group-open:rotate-180">
                            <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </summary>
                    <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-line bg-surface p-4 shadow-xl shadow-ink/10">
                        {linkList("mb-4 flex flex-col gap-3 border-b border-line pb-4")}
                        <LanguageSwitcher currentLocale={locale} languages={LANGUAGES} label={t("languages")} />
                    </div>
                </details>
            </div>
        </header>
    );
}
