import type { Translations } from "fumadocs-ui/i18n";

/**
 * UI text the docs app renders outside MDX, per language: navigation, the docs home, the
 * sentences the config components write, screenshot alt text, and the labels of Fumadocs' own
 * UI. The product name is a parameter, never a literal, and the module imports only types, so
 * client components can use it too.
 */
const en = {
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

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated:
      "This page has not been translated yet, so it is shown in English.",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      'The popup folder tree, and a search for "docs" with the matches highlighted',
    manager:
      "The bookmarks manager with the folder tree, the title and URL filters, and the bookmark table",
    duplicates:
      "The Duplicate Cleaner review over the manager, with the bookmark to keep in each group marked Keep",
    "options-ai":
      "The AI tab in Settings with AI Features turned off, the default",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)". English is built in, so this stays
   * empty for English; a label missing in another language falls back to English.
   */
  ui: {} as Partial<Translations>,
};

export type DocsCopy = typeof en;

/**
 * Copy for each language tag in `[locales] supported` (config/project.toml) other than English.
 * A language missing here uses English. Start a translation from English and override what is
 * translated, so the type keeps every key: `ja: { ...en, nav: { website: "…" } }`.
 */
const TRANSLATIONS: Partial<Record<string, DocsCopy>> = {};

export function getCopy(locale: string): DocsCopy {
  return TRANSLATIONS[locale] ?? en;
}
