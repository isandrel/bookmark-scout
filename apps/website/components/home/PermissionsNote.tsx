import { PERMISSIONS_DOCS_PATH } from "@/lib/content/privacy-sections";
import { site } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";
import { inlineLinkClass } from "./rich";

/**
 * What the browser asks for at install, in one sentence, next to an install button. The quoted
 * prompt is Chrome's (and Edge's) own wording in each language.
 */
export async function PermissionsNote({
    locale,
    browser,
    className = "",
}: {
    locale: string;
    browser: string;
    className?: string;
}) {
    const t = await getTranslations("home.install");

    return (
        <p className={`max-w-[60ch] text-sm leading-relaxed text-ink-soft ${className}`}>
            {t.rich("permissions", {
                browser: site.browsers.name(browser),
                docs: (chunks: React.ReactNode) => (
                    <a href={site.docs.page(locale, PERMISSIONS_DOCS_PATH)} className={inlineLinkClass}>
                        {chunks}
                    </a>
                ),
            })}
        </p>
    );
}
