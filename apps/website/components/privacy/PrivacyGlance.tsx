import { proseTags } from "@/components/longform/rich-text";
import { PRIVACY_GLANCE, privacyLinks } from "@/lib/content/privacy-sections";
import { getTranslations } from "next-intl/server";

/** The headline facts, read before the full policy. One panel, hairline-divided. */
export async function PrivacyGlance({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "privacyPage" });
    const tags = proseTags({ links: privacyLinks(locale) });
    // An odd last fact spans both columns, so the panel has no empty cell.
    const spanLast = PRIVACY_GLANCE.length % 2 === 1;

    return (
        <section aria-labelledby="at-a-glance" className="py-10 sm:py-12">
            <h2 id="at-a-glance" className="font-display text-2xl font-semibold tracking-tight">
                {t("glanceTitle")}
            </h2>
            <ul className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
                {PRIVACY_GLANCE.map((id, index) => (
                    <li
                        key={id}
                        className={`flex gap-4 bg-surface p-5 sm:p-6 ${spanLast && index === PRIVACY_GLANCE.length - 1 ? "sm:col-span-2" : ""}`}
                    >
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            className="mt-0.5 size-5 shrink-0 text-teal"
                        >
                            <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
                            <path
                                d="M6 10.2l2.7 2.6L14 7.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                        <div>
                            <p className="font-semibold leading-snug">{t(`glance.${id}.title`)}</p>
                            <p className="mt-1.5 leading-relaxed text-ink-soft">{t.rich(`glance.${id}.body`, tags)}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
