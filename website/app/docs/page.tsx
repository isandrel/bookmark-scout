import Link from "next/link";

const docs = [
    {
        title: "Getting Started",
        description: "Learn how to install and set up Bookmark Scout",
        href: "/docs/getting-started",
    },
    {
        title: "Features",
        description: "Explore all the features and capabilities",
        href: "/docs/features",
    },
    {
        title: "Contributing",
        description: "How to contribute to the project",
        href: "/docs/contributing",
    },
];

export default function DocsPage() {
    return (
        <div className="min-h-screen bg-background">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 glass">
                <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <span className="text-2xl">🔖</span>
                        <span className="font-bold text-lg">Bookmark Scout</span>
                    </Link>
                    <div className="flex items-center gap-6">
                        <Link
                            href="/docs"
                            className="text-foreground font-medium"
                        >
                            Docs
                        </Link>
                        <a
                            href="https://github.com/isandrel/bookmark-scout"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition-colors"
                        >
                            GitHub
                        </a>
                    </div>
                </div>
            </nav>

            <main className="pt-32 pb-24">
                <div className="mx-auto max-w-4xl px-6">
                    <h1 className="text-4xl font-bold mb-4">Documentation</h1>
                    <p className="text-muted text-lg mb-12">
                        Everything you need to know about Bookmark Scout
                    </p>

                    <div className="grid gap-6">
                        {docs.map((doc) => (
                            <Link
                                key={doc.href}
                                href={doc.href}
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
