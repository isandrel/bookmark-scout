import { LongformHeader } from "@/components/longform/LongformHeader";
import { localeTextClass } from "@/components/longform/rich-text";
import { EmailChannels } from "@/components/support/EmailChannels";
import { ProblemList } from "@/components/support/ProblemList";
import { ReportBug } from "@/components/support/ReportBug";
import { StartLinks } from "@/components/support/StartLinks";
import { SupportSection } from "@/components/support/SupportSection";
import { SUPPORT_SECTIONS } from "@/lib/content/support-topics";
import { localizedPageMetadata } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ComponentType } from "react";

type PageProps = { params: Promise<{ locale: string }> };

/** The body component for each section id; order comes from SUPPORT_SECTIONS. */
const SECTION_BODIES: Record<(typeof SUPPORT_SECTIONS)[number], ComponentType<{ locale: string }>> = {
    "start-here": StartLinks,
    "common-problems": ProblemList,
    "report-a-bug": ReportBug,
    email: EmailChannels,
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "supportPage.meta" });
    return localizedPageMetadata({
        locale,
        path: "/support",
        title: t("title"),
        description: t("description"),
    });
}

export default async function SupportPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations({ locale, namespace: "supportPage" });

    return (
        <div className={`mx-auto max-w-6xl px-4 pb-24 sm:px-6 ${localeTextClass(locale)}`}>
            <LongformHeader title={t("title")} intro={t("intro")} />
            <div className="mt-2">
                {SUPPORT_SECTIONS.map((id) => {
                    const Body = SECTION_BODIES[id];
                    return (
                        <SupportSection key={id} id={id} title={t(`sections.${id}.title`)}>
                            <Body locale={locale} />
                        </SupportSection>
                    );
                })}
            </div>
        </div>
    );
}
