import type { DocsCopy } from "../copy";

/** Docs UI copy in it; see `en` in ../copy.ts for what each entry is. */
export const it: DocsCopy = {
  nav: { website: "Sito web" },

  release: { latest: "l'ultima release su GitHub" },

  store: {
    listed: (product: string, store: string) =>
      `Installa ${product} dalla sua scheda su ${store}.`,
    notListed: (product: string, store: string) =>
      `${product} arriverà presto su ${store}.`,
    noneListed: (product: string) =>
      `Nessuno store dei browser offre ancora ${product}.`,
    listedOn: (product: string) => `${product} è disponibile su:`,
  },

  home: {
    install: (product: string) => `Installa ${product}`,
    addTo: (browser: string) => `Aggiungi a ${browser}, è gratis`,
    otherBrowsers: "Altri browser",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: [
      "duplicati",
      "link non funzionanti",
      "importare",
      "scorciatoie",
      "chiave API",
    ],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "Trova una pagina",
    label: "Cerca nella documentazione per attività",
    placeholder: "Cosa vuoi fare?",
    idle: (total: number) =>
      `Scegli un'attività, oppure digita per filtrare tutte le ${total} pagine. Invio apre il primo risultato.`,
    count: (shown: number, total: number) => `${shown} pagine su ${total}`,
    noMatch: (query: string) =>
      `Nessuna pagina corrisponde a “${query}”. Prova con meno parole, oppure usa Cerca in cima alla pagina per cercare all'interno di tutte le pagine.`,
  },

  shortcut: {
    or: " o ",
    notes: {
      mac: "{keys} su Mac",
      other: "{keys} su Windows e Linux",
      pair: "{primary} ({secondary})",
      click: "clic",
    },
  },

  languages: {
    en: "inglese",
    "zh-CN": "cinese semplificato",
    es: "spagnolo",
    fr: "francese",
    "pt-BR": "portoghese brasiliano",
    de: "tedesco",
    ja: "giapponese",
    ko: "coreano",
    "zh-TW": "cinese tradizionale",
    ru: "russo",
    it: "italiano",
    id: "indonesiano",
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated:
      "Questa pagina non è ancora stata tradotta, quindi viene mostrata in inglese.",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      "Due popup: “fin” digitato nella casella di ricerca con la cartella Fine-tuning (AI / LLMs) selezionata in Salva nella cartella, e i suggerimenti dell'IA per un'altra pagina: una nuova cartella AI/LLMs/Inference e la cartella esistente AI/LLMs",
    "quick-save":
      "Una pagina di guida per sviluppatori con la notifica del salvataggio rapido nell'angolo superiore: salvata in Agents (AI / Agents), con Annulla e Papers in Sposta in",
    manager:
      "La gestione preferiti su AI / LLMs / Fine-tuning: l'albero delle cartelle con AI, Dev, Design, Tools e Reading list, un'unica casella di ricerca e la tabella dei preferiti con l'icona di ciascun sito",
    duplicates:
      "La revisione di Pulizia duplicati sopra la gestione preferiti, con il preferito da conservare in ogni gruppo contrassegnato come Conserva",
    settings:
      "La scheda Essenziali delle Impostazioni: Cartella del salvataggio rapido, Cartella in cui salvare, Menu contestuale (disattivato), Tema e Lingua",
    "options-ai":
      "La scheda IA delle Impostazioni: Funzioni IA è attivo e, in Aggiungi servizio, ci sono due servizi IA aggiunti dall'utente: un'azienda di IA nel cloud con la chiave nascosta, impostata come predefinita, e un modello sul computer",
    "manager-cards":
      "La gestione preferiti mostra Reading list come riquadri: tre articoli con immagine di copertina, tag e riassunto, e tre siti come tessera con la loro icona, accanto all'albero delle cartelle",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)".
   */
  ui: {
    displayName: "Italiano",
    "Ask AI(AI chat button)": "Chiedi all'IA",
    "Back to Home(404 page)": "Torna alla home page",
    "Choose a language(language switcher)": "Scegli una lingua",
    "Choose a language(language switcher)(aria-label)": "Scegli una lingua",
    "Close Banner(banner)(aria-label)": "Chiudi il banner",
    "Close Search(search dialog)(aria-label)": "Chiudi la ricerca",
    "Close Sidebar(aria-label)": "Chiudi la barra laterale",
    "Close Sidebar(sidebar)(aria-label)": "Chiudi la barra laterale",
    "Collapse Sidebar(sidebar)(aria-label)": "Comprimi la barra laterale",
    "Copied Anchor Link(heading anchor)(aria-label)": "Link all'ancora copiato",
    "Copied Link(accordion)(aria-label)": "Link copiato",
    "Copied Markdown(page actions)": "Markdown copiato",
    "Copied Text(code block)(aria-label)": "Testo copiato",
    "Copy Anchor Link(heading anchor)(aria-label)": "Copia il link all'ancora",
    "Copy Link(accordion)(aria-label)": "Copia il link",
    "Copy Markdown(page actions)": "Copia Markdown",
    "Copy Text(code block)(aria-label)": "Copia il testo",
    "Dark(theme switcher)(aria-label)": "Scuro",
    "Default(type table)": "Predefinito",
    "Edit on GitHub(edit page)": "Modifica su GitHub",
    "Hide Sidebar(sidebar)": "Nascondi la barra laterale",
    "Last updated on(page footer)": "Ultimo aggiornamento:",
    "Layout Tab(layout tab trigger)": "Scheda del layout",
    "Light(theme switcher)(aria-label)": "Chiaro",
    "Next Page(pagination)": "Pagina successiva",
    "No Headings(table of contents)": "Nessun titolo",
    "No results found(search dialog)": "Nessun risultato",
    "On this page(table of contents)": "In questa pagina",
    "Open Search(search trigger)(aria-label)": "Apri la ricerca",
    "Open Sidebar(sidebar)(aria-label)": "Apri la barra laterale",
    "Open in ChatGPT(page actions)": "Apri in ChatGPT",
    "Open in Claude(page actions)": "Apri in Claude",
    "Open in Cursor(page actions)": "Apri in Cursor",
    "Open in GitHub(page actions)": "Apri in GitHub",
    "Open in Scira AI(page actions)": "Apri in Scira AI",
    "Open(page actions)": "Apri",
    "Page Not Found(404 page)": "Pagina non trovata",
    "Parameters(type table)": "Parametri",
    "Previous Page(pagination)": "Pagina precedente",
    "Prop(type table)": "Proprietà",
    "Read {url}, I want to ask questions about it.(page actions)":
      "Leggi {url}, voglio farti delle domande su questa pagina.",
    "Returns(type table)": "Valore restituito",
    "Search(search dialog)": "Cerca",
    "Search(search trigger)": "Cerca",
    "Show Sidebar(sidebar)": "Mostra la barra laterale",
    "System(theme switcher)(aria-label)": "Sistema",
    "Table of Contents(inline table of contents)": "Indice",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "La pagina che cerchi potrebbe essere stata rimossa o rinominata, oppure è temporaneamente non disponibile.",
    "Toggle Menu(mobile menu)(aria-label)": "Mostra o nascondi il menu",
    "Toggle Theme(theme switcher)(aria-label)": "Cambia tema",
    "Type(type table)": "Tipo",
    "View as Markdown(page actions)": "Visualizza come Markdown",
  },
};
