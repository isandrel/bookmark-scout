import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SITE_NAME, GITHUB_URL, AUTHOR, DOCS_URL } from "@bookmark-scout/config";

// Tech stack badges
const techStack = [
    { name: "React 19", color: "#61DAFB", logo: "react" },
    { name: "TypeScript", color: "#3178C6", logo: "typescript" },
    { name: "WXT", color: "#646CFF", logo: "vite" },
    { name: "Rolldown-Vite", color: "#646CFF", logo: "vite" },
    { name: "TailwindCSS 4", color: "#06B6D4", logo: "tailwindcss" },
    { name: "Zustand", color: "#764ABC", logo: "redux" },
    { name: "Nx", color: "#143055", logo: "nx" },
    { name: "Bun", color: "#000000", logo: "bun" },
];

export default async function Home({
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
            title: t("features.instantSearch.title"),
            description: t("features.instantSearch.description"),
        },
        {
            icon: "📂",
            title: t("features.dragAndDrop.title"),
            description: t("features.dragAndDrop.description"),
        },
        {
            icon: "⚡",
            title: t("features.quickAdd.title"),
            description: t("features.quickAdd.description"),
        },
        {
            icon: "📱",
            title: t("features.sidePanel.title"),
            description: t("features.sidePanel.description"),
        },
        {
            icon: "🌙",
            title: t("features.darkMode.title"),
            description: t("features.darkMode.description"),
        },
        {
            icon: "🎯",
            title: t("features.expandCollapse.title"),
            description: t("features.expandCollapse.description"),
        },
    ];

    return (
        <div className="min-h-screen bg-background">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 glass">
                <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/icon.png" alt="Bookmark Scout" className="w-8 h-8" />
                        <span className="font-bold text-lg">{SITE_NAME}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link
                            href={DOCS_URL}
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
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                            {t("nav.github")}
                        </a>
                        <LanguageSwitcher currentLocale={locale} />
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-24 overflow-hidden">
                {/* Background gradient */}
                <div className="absolute inset-0 bg-linear-to-br from-primary/20 via-background to-accent/20 animate-gradient" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

                <div className="relative mx-auto max-w-6xl px-6 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2 mb-8">
                        <span className="text-sm text-muted">{t("hero.badge")}</span>
                        <span className="text-xs bg-primary/20 text-primary-light px-2 py-0.5 rounded-full">
                            {t("hero.manifestV3")}
                        </span>
                    </div>

                    <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6">
                        <span className="bg-linear-to-r from-white via-primary-light to-accent bg-clip-text text-transparent">
                            {t("hero.title")}
                        </span>
                    </h1>

                    <p className="text-xl text-muted max-w-2xl mx-auto mb-12">
                        {t("hero.description")}
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <a
                            href="https://github.com/isandrel/bookmark-scout"
                            className="group flex items-center gap-2 rounded-full bg-linear-to-r from-primary to-accent px-8 py-4 font-medium text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
                        >
                            <svg
                                className="w-5 h-5"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                            {t("hero.viewOnGitHub")}
                            <svg
                                className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5l7 7-7 7"
                                />
                            </svg>
                        </a>
                        <Link
                            href={DOCS_URL}
                            className="rounded-full border border-white/20 px-8 py-4 font-medium hover:bg-white/5 transition-colors"
                        >
                            {t("hero.documentation")}
                        </Link>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-24 border-t border-white/5">
                <div className="mx-auto max-w-6xl px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                            {t("features.title")}
                        </h2>
                        <p className="text-muted text-lg">{t("features.subtitle")}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature) => (
                            <div
                                key={feature.title}
                                className="group p-6 rounded-2xl bg-card border border-card-border hover:border-primary/50 hover:glow transition-all duration-300"
                            >
                                <div className="text-4xl mb-4">{feature.icon}</div>
                                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                                <p className="text-muted">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Tech Stack Section */}
            <section className="py-24 border-t border-white/5">
                <div className="mx-auto max-w-6xl px-6 text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                        {t("techStack.title")}
                    </h2>
                    <p className="text-muted text-lg mb-12">{t("techStack.subtitle")}</p>

                    <div className="flex flex-wrap items-center justify-center gap-4">
                        {techStack.map((tech) => (
                            <div
                                key={tech.name}
                                className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2"
                            >
                                <img
                                    src={`https://img.shields.io/badge/-${tech.name.replace(/ /g, "_")}-${tech.color.replace("#", "")}?style=flat-square&logo=${tech.logo}&logoColor=white`}
                                    alt={tech.name}
                                    className="h-5"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Installation Section */}
            <section className="py-24 border-t border-white/5">
                <div className="mx-auto max-w-4xl px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                            {t("installation.title")}
                        </h2>
                        <p className="text-muted text-lg">{t("installation.subtitle")}</p>
                    </div>

                    <div className="space-y-6">
                        <div className="glass rounded-2xl p-6">
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-primary/20 text-primary-light flex items-center justify-center text-sm">
                                    1
                                </span>
                                {t("installation.step1.title")}
                            </h3>
                            <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                <code className="text-sm text-green-400">
                                    git clone {GITHUB_URL}.git{"\n"}
                                    cd bookmark-scout
                                </code>
                            </pre>
                        </div>

                        <div className="glass rounded-2xl p-6">
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-primary/20 text-primary-light flex items-center justify-center text-sm">
                                    2
                                </span>
                                {t("installation.step2.title")}
                            </h3>
                            <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                <code className="text-sm text-green-400">
                                    bun install{"\n"}
                                    bun run build
                                </code>
                            </pre>
                        </div>

                        <div className="glass rounded-2xl p-6">
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-primary/20 text-primary-light flex items-center justify-center text-sm">
                                    3
                                </span>
                                {t("installation.step3.title")}
                            </h3>
                            <ol className="text-muted space-y-2 ml-10">
                                <li>
                                    1. <code className="text-foreground">{t("installation.step3.instructions.1")}</code>
                                </li>
                                <li>2. {t("installation.step3.instructions.2")}</li>
                                <li>3. {t("installation.step3.instructions.3")}</li>
                                <li>
                                    4. <code className="text-foreground">{t("installation.step3.instructions.4")}</code>
                                </li>
                            </ol>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-white/5">
                <div className="mx-auto max-w-6xl px-6 text-center">
                    <p className="text-muted">
                        {t("footer.madeWith")}{" "}
                        <a
                            href={AUTHOR.url}
                            className="text-foreground hover:text-primary-light transition-colors"
                        >
                            {AUTHOR.name}
                        </a>
                    </p>
                    <p className="text-sm text-muted/60 mt-2">{t("footer.license")}</p>
                </div>
            </footer>
        </div>
    );
}
