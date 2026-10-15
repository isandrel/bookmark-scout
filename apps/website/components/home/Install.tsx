import { INSTALL_BROWSERS, LIVE_STORE_BROWSERS, UPCOMING_STORE_BROWSERS } from "@/lib/content/install";
import { site } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";
import { DownloadButton, secondaryButtonClass } from "./DownloadButton";
import { PermissionsNote } from "./PermissionsNote";
import { richTags } from "./rich";
import { Tabs, type TabItem } from "./Tabs";

/**
 * Install section: a store button for each browser with a live listing, "coming soon" for the
 * others, and the GitHub steps folded under "Advanced", open only while no store lists it.
 */
export async function Install({ locale }: { locale: string }) {
    const t = await getTranslations("home.install");
    const anyLive = LIVE_STORE_BROWSERS.length > 0;

    const manualTabs: TabItem[] = INSTALL_BROWSERS.map((browser) => ({
        key: browser.id,
        label: site.browsers.name(browser.id),
        panel: (
            <div className="max-w-[70ch]">
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
                                        {anyLive ? (
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
    }));

    return (
        <section id="install" aria-labelledby="install-title" className="border-t border-line">
            <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
                <h2 id="install-title" className="font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                    {t("title")}
                </h2>
                <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-ink-soft">{t("lede")}</p>
                <p className="mt-2 max-w-[60ch] leading-relaxed text-ink-soft">{t("desktopOnly")}</p>

                {anyLive && (
                    <div className="mt-10">
                        <div className="flex flex-wrap gap-3">
                            {LIVE_STORE_BROWSERS.map((browser) => (
                                <DownloadButton
                                    key={browser.id}
                                    href={site.store(browser.id).url}
                                    label={t("add", { browser: site.browsers.name(browser.id) })}
                                    icon="add"
                                />
                            ))}
                        </div>
                        <PermissionsNote locale={locale} browser={LIVE_STORE_BROWSERS[0].id} className="mt-4" />
                    </div>
                )}

                {UPCOMING_STORE_BROWSERS.length > 0 && (
                    <ul className="mt-8 max-w-[60ch] space-y-2 leading-relaxed">
                        {UPCOMING_STORE_BROWSERS.map((browser) => (
                            <li key={browser.id} className="flex gap-3">
                                <span aria-hidden="true" className="mt-[0.6em] size-1.5 shrink-0 rounded-[1px] bg-teal" />
                                <span>
                                    {t.rich("comingSoon", {
                                        ...richTags,
                                        browser: site.browsers.name(browser.id),
                                        store: t(`${browser.id}.storeName`),
                                    })}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                <details
                    id="install-by-hand"
                    open={!anyLive}
                    className="group mt-10 rounded-2xl border border-line bg-surface"
                >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-5 py-4 font-semibold sm:px-6 [&::-webkit-details-marker]:hidden">
                        {t("advanced")}
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 16 16"
                            className="size-4 shrink-0 text-ink-soft transition-transform group-open:rotate-45"
                        >
                            <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </summary>
                    <div className="border-t border-line px-5 pb-8 pt-6 sm:px-6">
                        <p className="max-w-[60ch] leading-relaxed text-ink-soft">{t("advancedLede")}</p>
                        <div className="mt-8">
                            <Tabs label={t("tabsLabel")} items={manualTabs} />
                        </div>
                    </div>
                </details>
            </div>
        </section>
    );
}
