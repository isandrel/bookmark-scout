import { getTranslations } from "next-intl/server";
import { BOUNDARY_INSIDE, BOUNDARY_OUTBOUND, PRIVACY_FACTS } from "@/lib/content/privacy-boundary";
import { site } from "@bookmark-scout/config";
import Link from "next/link";


/** Data-boundary diagram: what stays in the browser, and the only opt-in paths out. */
async function BoundaryDiagram() {
    const t = await getTranslations("home.privacy.diagram");

    return (
        <figure aria-labelledby="privacy-diagram-caption">
            <div className="grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:items-center">
                <div className="rounded-2xl border-2 border-ink bg-surface p-5 sm:p-6">
                    <p className="font-display text-xl font-bold tracking-tight">{t("browser")}</p>
                    <ul className="mt-4 space-y-3">
                        {BOUNDARY_INSIDE.map((item) => (
                            <li key={item} className="rounded-lg bg-sunken px-3.5 py-2.5">
                                <span className="block font-medium">{t(`${item}.name`)}</span>
                                <span className="block text-sm text-ink-soft">{t(`${item}.detail`)}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-1 sm:gap-5">
                    {BOUNDARY_OUTBOUND.map((item) => (
                        <li key={item} className="flex flex-col items-center sm:flex-row sm:items-center">
                            <span
                                aria-hidden="true"
                                className="h-10 w-0 border-l-2 border-dashed border-teal sm:h-0 sm:w-10 sm:shrink-0 sm:border-l-0 sm:border-t-2 lg:w-14"
                            />
                            <div className="w-full rounded-xl border border-line bg-surface px-3.5 py-3">
                                <span className="block font-medium">{t(`${item}.name`)}</span>
                                <span className="block text-sm text-ink-soft">{t(`${item}.detail`)}</span>
                            </div>
                        </li>
                    ))}
                    <li className="col-span-2 mt-3 flex sm:col-span-1 sm:mt-0">
                        <span aria-hidden="true" className="hidden sm:block sm:w-10 sm:shrink-0 lg:w-14" />
                        <div className="w-full rounded-xl border border-dashed border-line px-3.5 py-3 text-ink-soft">
                            <span className="block font-medium line-through decoration-1">{t("server.name")}</span>
                            <span className="block text-sm">{t("server.detail")}</span>
                        </div>
                    </li>
                </ul>
            </div>
            <figcaption id="privacy-diagram-caption" className="mt-5 flex items-center gap-3 text-sm text-ink-soft">
                <span aria-hidden="true" className="w-8 shrink-0 border-t-2 border-dashed border-teal" />
                {t("legend")}
            </figcaption>
        </figure>
    );
}

export async function PrivacyBoundary({ locale }: { locale: string }) {
    const t = await getTranslations("home.privacy");

    return (
        <section id="privacy" aria-labelledby="privacy-title" className="border-t border-line bg-sunken">
            <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
                <h2 id="privacy-title" className="max-w-[20ch] font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                    {t("title")}
                </h2>
                <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-16">
                    <BoundaryDiagram />
                    <div>
                        <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
                            {PRIVACY_FACTS.map((fact) => (
                                <div key={fact}>
                                    <dt className="font-semibold">{t(`facts.${fact}.title`)}</dt>
                                    <dd className="mt-1 max-w-[60ch] leading-relaxed text-ink-soft">{t(`facts.${fact}.body`)}</dd>
                                </div>
                            ))}
                        </dl>
                        <Link
                            href={site.url.path(locale, "/privacy")}
                            className="mt-8 inline-block font-semibold text-teal underline decoration-2 underline-offset-4 hover:decoration-teal/40"
                        >
                            {t("policyLink")}
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
