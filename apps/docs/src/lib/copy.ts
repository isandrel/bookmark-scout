import type { Translations } from "fumadocs-ui/i18n";
import { de } from "./copy/de";
import { es } from "./copy/es";
import { fr } from "./copy/fr";
import { ja } from "./copy/ja";
import { ko } from "./copy/ko";
import { ptBR } from "./copy/pt-BR";
import { zhCN } from "./copy/zh-CN";
import { zhTW } from "./copy/zh-TW";

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
      `${product} is coming soon to ${store}.`,
    noneListed: (product: string) => `No browser store lists ${product} yet.`,
    listedOn: (product: string) => `${product} is listed on:`,
  },

  home: {
    /** The primary button while no store lists the extension; it opens the install page. */
    install: (product: string) => `Install ${product}`,
    /** The primary button, to the first live store listing, by browser name. */
    addTo: (browser: string) => `Add to ${browser}, free`,
    /** A link to the install page beside the store button. */
    otherBrowsers: "Other browsers",
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

  /** How `<Shortcut>` joins keys: between two ways to press it, and the note for a Mac's keys. */
  shortcut: {
    or: " or ",
    /** `{keys}` is replaced with the Mac keys. */
    mac: " ({keys} on a Mac)",
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated:
      "This page has not been translated yet, so it is shown in English.",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      'Two popups: "pas" typed in the search box with the Pasta folder (Recipes / Italian) selected under Save to folder, and AI suggestions for the current page: the existing Recipes/Italian/Pasta folder and a new Recipes/Quick Dinners folder',
    "quick-save":
      "A recipe page with the quick save notification in its top corner: saved to Pasta, with Undo and other folders under Move to",
    manager:
      "The bookmarks manager on the Bookmarks Bar: the folder tree with Recipes, School, Travel, Family, and Shopping, one search box, and the bookmark table",
    duplicates:
      "The Duplicate Cleaner review over the manager, with the bookmark to keep in each group marked Keep",
    settings:
      "The Essentials tab in Settings: Quick Save Folder, Folder to Save To, Right-Click Menu (off), Theme, and Language",
    "options-ai":
      "The AI tab in Settings: the AI is optional box says what AI needs and may cost, and AI Features is off, the default",
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
const TRANSLATIONS: Partial<Record<string, DocsCopy>> = {
  ja: ja,
  ko: ko,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  es: es,
  de: de,
  fr: fr,
  "pt-BR": ptBR,
};

export function getCopy(locale: string): DocsCopy {
  return TRANSLATIONS[locale] ?? en;
}
