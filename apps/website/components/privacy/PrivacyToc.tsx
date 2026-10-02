import { PRIVACY_SECTIONS } from "@/lib/content/privacy-sections";
import { getTranslations } from "next-intl/server";
import { TocLinks } from "./TocLinks";

/**
 * Table of contents. Wide screens get a sticky column beside the policy; narrow screens get a
 * collapsed disclosure above it. Both are plain anchor links.
 */
export async function PrivacyToc({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "privacyPage" });
    const label = t("tocLabel");

    const items = PRIVACY_SECTIONS.map((id) => ({ id, label: t(`sections.${id}.title`) }));
    const links = <TocLinks items={items} />;

    return (
        <>
            <details className="group mb-10 rounded-2xl border border-line bg-surface lg:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {label}
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        className="size-4 text-ink-soft transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    >
                        <path
                            d="M3 6l5 5 5-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </summary>
                <nav aria-label={label} className="border-t border-line px-5 py-4">
                    {links}
                </nav>
            </details>

            <nav aria-label={label} className="sticky top-24 hidden lg:block">
                <p className="mb-3 text-sm font-semibold">{label}</p>
                {links}
            </nav>
        </>
    );
}
