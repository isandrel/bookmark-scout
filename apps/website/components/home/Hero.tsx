import { primaryDownload } from "@/lib/download";
import { site } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";
import { ContourLines } from "./ContourLines";
import { DownloadButton, secondaryButtonClass } from "./DownloadButton";
import { PermissionsNote } from "./PermissionsNote";
import { SaveDemo } from "./SaveDemo";

export async function Hero({ locale }: { locale: string }) {
    const t = await getTranslations("home.hero");
    const tInstall = await getTranslations("home.install");
    // Straight to the first live store listing; the GitHub release only while no store lists it.
    const target = primaryDownload();
    const primary =
        target.source === "store"
            ? { href: target.href, label: tInstall("add", { browser: site.browsers.name(target.browser) }), icon: "add" as const }
            : { href: target.href, label: t("download"), icon: "download" as const };

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
                        <DownloadButton href={primary.href} label={primary.label} icon={primary.icon} />
                        <a href={site.docs.page(locale)} className={secondaryButtonClass}>
                            {t("docs")}
                        </a>
                    </div>
                    {target.source === "store" && (
                        <PermissionsNote locale={locale} browser={target.browser} className="mt-4" />
                    )}
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft sm:hidden">{tInstall("desktopOnly")}</p>
                </div>

                <div className="relative mt-12 sm:mt-14">
                    <div className="pointer-events-none absolute -inset-x-24 -bottom-16 -top-6 [mask-image:linear-gradient(to_bottom,transparent,black_25%)] sm:-inset-x-32 sm:-bottom-20">
                        <ContourLines className="size-full" />
                    </div>
                    <div className="relative">
                        <SaveDemo />
                        <p className="mt-4 max-w-[70ch] text-sm text-ink-soft">{t("demoNote")}</p>
                    </div>
                </div>
            </div>
        </section>
    );
}
