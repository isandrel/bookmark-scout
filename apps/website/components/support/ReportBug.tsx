import { primaryButtonClass, secondaryButtonClass } from "@/components/home/DownloadButton";
import { REPORT_DETAILS } from "@/lib/content/support-topics";
import { site } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";

/** Where to report a bug (support email first, GitHub for public reports) and what to include. */
export async function ReportBug({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "supportPage.sections.report-a-bug" });

    return (
        <div className="max-w-[68ch] text-[1.0625rem] leading-[1.7]">
            <p>{t("body", { supportEmail: site.contact.address("support") })}</p>
            <div className="mt-6 flex flex-wrap gap-3">
                <a href={site.contact.mailto("support")} className={primaryButtonClass}>
                    {t("emailButton")}
                </a>
                <a href={site.repo.newIssue} className={secondaryButtonClass}>
                    {t("button")}
                </a>
            </div>
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
