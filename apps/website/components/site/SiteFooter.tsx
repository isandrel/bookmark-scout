import { AUTHOR, CONTACT, DOCS_URL, GITHUB_URL, SITE_NAME } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

type FooterLink = { href: string; label: string; internal?: boolean };

export async function SiteFooter({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "footer" });
    const columns: { title: string; links: FooterLink[] }[] = [
        {
            title: t("product"),
            links: [
                { href: `/${locale}/#features`, label: t("features"), internal: true },
                { href: `/${locale}/#install`, label: t("install"), internal: true },
                { href: DOCS_URL, label: t("docs") },
                { href: `${GITHUB_URL}/releases`, label: t("releases") },
            ],
        },
        {
            title: t("project"),
            links: [
                { href: GITHUB_URL, label: t("github") },
                { href: `${DOCS_URL}/contributing`, label: t("contributing") },
                { href: `${GITHUB_URL}/blob/main/LICENSE`, label: t("license") },
            ],
        },
        {
            title: t("contact"),
            links: [
                { href: `mailto:${CONTACT.support}`, label: `${t("support")}: ${CONTACT.support}` },
                { href: `mailto:${CONTACT.privacy}`, label: `${t("privacy")}: ${CONTACT.privacy}` },
                { href: `mailto:${CONTACT.security}`, label: `${t("security")}: ${CONTACT.security}` },
            ],
        },
        {
            title: t("legal"),
            links: [
                { href: `/${locale}/privacy/`, label: t("privacyPolicy"), internal: true },
                { href: "/.well-known/security.txt", label: t("securityTxt") },
            ],
        },
    ];

    return (
        <footer className="border-t border-line bg-sunken">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_repeat(4,1fr)]">
                <div>
                    <p className="font-display text-xl font-bold tracking-tight">{SITE_NAME}</p>
                    <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">{t("tagline")}</p>
                </div>
                {columns.map((column) => (
                    <div key={column.title}>
                        <h2 className="text-sm font-semibold">{column.title}</h2>
                        <ul className="mt-3 space-y-2 text-sm">
                            {column.links.map((link) => (
                                <li key={link.href}>
                                    {link.internal ? (
                                        <Link href={link.href} className="text-ink-soft hover:text-ink">
                                            {link.label}
                                        </Link>
                                    ) : (
                                        <a href={link.href} className="break-all text-ink-soft hover:text-ink">
                                            {link.label}
                                        </a>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            <div className="border-t border-line">
                <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-soft sm:px-6">
                    © {new Date().getFullYear()} {t("madeBy", { author: AUTHOR.name })}
                </p>
            </div>
        </footer>
    );
}
