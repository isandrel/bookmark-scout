import { SUPPORT_START } from "@/lib/content/support-topics";
import { getTranslations } from "next-intl/server";

/** Docs and FAQ, the two places most questions are already answered. */
export async function StartLinks({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "supportPage.sections.start-here.items" });

    return (
        <ul className="grid max-w-[68ch] gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
            {SUPPORT_START.map((item) => (
                <li key={item.id} className="bg-surface">
                    <a
                        href={item.href(locale)}
                        className="group flex h-full flex-col gap-1.5 p-5 transition-colors hover:bg-sunken sm:p-6"
                    >
                        <span className="flex items-center justify-between gap-3 font-semibold">
                            {t(`${item.id}.title`)}
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 16 16"
                                className="size-4 shrink-0 text-teal transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                            >
                                <path
                                    d="M3 8h9M8.5 4.5L12 8l-3.5 3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </span>
                        <span className="leading-relaxed text-ink-soft">{t(`${item.id}.body`)}</span>
                    </a>
                </li>
            ))}
        </ul>
    );
}
