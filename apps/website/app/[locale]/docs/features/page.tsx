import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SITE_NAME, GITHUB_URL } from "@bookmark-scout/config";

export default async function FeaturesPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations();

    const features = [
        {
            icon: "🔍",
            title: t("featuresPage.instantSearch.title"),
            description: t("featuresPage.instantSearch.description"),
        },
        {
            icon: "📂",
            title: t("featuresPage.dragAndDrop.title"),
            description: t("featuresPage.dragAndDrop.description"),
        },
        {
            icon: "⚡",
            title: t("featuresPage.quickAdd.title"),
            description: t("featuresPage.quickAdd.description"),
        },
        {
            icon: "📱",
            title: t("featuresPage.sidePanel.title"),
            description: t("featuresPage.sidePanel.description"),
        },
        {
            icon: "🌙",
            title: t("featuresPage.darkMode.title"),
            description: t("featuresPage.darkMode.description"),
        },
        {
            icon: "🎯",
            title: t("featuresPage.expandCollapse.title"),
            description: t("featuresPage.expandCollapse.description"),
        },
        {
            icon: "📁",
            title: t("featuresPage.createFolders.title"),
            description: t("featuresPage.createFolders.description"),
        },
        {
            icon: "🗑️",
            title: t("featuresPage.deleteItems.title"),
            description: t("featuresPage.deleteItems.description"),
        },
    ];

    return (
        <div className="min-h-screen bg-background">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 glass">
                <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
                    <Link href={`/${locale}`} className="flex items-center gap-3">
                        <span className="text-2xl">🔖</span>
                        <span className="font-bold text-lg">{SITE_NAME}</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/${locale}/docs`}
                            className="text-muted hover:text-foreground transition-colors"
                        >
                            {t("nav.docs")}
                        </Link>
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition-colors"
                        >
                            {t("nav.github")}
                        </a>
                        <LanguageSwitcher currentLocale={locale} />
                    </div>
                </div>
            </nav>

            <main className="pt-32 pb-24">
                <div className="mx-auto max-w-4xl px-6">
                    <div className="mb-8">
                        <Link
                            href={`/${locale}/docs`}
                            className="text-muted hover:text-foreground transition-colors text-sm"
                        >
                            {t("nav.backToDocs")}
                        </Link>
                    </div>

                    <h1 className="text-4xl font-bold mb-4">{t("featuresPage.title")}</h1>
                    <p className="text-muted text-lg mb-12">{t("featuresPage.subtitle")}</p>

                    <div className="space-y-8">
                        {features.map((feature) => (
                            <div key={feature.title} className="glass rounded-2xl p-6">
                                <div className="flex items-start gap-4">
                                    <span className="text-3xl">{feature.icon}</span>
                                    <div>
                                        <h2 className="text-xl font-semibold mb-2">
                                            {feature.title}
                                        </h2>
                                        <p className="text-muted">{feature.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <section className="mt-16">
                        <h2 className="text-2xl font-bold mb-6">{t("featuresPage.roadmap.title")}</h2>
                        <div className="glass rounded-2xl p-6">
                            <ul className="space-y-3 text-muted">
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    {t("featuresPage.roadmap.fullManager")}
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    {t("featuresPage.roadmap.options")}
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    {t("featuresPage.roadmap.tags")}
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    {t("featuresPage.roadmap.duplicates")}
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    {t("featuresPage.roadmap.deadLinks")}
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    {t("featuresPage.roadmap.shortcuts")}
                                </li>
                            </ul>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
