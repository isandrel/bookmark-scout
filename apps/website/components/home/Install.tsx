import { INSTALL_BROWSERS } from "@/lib/content/install";
import { downloadTarget } from "@/lib/download";
import { site } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";
import { DownloadButton, secondaryButtonClass } from "./DownloadButton";
import { richTags } from "./rich";
import { Tabs, type TabItem } from "./Tabs";

export async function Install() {
    const t = await getTranslations("home.install");

    const items: TabItem[] = INSTALL_BROWSERS.map((browser) => {
        const target = downloadTarget(browser.id);
        const storeName = t(`${browser.id}.storeName`);

        return {
            key: browser.id,
            label: t(`${browser.id}.tab`),
            panel: (
                <div className="max-w-[70ch]">
                    {target.source === "store" ? (
                        <div className="mb-8">
                            <DownloadButton href={target.href} label={t(`${browser.id}.storeButton`)} />
                            <p className="mt-4 text-ink-soft">{t("manual")}</p>
                        </div>
                    ) : (
                        <p className="mb-8 text-ink-soft">{t("storeComing", { store: storeName })}</p>
                    )}
                    <ol className="space-y-6">
                        {browser.steps.map((step, index) => (
                            <li key={step} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4">
                                <span
                                    aria-hidden="true"
                                    className="flex size-9 items-center justify-center rounded-full border-2 border-ink font-display font-bold"
                                >
                                    {index + 1}
                                </span>
                                <div className="pt-1.5 leading-relaxed">
                                    <p>{t.rich(`${browser.id}.steps.${step}`, richTags)}</p>
                                    {index === 0 && (
                                        <div className="mt-4">
                                            {target.source === "store" ? (
                                                <a href={site.repo.releasesLatest} className={secondaryButtonClass}>
                                                    {t("download")}
                                                </a>
                                            ) : (
                                                <DownloadButton href={site.repo.releasesLatest} label={t("download")} />
                                            )}
                                        </div>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                    {browser.note && (
                        <p className="mt-8 border-l-2 border-teal pl-4 leading-relaxed text-ink-soft">
                            {t.rich(`${browser.id}.${browser.note}`, richTags)}
                        </p>
                    )}
                </div>
            ),
        };
    });

    return (
        <section id="install" aria-labelledby="install-title" className="border-t border-line">
            <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
                <h2 id="install-title" className="font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                    {t("title")}
                </h2>
                <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-ink-soft">{t("lede")}</p>
                <div className="mt-10">
                    <Tabs label={t("tabsLabel")} items={items} />
                </div>
            </div>
        </section>
    );
}
