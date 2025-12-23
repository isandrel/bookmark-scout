import Link from "next/link";

const features = [
    {
        icon: "🔍",
        title: "Instant Search",
        description:
            "Quickly find any bookmark with our lightning-fast search. Features debounced input for performance and folder filtering to narrow down results.",
    },
    {
        icon: "📂",
        title: "Drag & Drop Organization",
        description:
            "Reorganize your bookmarks with intuitive drag-and-drop. Move bookmarks between folders or reorder within a folder with ease.",
    },
    {
        icon: "⚡",
        title: "Quick Add",
        description:
            "Save the current tab to any folder with just one click. No more navigating through nested menus - just pick a folder and done!",
    },
    {
        icon: "📱",
        title: "Side Panel",
        description:
            "Access your bookmarks directly from Chrome's side panel without leaving your current page. Perfect for research and reference work.",
    },
    {
        icon: "🌙",
        title: "Beautiful Dark Mode",
        description:
            "A stunning dark theme that's easy on the eyes. Features smooth transitions and carefully chosen colors for optimal readability.",
    },
    {
        icon: "🎯",
        title: "Expand/Collapse All",
        description:
            "Quickly expand or collapse all nested folders with a single click. Great for getting an overview or focusing on specific sections.",
    },
    {
        icon: "📁",
        title: "Create Folders",
        description:
            "Create new bookmark folders directly from the popup. Keep your bookmarks organized without opening the bookmark manager.",
    },
    {
        icon: "🗑️",
        title: "Delete Items",
        description:
            "Remove unwanted bookmarks and folders with confirmation dialogs to prevent accidental deletions.",
    },
];

export default function FeaturesPage() {
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

                    <h1 className="text-4xl font-bold mb-4">Features</h1>
                    <p className="text-muted text-lg mb-12">
                        Discover everything Bookmark Scout has to offer
                    </p>

                    <div className="space-y-8">
                        {features.map((feature) => (
                            <div
                                key={feature.title}
                                className="glass rounded-2xl p-6"
                            >
                                <div className="flex items-start gap-4">
                                    <span className="text-3xl">{feature.icon}</span>
                                    <div>
                                        <h2 className="text-xl font-semibold mb-2">{feature.title}</h2>
                                        <p className="text-muted">{feature.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <section className="mt-16">
                        <h2 className="text-2xl font-bold mb-6">Roadmap</h2>
                        <div className="glass rounded-2xl p-6">
                            <ul className="space-y-3 text-muted">
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    Full Bookmarks Manager — Replace Chrome&apos;s default bookmarks page
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    Options Page — Customize extension settings
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    Tags — Add custom tags for better organization
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    Duplicate Detection — Find and remove duplicates
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    Dead Link Checker — Detect broken links
                                </li>
                                <li className="flex items-center gap-3">
                                    <span className="w-5 h-5 rounded border border-white/20 flex-shrink-0" />
                                    Keyboard Shortcuts — Navigate with hotkeys
                                </li>
                            </ul>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
