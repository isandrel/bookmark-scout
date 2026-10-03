import { getTranslations } from "next-intl/server";
import { AI_PROVIDERS } from "@/lib/content/ai-providers";
import { SCREENSHOT_SIZES, TOUR_TABS, type TourTab } from "@/lib/content/tour";
import { SCREENSHOT_SIZE } from "@bookmark-scout/config";
import { IMAGE_FORMATS, srcSet } from "@/lib/images";
import { Tabs, type TabItem } from "./Tabs";


function BrowserFrame({ screenshot, alt, eager }: { screenshot: TourTab["screenshot"]; alt: string; eager: boolean }) {
    return (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_24px_48px_-28px_rgb(15_33_53/0.35)]">
            <div aria-hidden="true" className="flex h-8 items-center gap-1.5 border-b border-line bg-sunken px-3">
                <span className="size-2.5 rounded-full bg-line" />
                <span className="size-2.5 rounded-full bg-line" />
                <span className="size-2.5 rounded-full bg-line" />
            </div>
            <picture>
                {IMAGE_FORMATS.map((format) => (
                    <source
                        key={`dark-${format}`}
                        type={`image/${format}`}
                        media="(prefers-color-scheme: dark)"
                        srcSet={srcSet(screenshot.dark, format)}
                        sizes={SCREENSHOT_SIZES}
                    />
                ))}
                <source srcSet={screenshot.dark} media="(prefers-color-scheme: dark)" />
                {IMAGE_FORMATS.map((format) => (
                    <source
                        key={`light-${format}`}
                        type={`image/${format}`}
                        srcSet={srcSet(screenshot.light, format)}
                        sizes={SCREENSHOT_SIZES}
                    />
                ))}
                <img
                    src={screenshot.light}
                    alt={alt}
                    width={SCREENSHOT_SIZE.width}
                    height={SCREENSHOT_SIZE.height}
                    loading={eager ? "eager" : "lazy"}
                    decoding="async"
                    className="block h-auto w-full"
                />
            </picture>
        </div>
    );
}

export async function Tour() {
    const t = await getTranslations("home.tour");

    const items: TabItem[] = TOUR_TABS.map((tab, index) => ({
        key: tab.id,
        label: t(`${tab.id}.tab`),
        panel: (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-12">
                <BrowserFrame screenshot={tab.screenshot} alt={t(`${tab.id}.alt`)} eager={index === 0} />
                <div>
                    <h3 className="font-display text-2xl font-bold tracking-tight">{t(`${tab.id}.heading`)}</h3>
                    <p className="mt-3 leading-relaxed text-ink-soft">{t(`${tab.id}.caption`)}</p>
                    <ul className="mt-6 space-y-3">
                        {(t.raw(`${tab.id}.points`) as string[]).map((point) => (
                            <li key={point} className="flex gap-3 leading-snug">
                                <span aria-hidden="true" className="mt-[0.45em] size-1.5 shrink-0 rounded-[1px] bg-teal" />
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                    {tab.listsProviders && (
                        <div className="mt-6 border-t border-line pt-5">
                            <h4 className="text-sm font-semibold">{t("ai.providersTitle")}</h4>
                            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                                {AI_PROVIDERS.map((provider) => (
                                    <li key={provider}>{provider}</li>
                                ))}
                                <li>{t("ai.customProvider")}</li>
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        ),
    }));

    return (
        <section id="features" aria-labelledby="features-title" className="border-t border-line">
            <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
                <h2 id="features-title" className="font-display text-3xl font-bold tracking-tight text-balance sm:text-5xl">
                    {t("title")}
                </h2>
                <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-ink-soft">{t("lede")}</p>
                <div className="mt-10">
                    <Tabs label={t("tabsLabel")} items={items} />
                </div>
                <p className="mt-10 max-w-[70ch] text-sm leading-relaxed text-ink-soft">{t("firefoxNote")}</p>
            </div>
        </section>
    );
}
