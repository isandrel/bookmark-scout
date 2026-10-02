import { proseTags } from "@/components/longform/rich-text";
import { SUPPORT_PROBLEMS } from "@/lib/content/support-topics";
import { getTranslations } from "next-intl/server";

/** Troubleshooting answers as native disclosures, so they work without JavaScript. */
export async function ProblemList({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "supportPage.sections.common-problems.items" });
    const tags = proseTags({});

    return (
        <div className="max-w-[68ch] divide-y divide-line border-y border-line">
            {SUPPORT_PROBLEMS.map((id) => {
                const paragraphs = t.raw(`${id}.a`) as string[];
                return (
                    <details key={id} id={id} className="group">
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 font-semibold leading-snug [&::-webkit-details-marker]:hidden">
                            {t(`${id}.q`)}
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 16 16"
                                className="mt-0.5 size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-45 motion-reduce:transition-none"
                            >
                                <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                        </summary>
                        <div className="space-y-3 pb-5 leading-[1.7] text-ink-soft">
                            {paragraphs.map((_, index) => (
                                <p key={index}>{t.rich(`${id}.a.${index}`, tags)}</p>
                            ))}
                        </div>
                    </details>
                );
            })}
        </div>
    );
}
