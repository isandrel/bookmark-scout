import type { DocsCopy } from "../copy";

/** Docs UI copy in fr; see `en` in ../copy.ts for what each entry is. */
export const fr: DocsCopy = {
  nav: { website: "Site Web" },

  release: { latest: "la dernière version GitHub" },

  store: {
    listed: (product: string, store: string) =>
      `Installez ${product} depuis sa fiche sur ${store}.`,
    notListed: (product: string, store: string) =>
      `${product} n'a pas encore de fiche sur ${store}. Installez-le à partir d'une version GitHub :`,
    noneListed: (product: string) =>
      `Aucune boutique de navigateur ne propose encore ${product}.`,
    listedOn: (product: string) => `${product} est disponible sur :`,
  },

  home: {
    install: (product: string) => `Installer ${product}`,
    download: "Télécharger la dernière version",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: [
      "doublons",
      "liens morts",
      "importer",
      "raccourcis",
      "clé API",
    ],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "Trouver une page",
    label: "Rechercher dans la documentation par tâche",
    placeholder: "Que souhaitez-vous faire ?",
    idle: (total: number) =>
      `Choisissez une tâche, ou saisissez du texte pour filtrer les ${total} pages. Entrée ouvre le premier résultat.`,
    count: (shown: number, total: number) => `${shown} pages sur ${total}`,
    noMatch: (query: string) =>
      `Aucune page ne correspond à « ${query} ». Essayez avec moins de mots, ou utilisez Rechercher en haut de la page pour chercher dans le contenu de toutes les pages.`,
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated:
      "Cette page n'a pas encore été traduite : elle est donc affichée en anglais.",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      "L'arborescence des dossiers de la fenêtre pop-up, et une recherche de « docs » avec les résultats surlignés",
    manager:
      "Le gestionnaire de favoris avec l'arborescence des dossiers, les filtres de titre et d'URL, et le tableau des favoris",
    duplicates:
      "La vérification du nettoyeur de doublons au-dessus du gestionnaire, avec le favori à conserver marqué Conserver dans chaque groupe",
    "options-ai":
      "L'onglet IA des paramètres avec les fonctionnalités d'IA désactivées, comme par défaut",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)".
   */
  ui: {
    displayName: "Français",
    "Ask AI(AI chat button)": "Demander à l'IA",
    "Back to Home(404 page)": "Retour à l'accueil",
    "Choose a language(language switcher)": "Choisir une langue",
    "Choose a language(language switcher)(aria-label)": "Choisir une langue",
    "Close Banner(banner)(aria-label)": "Fermer la bannière",
    "Close Search(search dialog)(aria-label)": "Fermer la recherche",
    "Close Sidebar(aria-label)": "Fermer la barre latérale",
    "Close Sidebar(sidebar)(aria-label)": "Fermer la barre latérale",
    "Collapse Sidebar(sidebar)(aria-label)": "Réduire la barre latérale",
    "Copied Anchor Link(heading anchor)(aria-label)": "Lien d'ancrage copié",
    "Copied Link(accordion)(aria-label)": "Lien copié",
    "Copied Markdown(page actions)": "Markdown copié",
    "Copied Text(code block)(aria-label)": "Texte copié",
    "Copy Anchor Link(heading anchor)(aria-label)": "Copier le lien d'ancrage",
    "Copy Link(accordion)(aria-label)": "Copier le lien",
    "Copy Markdown(page actions)": "Copier le Markdown",
    "Copy Text(code block)(aria-label)": "Copier le texte",
    "Dark(theme switcher)(aria-label)": "Sombre",
    "Default(type table)": "Par défaut",
    "Edit on GitHub(edit page)": "Modifier sur GitHub",
    "Hide Sidebar(sidebar)": "Masquer la barre latérale",
    "Last updated on(page footer)": "Dernière mise à jour le",
    "Layout Tab(layout tab trigger)": "Onglet de mise en page",
    "Light(theme switcher)(aria-label)": "Clair",
    "Next Page(pagination)": "Page suivante",
    "No Headings(table of contents)": "Aucun titre",
    "No results found(search dialog)": "Aucun résultat",
    "On this page(table of contents)": "Sur cette page",
    "Open Search(search trigger)(aria-label)": "Ouvrir la recherche",
    "Open Sidebar(sidebar)(aria-label)": "Ouvrir la barre latérale",
    "Open in ChatGPT(page actions)": "Ouvrir dans ChatGPT",
    "Open in Claude(page actions)": "Ouvrir dans Claude",
    "Open in Cursor(page actions)": "Ouvrir dans Cursor",
    "Open in GitHub(page actions)": "Ouvrir dans GitHub",
    "Open in Scira AI(page actions)": "Ouvrir dans Scira AI",
    "Open(page actions)": "Ouvrir",
    "Page Not Found(404 page)": "Page introuvable",
    "Parameters(type table)": "Paramètres",
    "Previous Page(pagination)": "Page précédente",
    "Prop(type table)": "Propriété",
    "Read {url}, I want to ask questions about it.(page actions)":
      "Lis {url}, je veux poser des questions à son sujet.",
    "Returns(type table)": "Valeur renvoyée",
    "Search(search dialog)": "Rechercher",
    "Search(search trigger)": "Rechercher",
    "Show Sidebar(sidebar)": "Afficher la barre latérale",
    "System(theme switcher)(aria-label)": "Système",
    "Table of Contents(inline table of contents)": "Table des matières",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "La page que vous recherchez a peut-être été supprimée ou renommée, ou est temporairement indisponible.",
    "Toggle Menu(mobile menu)(aria-label)": "Afficher ou masquer le menu",
    "Toggle Theme(theme switcher)(aria-label)": "Changer de thème",
    "Type(type table)": "Type",
    "View as Markdown(page actions)": "Afficher au format Markdown",
  },
};
