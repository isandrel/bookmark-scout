/**
 * UI text the docs app renders outside MDX: navigation, the docs home, and the sentences the
 * config components write. The docs are English-only (the default locale in
 * config/project.toml). The product name is a parameter, never a literal, and the module
 * imports nothing, so client components can use it too.
 */
export const copy = {
  nav: { website: "Website" },

  release: { latest: "the latest GitHub release" },

  store: {
    listed: (product: string, store: string) =>
      `Install ${product} from its ${store} listing.`,
    notListed: (product: string, store: string) =>
      `${product} has no ${store} listing yet. Install it from a GitHub release:`,
    noneListed: (product: string) => `No browser store lists ${product} yet.`,
    listedOn: (product: string) => `${product} is listed on:`,
  },

  home: {
    install: (product: string) => `Install ${product}`,
    download: "Download the latest release",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: ["duplicates", "dead links", "import", "shortcuts", "API key"],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "Find a page",
    label: "Search the docs by task",
    placeholder: "What do you want to do?",
    idle: (total: number) =>
      `Pick a task, or type to filter all ${total} pages. Enter opens the first match.`,
    count: (shown: number, total: number) => `${shown} of ${total} pages`,
    noMatch: (query: string) =>
      `No page matches “${query}”. Try fewer words, or use Search at the top of the page to search inside every page.`,
  },
} as const;
