import Link from "next/link";

export default function GettingStartedPage() {
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

                    <h1 className="text-4xl font-bold mb-8">Getting Started</h1>

                    <div className="prose prose-invert max-w-none">
                        <section className="mb-12">
                            <h2 className="text-2xl font-semibold mb-4">Prerequisites</h2>
                            <ul className="list-disc list-inside text-muted space-y-2">
                                <li>
                                    <a href="https://bun.sh" className="text-primary-light hover:underline">
                                        Bun
                                    </a>{" "}
                                    1.3 or later
                                </li>
                                <li>Google Chrome or Chromium-based browser</li>
                                <li>Git</li>
                            </ul>
                        </section>

                        <section className="mb-12">
                            <h2 className="text-2xl font-semibold mb-4">Installation</h2>

                            <div className="space-y-6">
                                <div className="glass rounded-xl p-6">
                                    <h3 className="font-medium mb-3">1. Clone the repository</h3>
                                    <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                        <code className="text-sm text-green-400">
                                            git clone https://github.com/isandrel/bookmark-scout.git{"\n"}
                                            cd bookmark-scout
                                        </code>
                                    </pre>
                                </div>

                                <div className="glass rounded-xl p-6">
                                    <h3 className="font-medium mb-3">2. Install dependencies</h3>
                                    <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                        <code className="text-sm text-green-400">bun install</code>
                                    </pre>
                                </div>

                                <div className="glass rounded-xl p-6">
                                    <h3 className="font-medium mb-3">3. Build the extension</h3>
                                    <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto">
                                        <code className="text-sm text-green-400">bun run build</code>
                                    </pre>
                                </div>

                                <div className="glass rounded-xl p-6">
                                    <h3 className="font-medium mb-3">4. Load in Chrome</h3>
                                    <ol className="text-muted space-y-2 list-decimal list-inside">
                                        <li>
                                            Open <code className="bg-black/50 px-2 py-1 rounded text-foreground">chrome://extensions/</code>
                                        </li>
                                        <li>Enable Developer mode (top right toggle)</li>
                                        <li>Click &quot;Load unpacked&quot;</li>
                                        <li>
                                            Select the <code className="bg-black/50 px-2 py-1 rounded text-foreground">dist</code> folder
                                        </li>
                                    </ol>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold mb-4">Development</h2>
                            <div className="glass rounded-xl p-6">
                                <p className="text-muted mb-4">
                                    Start the development server with hot reload:
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
