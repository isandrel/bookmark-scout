import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default async function ContributingPage({
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
                        <span className="font-bold text-lg">Bookmark Scout</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/${locale}/docs`}
                            className="text-muted hover:text-foreground transition-colors"
                        >
                            {t("nav.docs")}
                        </Link>
                        <a
                            href="https://github.com/isandrel/bookmark-scout"
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

                    <h1 className="text-4xl font-bold mb-4">{t("contributingPage.title")}</h1>
                    <p className="text-muted text-lg mb-12">{t("contributingPage.subtitle")}</p>

                    <div className="space-y-8">
                        <section className="glass rounded-2xl p-6">
                            <h2 className="text-2xl font-semibold mb-4">{t("contributingPage.howTo.title")}</h2>
                            <ol className="list-decimal list-inside text-muted space-y-3">
                                <li>{t("contributingPage.howTo.step1")}</li>
                                <li>
                                    {t("contributingPage.howTo.step2")}{" "}
                                    <code className="bg-black/50 px-2 py-1 rounded text-green-400">
                                        git checkout -b feature/amazing-feature
                                    </code>
                                </li>
                                <li>
                                    {t("contributingPage.howTo.step3")}{" "}
                                    <code className="bg-black/50 px-2 py-1 rounded text-green-400">
                                        git commit -m &apos;feat: add amazing feature&apos;
                                    </code>
                                </li>
                                <li>
                                    {t("contributingPage.howTo.step4")}{" "}
                                    <code className="bg-black/50 px-2 py-1 rounded text-green-400">
                                        git push origin feature/amazing-feature
                                    </code>
                                </li>
                                <li>{t("contributingPage.howTo.step5")}</li>
                            </ol>
                        </section>

                        <section className="glass rounded-2xl p-6">
                            <h2 className="text-2xl font-semibold mb-4">{t("contributingPage.commits.title")}</h2>
                            <p className="text-muted mb-4">
                                {t("contributingPage.commits.description")}
                            </p>
                            <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                <code className="text-sm text-green-400">
                                    &lt;type&gt;(&lt;scope&gt;): &lt;description&gt;
                                </code>
                            </pre>
                            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-foreground font-medium">feat</span>
                                    <span className="text-muted"> - {t("contributingPage.commits.feat")}</span>
                                </div>
                                <div>
                                    <span className="text-foreground font-medium">fix</span>
                                    <span className="text-muted"> - {t("contributingPage.commits.fix")}</span>
                                </div>
                                <div>
                                    <span className="text-foreground font-medium">docs</span>
                                    <span className="text-muted"> - {t("contributingPage.commits.docs")}</span>
                                </div>
                                <div>
                                    <span className="text-foreground font-medium">refactor</span>
                                    <span className="text-muted"> - {t("contributingPage.commits.refactor")}</span>
                                </div>
                                <div>
                                    <span className="text-foreground font-medium">test</span>
                                    <span className="text-muted"> - {t("contributingPage.commits.test")}</span>
                                </div>
                                <div>
                                    <span className="text-foreground font-medium">chore</span>
                                    <span className="text-muted"> - {t("contributingPage.commits.chore")}</span>
                                </div>
                            </div>
                        </section>

                        <section className="glass rounded-2xl p-6">
                            <h2 className="text-2xl font-semibold mb-4">{t("contributingPage.setup.title")}</h2>
                            <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                <code className="text-sm text-green-400">
                                    # Clone your fork{"\n"}
                                    git clone https://github.com/YOUR_USERNAME/bookmark-scout.git
                                    {"\n"}
                                    cd bookmark-scout{"\n\n"}
                                    # Install dependencies{"\n"}
                                    bun install{"\n\n"}
                                    # Start dev server{"\n"}
                                    bun run dev{"\n\n"}
                                    # Run linter{"\n"}
                                    bun run lint{"\n\n"}
                                    # Format code{"\n"}
                                    bun run format
                                </code>
                            </pre>
                        </section>

                        <section className="glass rounded-2xl p-6">
                            <h2 className="text-2xl font-semibold mb-4">{t("contributingPage.codeStyle.title")}</h2>
                            <ul className="list-disc list-inside text-muted space-y-2">
                                <li>{t("contributingPage.codeStyle.biome")}</li>
                                <li>{t("contributingPage.codeStyle.check")}</li>
                                <li>{t("contributingPage.codeStyle.strict")}</li>
                                <li>{t("contributingPage.codeStyle.functional")}</li>
                            </ul>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}
