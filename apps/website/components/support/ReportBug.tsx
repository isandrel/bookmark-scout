import { REPORT_DETAILS } from "@/lib/content/support-topics";
import { site } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";

/** Where to report a bug and what to put in the report. */
export async function ReportBug({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "supportPage.sections.report-a-bug" });

    return (
        <div className="max-w-[68ch] text-[1.0625rem] leading-[1.7]">
            <p>{t("body")}</p>
            <a
                href={site.repo.newIssue}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-teal px-5 py-2.5 font-semibold text-teal-ink transition-opacity hover:opacity-90"
            >
                {t("button")}
            </a>
            <h3 className="mt-10 font-display text-xl font-semibold tracking-tight">{t("includeTitle")}</h3>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 marker:text-teal">
                {REPORT_DETAILS.map((id) => (
                    <li key={id} className="pl-1">
                        {t(`include.${id}`)}
                    </li>
                ))}
            </ul>
            <p className="mt-6 rounded-xl border border-line bg-sunken px-4 py-3 text-[0.95rem] text-ink-soft">
                {t("privacyNote")}
            </p>
        </div>
    );
}
