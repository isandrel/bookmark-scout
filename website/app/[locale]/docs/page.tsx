import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function DocsPage({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations();

    const docs = [
        {
            title: t("docs.gettingStarted.title"),
            description: t("docs.gettingStarted.description"),
            href: "getting-started",
        },
        {
            title: t("docs.features.title"),
            description: t("docs.features.description"),
            href: "features",
        },
        {
            title: t("docs.contributing.title"),
            description: t("docs.contributing.description"),
            href: "contributing",
        },
    ];

    return (
        <div className="min-h-screen bg-background">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 glass">
                <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
                    <Link href={`/${locale}`} className="flex items-center gap-3">
                        <span className="text-2xl">🔖</span>
                        <span className="font-bold text-lg">Bookmark Scout</span>
                    </Link>
                    <div className="flex items-center gap-6">
                        <Link href={`/${locale}/docs`} className="text-foreground font-medium">
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
                    </div>
                </div>
            </nav>

            <main className="pt-32 pb-24">
                <div className="mx-auto max-w-4xl px-6">
                    <h1 className="text-4xl font-bold mb-4">{t("docs.title")}</h1>
                    <p className="text-muted text-lg mb-12">{t("docs.subtitle")}</p>

                    <div className="grid gap-6">
                        {docs.map((doc) => (
                            <Link
                                key={doc.href}
                                href={`/${locale}/docs/${doc.href}`}
                                className="group p-6 rounded-2xl bg-card border border-card-border hover:border-primary/50 transition-all"
                            >
                                <h2 className="text-xl font-semibold mb-2 group-hover:text-primary-light transition-colors">
                                    {doc.title}
                                </h2>
                                <p className="text-muted">{doc.description}</p>
                            </Link>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
}
