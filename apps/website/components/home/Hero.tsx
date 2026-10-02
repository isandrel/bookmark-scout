import { DOCS_URL } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";
import { ContourLines } from "./ContourLines";
import { ANY_STORE_LIVE } from "@/lib/download";
import { RELEASES_URL } from "@bookmark-scout/config";
import { DownloadButton, secondaryButtonClass } from "./DownloadButton";
import { SearchDemo } from "./SearchDemo";

export async function Hero({ locale }: { locale: string }) {
    const t = await getTranslations("home.hero");
    // With a live store listing, send visitors to the per-browser install tabs instead.
    const primary = ANY_STORE_LIVE
        ? { href: `/${locale}/#install`, label: t("install") }
        : { href: RELEASES_URL, label: t("download") };

    return (
        <section aria-labelledby="hero-title" className="overflow-hidden">
            <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pb-28 sm:pt-16">
                <div className="max-w-3xl">
                    <h1
                        id="hero-title"
                        className="font-display text-[2.5rem] font-bold leading-[1.04] tracking-[-0.03em] text-balance sm:text-6xl lg:text-7xl"
                    >
                        {t("title")}
                    </h1>
                    <p className="mt-6 max-w-[58ch] text-lg leading-relaxed text-ink-soft sm:text-xl">
                        {t("description")}
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <DownloadButton href={primary.href} label={primary.label} />
                        <a href={DOCS_URL} className={secondaryButtonClass}>
                            {t("docs")}
                        </a>
                    </div>
                    <p className="mt-4 text-sm text-ink-soft">{t("license")}</p>
                </div>

                <div className="relative mt-12 sm:mt-14">
                    <div className="pointer-events-none absolute -inset-x-24 -bottom-16 -top-6 [mask-image:linear-gradient(to_bottom,transparent,black_25%)] sm:-inset-x-32 sm:-bottom-20">
                        <ContourLines className="size-full" />
                    </div>
                    <div className="relative">
                        <SearchDemo />
                        <p className="mt-4 max-w-[70ch] text-sm text-ink-soft">{t("demoNote")}</p>
                    </div>
                </div>
            </div>
        </section>
    );
}
