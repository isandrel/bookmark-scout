import { CONTACT_ROLES } from "@/lib/content/support-topics";
import { PUBLIC_PATHS, site } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

type FooterLink = { href: string; label: string; internal?: boolean };

export async function SiteFooter({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "footer" });
    const columns: { title: string; links: FooterLink[] }[] = [
        {
            title: t("product"),
            links: [
                { href: site.url.path(locale, "", "features"), label: t("features"), internal: true },
                { href: site.url.path(locale, "", "install"), label: t("install"), internal: true },
                { href: site.docs.url(), label: t("docs") },
                { href: site.repo.releases, label: t("releases") },
            ],
        },
        {
            title: t("project"),
            links: [
                { href: site.repo.url(), label: t("github") },
                { href: site.docs.url("/contributing"), label: t("contributing") },
                { href: site.license.fileUrl, label: t("license", { license: site.license.spdx }) },
            ],
        },
        {
            title: t("contact"),
            links: [
                { href: site.url.path(locale, "/support"), label: t("helpCenter"), internal: true },
                ...CONTACT_ROLES.map((role) => ({
                    href: site.contact.mailto(role),
                    label: t("contactAddress", { role: t(role), address: site.contact.address(role) }),
                })),
            ],
        },
        {
            title: t("legal"),
            links: [
                { href: site.url.path(locale, "/privacy"), label: t("privacyPolicy"), internal: true },
                { href: PUBLIC_PATHS.securityTxt, label: t("securityTxt") },
            ],
        },
    ];

    return (
        <footer className="border-t border-line bg-sunken">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.8fr_0.9fr_1.5fr_0.8fr]">
                <div>
                    <p className="font-display text-xl font-bold tracking-tight">{site.name}</p>
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
                                        <a href={link.href} className="break-words text-ink-soft hover:text-ink">
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
                    © {new Date().getFullYear()} {t("madeBy", { author: site.author.name })}
                </p>
            </div>
        </footer>
    );
}
