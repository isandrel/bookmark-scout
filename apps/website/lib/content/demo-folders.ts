/**
 * Synthetic folder tree for the hero save demo. Folder names are message keys
 * (`home.demo.folders.<key>`), so visitors match the names in their own language.
 */
export type DemoFolderKey =
    | "devDocs"
    | "css"
    | "react"
    | "research"
    | "recipes"
    | "pasta"
    | "baking"
    | "travel"
    | "japan"
    | "kyoto"
    | "reading"
    | "inbox";

export type DemoFolderNode = { key: DemoFolderKey; children?: readonly DemoFolderNode[] };

export const DEMO_FOLDER_TREE: readonly DemoFolderNode[] = [
    { key: "devDocs", children: [{ key: "css" }, { key: "react" }] },
    { key: "research" },
    { key: "recipes", children: [{ key: "pasta" }, { key: "baking" }] },
    { key: "travel", children: [{ key: "japan", children: [{ key: "kyoto" }] }] },
    { key: "reading" },
    { key: "inbox" },
];

/** The page the demo saves; its title is `home.demo.pageTitle`. */
export const DEMO_PAGE_URL = "www.example.com/recipes/weeknight-carbonara";

/** Hero save demo behaviour. */
export const DEMO_SETTINGS = {
    /** Most folders listed, as in the extension's default Maximum Folder Matches. */
    maxMatches: 5,
    /** Delay before the one-time auto-typed query starts. */
    typeStartDelayMs: 700,
    /** Delay between auto-typed characters. */
    typeStepMs: 140,
} as const;
