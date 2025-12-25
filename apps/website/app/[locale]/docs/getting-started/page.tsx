import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SITE_NAME, GITHUB_URL } from "@bookmark-scout/config";

export default async function GettingStartedPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations();

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

                    <h1 className="text-4xl font-bold mb-8">{t("gettingStarted.title")}</h1>

                    <div className="prose prose-invert max-w-none">
                        <section className="mb-12">
                            <h2 className="text-2xl font-semibold mb-4">{t("gettingStarted.prerequisites.title")}</h2>
                            <ul className="list-disc list-inside text-muted space-y-2">
                                <li>
                                    <a
                                        href="https://bun.sh"
                                        className="text-primary-light hover:underline"
                                    >
                                        Bun
                                    </a>{" "}
                                    {t("gettingStarted.prerequisites.bun")}
                                </li>
                                <li>{t("gettingStarted.prerequisites.chrome")}</li>
                                <li>{t("gettingStarted.prerequisites.git")}</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-semibold mb-4">{t("gettingStarted.installation.title")}</h2>

                            <div className="space-y-6">
                                <div className="glass rounded-xl p-6">
                                    <h3 className="font-medium mb-3">1. {t("gettingStarted.installation.step1")}</h3>
                                    <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                        <code className="text-sm text-green-400">
                                            git clone {GITHUB_URL}.git
                                            {"\n"}
                                            cd bookmark-scout
                                        </code>
                                    </pre>
                                </div>

                                <div className="glass rounded-xl p-6">
                                    <h3 className="font-medium mb-3">2. {t("gettingStarted.installation.step2")}</h3>
                                    <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                        <code className="text-sm text-green-400">bun install</code>
                                    </pre>
                                </div>

                                <div className="glass rounded-xl p-6">
                                    <h3 className="font-medium mb-3">3. {t("gettingStarted.installation.step3")}</h3>
                                    <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                        <code className="text-sm text-green-400">bun run build</code>
                                    </pre>
                                </div>

                                <div className="glass rounded-xl p-6">
                                    <h3 className="font-medium mb-3">4. {t("gettingStarted.installation.step4.title")}</h3>
                                    <ol className="text-muted space-y-2 list-decimal list-inside">
                                        <li>{t("gettingStarted.installation.step4.1")}</li>
                                        <li>{t("gettingStarted.installation.step4.2")}</li>
                                        <li>{t("gettingStarted.installation.step4.3")}</li>
                                        <li>{t("gettingStarted.installation.step4.4")}</li>
                                    </ol>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold mb-4">{t("gettingStarted.development.title")}</h2>
                            <div className="glass rounded-xl p-6">
                                <p className="text-muted mb-4">
                                    {t("gettingStarted.development.description")}
                                </p>
                                <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                    <code className="text-sm text-green-400">bun run dev</code>
                                </pre>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}
