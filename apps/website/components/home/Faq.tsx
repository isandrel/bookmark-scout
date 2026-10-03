import { AI_PROVIDERS } from "@/lib/content/ai-providers";
import { FAQ_ITEMS } from "@/lib/content/faq";
import { site } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { inlineLinkClass, richTags } from "./rich";

export async function Faq({ locale }: { locale: string }) {
    const t = await getTranslations("home.faq");
    const tTour = await getTranslations("home.tour");
    const providers = new Intl.ListFormat(locale, { type: "disjunction" }).format([
        ...AI_PROVIDERS,
        tTour("ai.customProvider"),
    ]);
    // The "why not in the stores" answer only applies while no listing is live.
    const items = FAQ_ITEMS.filter((id) => id !== "stores" || !site.anyStoreLive);

    const tags = {
        ...richTags,
        privacy: (chunks: React.ReactNode) => (
            <Link href={site.url.path(locale, "/privacy")} className={inlineLinkClass}>
                {chunks}
            </Link>
        ),
        support: (chunks: React.ReactNode) => (
            <Link href={site.url.path(locale, "/support")} className={inlineLinkClass}>
                {chunks}
            </Link>
        ),
        docs: (chunks: React.ReactNode) => (
            <a href={site.docs.url()} className={inlineLinkClass}>
                {chunks}
            </a>
        ),
        github: (chunks: React.ReactNode) => (
            <a href={site.repo.issues} className={inlineLinkClass}>
                {chunks}
            </a>
        ),
        email: (chunks: React.ReactNode) => (
            <a href={site.contact.mailto("support")} className={`${inlineLinkClass} [overflow-wrap:anywhere]`}>
                {chunks}
            </a>
        ),
    };

    return (
        <section id="faq" aria-labelledby="faq-title" className="border-t border-line">
            <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
                <h2 id="faq-title" className="font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                    {t("title")}
                </h2>
                <div className="mt-10 max-w-[70ch] divide-y divide-line border-y border-line">
                    {items.map((id) => (
                        <details key={id} className="group">
                            <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                                {t(`items.${id}.q`)}
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 16 16"
                                    className="mt-1.5 size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-45"
                                >
                                    <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                </svg>
                            </summary>
                            <p className="pb-6 leading-relaxed text-ink-soft">
                                {t.rich(`items.${id}.a`, {
                                    ...tags,
                                    supportEmail: site.contact.address("support"),
                                    license: site.license.spdx,
                                    providers,
                                })}
                            </p>
                        </details>
                    ))}
                </div>
            </div>
        </section>
    );
}
