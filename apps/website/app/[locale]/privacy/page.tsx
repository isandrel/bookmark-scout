import { LongformHeader } from "@/components/longform/LongformHeader";
import { ProseBlocks, type ProseBlock } from "@/components/longform/ProseBlocks";
import { localeTextClass, proseTags } from "@/components/longform/rich-text";
import { PrivacyGlance } from "@/components/privacy/PrivacyGlance";
import { PrivacyToc } from "@/components/privacy/PrivacyToc";
import { PRIVACY_EMAILS, PRIVACY_LINKS, PRIVACY_SECTIONS } from "@/lib/content/privacy-sections";
import { localizedPageMetadata } from "@/lib/page-metadata";
import { site } from "@bookmark-scout/config";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

type PageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "privacyPage.meta" });
    return localizedPageMetadata({
        locale,
        path: "/privacy",
        title: t("title"),
        description: t("description"),
    });
}

export default async function PrivacyPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations({ locale, namespace: "privacyPage" });

    // The config date is a calendar date; format it in UTC so no time zone shifts the day.
    const effectiveDate = new Date(`${site.legal.privacyEffectiveDate}T00:00:00Z`);
    const formattedDate = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
        effectiveDate,
    );
    const tags = proseTags({
        links: PRIVACY_LINKS,
        emails: PRIVACY_EMAILS,
        values: { licenseName: site.license.spdx },
    });

    return (
        <div className={`mx-auto max-w-6xl px-4 pb-24 sm:px-6 ${localeTextClass(locale)}`}>
            <LongformHeader
                title={t("title")}
                meta={
                    <time dateTime={site.legal.privacyEffectiveDate}>{t("effective", { date: formattedDate })}</time>
                }
                intro={t("intro")}
                note={t("translationNote")}
            />

            <PrivacyGlance locale={locale} />

            <div className="border-t border-line pt-10 sm:pt-12 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
                <div>
                    <PrivacyToc locale={locale} />
                </div>

                <article className="space-y-14">
                    {PRIVACY_SECTIONS.map((id) => {
                        const blocks = t.raw(`sections.${id}.blocks`) as ProseBlock[];
                        return (
                            <section key={id} id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
                                <h2
                                    id={`${id}-title`}
                                    className="mb-5 font-display text-2xl font-semibold tracking-tight sm:text-[1.75rem]"
                                >
                                    {t(`sections.${id}.title`)}
                                </h2>
                                <ProseBlocks
                                    blocks={blocks}
                                    basePath={`sections.${id}.blocks`}
                                    render={(path) => t.rich(path, tags)}
                                />
                            </section>
                        );
                    })}
                </article>
            </div>
        </div>
    );
}
