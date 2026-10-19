/**
 * Synthetic folder tree for the hero save demo: the tech and AI example of the store screenshots
 * and the promo video. Folder names, the page, and the typed queries are product data, shown as
 * they are in every language, like the folder names in the screenshots.
 */
export type DemoFolderNode = { id: string; name: string; children?: readonly DemoFolderNode[] };

export const DEMO_FOLDER_TREE: readonly DemoFolderNode[] = [
    {
        id: "ai",
        name: "AI",
        children: [
            { id: "llms", name: "LLMs", children: [{ id: "fine-tuning", name: "Fine-tuning" }] },
            { id: "agents", name: "Agents" },
            { id: "papers", name: "Papers" },
        ],
    },
    {
        id: "dev",
        name: "Dev",
        children: [
            { id: "typescript", name: "TypeScript" },
            { id: "rust", name: "Rust" },
        ],
    },
    { id: "design", name: "Design", children: [{ id: "ui", name: "UI" }] },
    { id: "tools", name: "Tools" },
    { id: "reading-list", name: "Reading list" },
];

/** The page the demo saves. */
export const DEMO_PAGE = {
    title: "Fine-tuning small LLMs with LoRA",
    url: "www.example.com/blog/fine-tuning-small-llms-with-lora",
} as const;

/** What the demo types once on load, and the queries offered under the input. */
export const DEMO_QUERIES = {
    auto: "fin",
    /** A prefix, a path, a typo, and a nested folder's name. */
    chips: ["pap", "ai/llms", "agnets", "rust"],
} as const;

/** Hero save demo behaviour. */
export const DEMO_SETTINGS = {
    /** Most folders listed, as in the extension's default Maximum Folder Matches. */
    maxMatches: 5,
    /** Delay before the one-time auto-typed query starts. */
    typeStartDelayMs: 700,
    /** Delay between auto-typed characters. */
    typeStepMs: 140,
} as const;
