/**
 * Synthetic bookmark library for the hero search demo.
 * Only public, well-known sites and example.com placeholders: no personal data.
 * Folder names are message keys so the demo searches localized folder paths.
 */
export type DemoFolder =
    | "devDocs"
    | "css"
    | "research"
    | "recipes"
    | "travel"
    | "japan"
    | "reading"
    | "inbox";

export type DemoBookmark = {
    title: string;
    url: string;
    folders: readonly DemoFolder[];
};

export const DEMO_FOLDERS: readonly DemoFolder[] = [
    "devDocs",
    "css",
    "research",
    "recipes",
    "travel",
    "japan",
    "reading",
    "inbox",
];

export const DEMO_BOOKMARKS: readonly DemoBookmark[] = [
    { title: "MDN Web Docs", url: "developer.mozilla.org/en-US/", folders: ["devDocs"] },
    { title: "TypeScript Handbook", url: "www.typescriptlang.org/docs/handbook/", folders: ["devDocs"] },
    { title: "React Reference", url: "react.dev/reference/react", folders: ["devDocs"] },
    { title: "Chrome Extensions Docs", url: "developer.chrome.com/docs/extensions", folders: ["devDocs"] },
    { title: "Python 3 Documentation", url: "docs.python.org/3/", folders: ["devDocs"] },
    { title: "The Rust Programming Language", url: "doc.rust-lang.org/book/", folders: ["devDocs"] },
    { title: "GitHub Docs", url: "docs.github.com/en", folders: ["devDocs"] },
    { title: "Can I use", url: "caniuse.com", folders: ["devDocs"] },
    { title: "Tailwind CSS Docs", url: "tailwindcss.com/docs", folders: ["devDocs", "css"] },
    { title: "CSS Grid Layout", url: "developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout", folders: ["devDocs", "css"] },
    { title: "web.dev Learn CSS", url: "web.dev/learn/css", folders: ["devDocs", "css"] },
    { title: "arXiv: Computation and Language", url: "arxiv.org/list/cs.CL/recent", folders: ["research"] },
    { title: "Google Scholar", url: "scholar.google.com", folders: ["research"] },
    { title: "Our World in Data", url: "ourworldindata.org", folders: ["research"] },
    { title: "Semantic Scholar", url: "www.semanticscholar.org", folders: ["research"] },
    { title: "Information retrieval - Wikipedia", url: "en.wikipedia.org/wiki/Information_retrieval", folders: ["research"] },
    { title: "Zotero", url: "www.zotero.org", folders: ["research"] },
    { title: "Serious Eats", url: "www.seriouseats.com", folders: ["recipes"] },
    { title: "Just One Cookbook", url: "www.justonecookbook.com", folders: ["recipes"] },
    { title: "Maangchi: Korean cooking", url: "www.maangchi.com", folders: ["recipes"] },
    { title: "King Arthur Baking", url: "www.kingarthurbaking.com", folders: ["recipes"] },
    { title: "Budget Bytes", url: "www.budgetbytes.com", folders: ["recipes"] },
    { title: "Weeknight Pasta", url: "www.example.com/recipes/weeknight-pasta", folders: ["recipes"] },
    { title: "Rome2Rio", url: "www.rome2rio.com", folders: ["travel"] },
    { title: "The Man in Seat 61", url: "www.seat61.com", folders: ["travel"] },
    { title: "Visit Seoul", url: "english.visitseoul.net", folders: ["travel"] },
    { title: "Japan Rail Pass", url: "japanrailpass.net", folders: ["travel", "japan"] },
    { title: "Japan Guide", url: "www.japan-guide.com", folders: ["travel", "japan"] },
    { title: "Kyoto - Wikivoyage", url: "en.wikivoyage.org/wiki/Kyoto", folders: ["travel", "japan"] },
    { title: "Paul Graham: Essays", url: "paulgraham.com/articles.html", folders: ["reading"] },
    { title: "The Pudding", url: "pudding.cool", folders: ["reading"] },
    { title: "Longreads", url: "longreads.com", folders: ["reading"] },
    { title: "Hacker News", url: "news.ycombinator.com", folders: ["reading"] },
    { title: "Project Gutenberg", url: "www.gutenberg.org", folders: ["reading"] },
    { title: "Quanta Magazine", url: "www.quantamagazine.org", folders: ["reading"] },
    { title: "Conference notes", url: "www.example.com/notes/conference", folders: ["inbox"] },
    { title: "Pasta maker comparison", url: "www.example.org/reviews/pasta-makers", folders: ["inbox"] },
];

/** Hero search demo behaviour. */
export const DEMO_SETTINGS = {
    /** Rows shown before the "N more" line. */
    visibleRows: 6,
    /** Delay before the one-time auto-typed query starts. */
    typeStartDelayMs: 700,
    /** Delay between auto-typed characters. */
    typeStepMs: 110,
} as const;
