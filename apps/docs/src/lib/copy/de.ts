import type { DocsCopy } from "../copy";

/** Docs UI copy in de; see `en` in ../copy.ts for what each entry is. */
export const de: DocsCopy = {
  nav: { website: "Website" },

  release: { latest: "dem neuesten GitHub-Release" },

  store: {
    listed: (product: string, store: string) =>
      `Installieren Sie ${product} über den Store-Eintrag (${store}).`,
    notListed: (product: string, store: string) =>
      `${product} ist bald bei ${store} erhältlich.`,
    noneListed: (product: string) =>
      `${product} ist noch in keinem Browser-Store erhältlich.`,
    listedOn: (product: string) => `${product} ist erhältlich in:`,
  },

  home: {
    install: (product: string) => `${product} installieren`,
    addTo: (browser: string) => `Zu ${browser} hinzufügen – kostenlos`,
    otherBrowsers: "Andere Browser",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: [
      "Duplikate",
      "defekte Links",
      "Import",
      "Tastenkombinationen",
      "API-Schlüssel",
    ],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "Seite finden",
    label: "Dokumentation nach Aufgabe durchsuchen",
    placeholder: "Was möchten Sie tun?",
    idle: (total: number) =>
      `Wählen Sie eine Aufgabe, oder tippen Sie, um alle ${total} Seiten zu filtern. Mit Enter öffnen Sie den ersten Treffer.`,
    count: (shown: number, total: number) => `${shown} von ${total} Seiten`,
    noMatch: (query: string) =>
      `Keine Seite passt zu „${query}“. Versuchen Sie es mit weniger Wörtern, oder verwenden Sie die Suche oben auf der Seite, um in allen Seiten zu suchen.`,
  },

  shortcut: {
    or: " oder ",
    notes: {
      mac: "{keys} auf dem Mac",
      other: "{keys} unter Windows und Linux",
      pair: "{primary} ({secondary})",
    },
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated:
      "Diese Seite wurde noch nicht übersetzt und wird daher auf Englisch angezeigt.",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      "Zwei Pop-ups: „fin“ im Suchfeld, unter „In Ordner speichern“ ist der Ordner Fine-tuning (AI / LLMs) ausgewählt, und KI-Vorschläge für eine andere Seite: ein neuer Ordner AI/LLMs/Inference und der vorhandene Ordner AI/LLMs",
    "quick-save":
      "Eine Anleitungsseite für Entwickler mit der Schnellspeichern-Meldung in der oberen Ecke: in Agents (AI / Agents) gespeichert, mit „Rückgängig“ und Papers unter „Verschieben nach“",
    manager:
      "Der Lesezeichen-Manager im Ordner AI / LLMs / Fine-tuning: der Ordnerbaum mit AI, Dev, Design, Tools und Reading list, ein Suchfeld und die Lesezeichentabelle mit dem Symbol jeder Website",
    duplicates:
      "Die Prüfung der Duplikatbereinigung über dem Manager, wobei das zu behaltende Lesezeichen jeder Gruppe mit „Behalten“ markiert ist",
    settings:
      "Der Tab „Das Wichtigste“ in den Einstellungen: Ordner für Schnellspeichern, Zielordner, Rechtsklickmenü (aus), Design und Sprache",
    "options-ai":
      "Der Tab „KI“ in den Einstellungen: Die KI-Funktionen sind an, und unter „Dienst hinzufügen“ stehen zwei KI-Dienste, die der Nutzer hinzugefügt hat: ein KI-Anbieter im Internet mit verborgenem Schlüssel als Standard und ein Modell auf dem eigenen Computer",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)". A label missing here falls back to English.
   */
  ui: {
    displayName: "Deutsch",
    "Ask AI(AI chat button)": "KI fragen",
    "Back to Home(404 page)": "Zurück zur Startseite",
    "Choose a language(language switcher)": "Sprache wählen",
    "Choose a language(language switcher)(aria-label)": "Sprache wählen",
    "Close Banner(banner)(aria-label)": "Banner schließen",
    "Close Search(search dialog)(aria-label)": "Suche schließen",
    "Close Sidebar(aria-label)": "Seitenleiste schließen",
    "Close Sidebar(sidebar)(aria-label)": "Seitenleiste schließen",
    "Collapse Sidebar(sidebar)(aria-label)": "Seitenleiste einklappen",
    "Copied Anchor Link(heading anchor)(aria-label)": "Ankerlink kopiert",
    "Copied Link(accordion)(aria-label)": "Link kopiert",
    "Copied Markdown(page actions)": "Markdown kopiert",
    "Copied Text(code block)(aria-label)": "Text kopiert",
    "Copy Anchor Link(heading anchor)(aria-label)": "Ankerlink kopieren",
    "Copy Link(accordion)(aria-label)": "Link kopieren",
    "Copy Markdown(page actions)": "Markdown kopieren",
    "Copy Text(code block)(aria-label)": "Text kopieren",
    "Dark(theme switcher)(aria-label)": "Dunkel",
    "Default(type table)": "Standard",
    "Edit on GitHub(edit page)": "Auf GitHub bearbeiten",
    "Hide Sidebar(sidebar)": "Seitenleiste ausblenden",
    "Last updated on(page footer)": "Zuletzt aktualisiert am",
    "Layout Tab(layout tab trigger)": "Layout-Tab",
    "Light(theme switcher)(aria-label)": "Hell",
    "Next Page(pagination)": "Nächste Seite",
    "No Headings(table of contents)": "Keine Überschriften",
    "No results found(search dialog)": "Keine Ergebnisse gefunden",
    "On this page(table of contents)": "Auf dieser Seite",
    "Open Search(search trigger)(aria-label)": "Suche öffnen",
    "Open Sidebar(sidebar)(aria-label)": "Seitenleiste öffnen",
    "Open in ChatGPT(page actions)": "In ChatGPT öffnen",
    "Open in Claude(page actions)": "In Claude öffnen",
    "Open in Cursor(page actions)": "In Cursor öffnen",
    "Open in GitHub(page actions)": "Auf GitHub öffnen",
    "Open in Scira AI(page actions)": "In Scira AI öffnen",
    "Open(page actions)": "Öffnen",
    "Page Not Found(404 page)": "Seite nicht gefunden",
    "Parameters(type table)": "Parameter",
    "Previous Page(pagination)": "Vorherige Seite",
    "Prop(type table)": "Prop",
    "Read {url}, I want to ask questions about it.(page actions)":
      "Lies {url}, ich möchte Fragen dazu stellen.",
    "Returns(type table)": "Rückgabewert",
    "Search(search dialog)": "Suchen",
    "Search(search trigger)": "Suchen",
    "Show Sidebar(sidebar)": "Seitenleiste einblenden",
    "System(theme switcher)(aria-label)": "System",
    "Table of Contents(inline table of contents)": "Inhaltsverzeichnis",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "Die gesuchte Seite wurde möglicherweise entfernt, umbenannt oder ist vorübergehend nicht verfügbar.",
    "Toggle Menu(mobile menu)(aria-label)": "Menü umschalten",
    "Toggle Theme(theme switcher)(aria-label)": "Design umschalten",
    "Type(type table)": "Typ",
    "View as Markdown(page actions)": "Als Markdown anzeigen",
  },
};
