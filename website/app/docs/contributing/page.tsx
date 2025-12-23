import Link from "next/link";

export default function ContributingPage() {
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
                        <Link href="/docs" className="text-muted hover:text-foreground transition-colors">
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
                    <div className="mb-8">
                        <Link href="/docs" className="text-muted hover:text-foreground transition-colors text-sm">
                            ← Back to Docs
                        </Link>
                    </div>

                    <h1 className="text-4xl font-bold mb-4">Contributing</h1>
                    <p className="text-muted text-lg mb-12">
                        We welcome contributions! Here&apos;s how to get started.
                    </p>

                    <div className="space-y-8">
                        <section className="glass rounded-2xl p-6">
                            <h2 className="text-2xl font-semibold mb-4">How to Contribute</h2>
                            <ol className="list-decimal list-inside text-muted space-y-3">
                                <li>Fork the repository</li>
                                <li>
                                    Create your feature branch:{" "}
                                    <code className="bg-black/50 px-2 py-1 rounded text-green-400">
                                        git checkout -b feature/amazing-feature
                                    </code>
                                </li>
                                <li>
                                    Commit your changes:{" "}
                                    <code className="bg-black/50 px-2 py-1 rounded text-green-400">
                                        git commit -m &apos;feat: add amazing feature&apos;
                                    </code>
                                </li>
                                <li>
                                    Push to the branch:{" "}
                                    <code className="bg-black/50 px-2 py-1 rounded text-green-400">
                                        git push origin feature/amazing-feature
                                    </code>
                                </li>
                                <li>Open a Pull Request</li>
                            </ol>
                        </section>

                        <section className="glass rounded-2xl p-6">
                            <h2 className="text-2xl font-semibold mb-4">Commit Convention</h2>
                            <p className="text-muted mb-4">
                                We use{" "}
                                <a
                                    href="https://www.conventionalcommits.org/"
                                    className="text-primary-light hover:underline"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Conventional Commits
                                </a>
                                . Format your commits as:
                            </p>
                            <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                <code className="text-sm text-green-400">
                                    &lt;type&gt;(&lt;scope&gt;): &lt;description&gt;
                                </code>
                            </pre>
                            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-foreground font-medium">feat</span>
                                    <span className="text-muted"> - New feature</span>
                                </div>
                                <div>
                                    <span className="text-foreground font-medium">fix</span>
                                    <span className="text-muted"> - Bug fix</span>
                                </div>
                                <div>
                                    <span className="text-foreground font-medium">docs</span>
                                    <span className="text-muted"> - Documentation</span>
                                </div>
                                <div>
                                    <span className="text-foreground font-medium">refactor</span>
                                    <span className="text-muted"> - Code refactoring</span>
                                </div>
                                <div>
                                    <span className="text-foreground font-medium">test</span>
                                    <span className="text-muted"> - Tests</span>
                                </div>
                                <div>
                                    <span className="text-foreground font-medium">chore</span>
                                    <span className="text-muted"> - Maintenance</span>
                                </div>
                            </div>
                        </section>

                        <section className="glass rounded-2xl p-6">
                            <h2 className="text-2xl font-semibold mb-4">Development Setup</h2>
                            <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                <code className="text-sm text-green-400">
                                    # Clone your fork{"\n"}
                                    git clone https://github.com/YOUR_USERNAME/bookmark-scout.git{"\n"}
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
                            <h2 className="text-2xl font-semibold mb-4">Code Style</h2>
                            <ul className="list-disc list-inside text-muted space-y-2">
                                <li>We use Biome for linting and formatting</li>
                                <li>Run <code className="bg-black/50 px-2 py-1 rounded text-foreground">bun run check</code> before committing</li>
                                <li>TypeScript strict mode is enabled</li>
                                <li>Components use functional style with hooks</li>
                            </ul>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}
