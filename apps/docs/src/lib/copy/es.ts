import type { DocsCopy } from "../copy";

/** Docs UI copy in es; see `en` in ../copy.ts for what each entry is. */
export const es: DocsCopy = {
  nav: { website: "Sitio web" },

  release: { latest: "la última versión publicada en GitHub" },

  store: {
    listed: (product: string, store: string) =>
      `Instala ${product} desde su ficha en ${store}.`,
    notListed: (product: string, store: string) =>
      `${product} llegará pronto a ${store}.`,
    noneListed: (product: string) =>
      `Ninguna tienda de navegador ofrece ${product} todavía.`,
    listedOn: (product: string) => `${product} está disponible en:`,
  },

  home: {
    install: (product: string) => `Instalar ${product}`,
    addTo: (browser: string) => `Añadir a ${browser}, gratis`,
    otherBrowsers: "Otros navegadores",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: [
      "duplicados",
      "enlaces rotos",
      "importar",
      "atajos",
      "clave de API",
    ],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "Buscar una página",
    label: "Busca en la documentación por tarea",
    placeholder: "¿Qué quieres hacer?",
    idle: (total: number) =>
      `Elige una tarea o escribe para filtrar las ${total} páginas. Enter abre la primera coincidencia.`,
    count: (shown: number, total: number) => `${shown} de ${total} páginas`,
    noMatch: (query: string) =>
      `Ninguna página coincide con “${query}”. Prueba con menos palabras, o usa Buscar en la parte superior de la página para buscar dentro de todas las páginas.`,
  },

  shortcut: {
    or: " o ",
    notes: {
      mac: "{keys} en Mac",
      other: "{keys} en Windows y Linux",
      pair: "{primary} ({secondary})",
      click: "clic",
    },
  },

  languages: {
    en: "inglés",
    "zh-CN": "chino simplificado",
    es: "español",
    fr: "francés",
    "pt-BR": "portugués de Brasil",
    ru: "ruso",
    id: "indonesio",
    de: "alemán",
    ja: "japonés",
    ko: "coreano",
    it: "italiano",
    "zh-TW": "chino tradicional",
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated:
      "Esta página todavía no está traducida, así que se muestra en inglés.",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      'Dos ventanas emergentes: "fin" escrito en el cuadro de búsqueda con la carpeta Fine-tuning (AI / LLMs) seleccionada en Guardar en carpeta, y sugerencias de IA para otra página: una carpeta nueva AI/LLMs/Inference y la carpeta existente AI/LLMs',
    "quick-save":
      "Una guía para desarrolladores con el aviso de guardado rápido en la esquina superior: guardada en Agents (AI / Agents), con Deshacer y Papers en Mover a",
    manager:
      "El gestor de marcadores en AI / LLMs / Fine-tuning: el árbol de carpetas con AI, Dev, Design, Tools y Reading list, un único cuadro de búsqueda y la tabla de marcadores con el icono de cada sitio",
    duplicates:
      "La revisión del Limpiador de duplicados sobre el administrador, con el marcador que se conserva en cada grupo marcado como Conservar",
    settings:
      "La pestaña Lo esencial de la configuración: Carpeta de guardado rápido, Carpeta de destino, Menú del clic derecho (desactivado), Tema e Idioma",
    "options-ai":
      "La pestaña IA de la configuración: Funciones de IA está activado y, bajo Añadir servicio, aparecen dos servicios de IA que añadió el usuario: una empresa de IA en la nube con la clave oculta, como predeterminado, y un modelo en el propio ordenador",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)".
   */
  ui: {
    displayName: "Español",
    "Ask AI(AI chat button)": "Preguntar a la IA",
    "Back to Home(404 page)": "Volver al inicio",
    "Choose a language(language switcher)": "Elige un idioma",
    "Choose a language(language switcher)(aria-label)": "Elegir un idioma",
    "Close Banner(banner)(aria-label)": "Cerrar el aviso",
    "Close Search(search dialog)(aria-label)": "Cerrar la búsqueda",
    "Close Sidebar(aria-label)": "Cerrar la barra lateral",
    "Close Sidebar(sidebar)(aria-label)": "Cerrar la barra lateral",
    "Collapse Sidebar(sidebar)(aria-label)": "Contraer la barra lateral",
    "Copied Anchor Link(heading anchor)(aria-label)":
      "Enlace al encabezado copiado",
    "Copied Link(accordion)(aria-label)": "Enlace copiado",
    "Copied Markdown(page actions)": "Markdown copiado",
    "Copied Text(code block)(aria-label)": "Texto copiado",
    "Copy Anchor Link(heading anchor)(aria-label)":
      "Copiar el enlace al encabezado",
    "Copy Link(accordion)(aria-label)": "Copiar el enlace",
    "Copy Markdown(page actions)": "Copiar Markdown",
    "Copy Text(code block)(aria-label)": "Copiar el texto",
    "Dark(theme switcher)(aria-label)": "Oscuro",
    "Default(type table)": "Predeterminado",
    "Edit on GitHub(edit page)": "Editar en GitHub",
    "Hide Sidebar(sidebar)": "Ocultar la barra lateral",
    "Last updated on(page footer)": "Última actualización:",
    "Layout Tab(layout tab trigger)": "Pestaña de diseño",
    "Light(theme switcher)(aria-label)": "Claro",
    "Next Page(pagination)": "Siguiente",
    "No Headings(table of contents)": "Sin encabezados",
    "No results found(search dialog)": "No se encontraron resultados",
    "On this page(table of contents)": "En esta página",
    "Open Search(search trigger)(aria-label)": "Abrir la búsqueda",
    "Open Sidebar(sidebar)(aria-label)": "Abrir la barra lateral",
    "Open in ChatGPT(page actions)": "Abrir en ChatGPT",
    "Open in Claude(page actions)": "Abrir en Claude",
    "Open in Cursor(page actions)": "Abrir en Cursor",
    "Open in GitHub(page actions)": "Abrir en GitHub",
    "Open in Scira AI(page actions)": "Abrir en Scira AI",
    "Open(page actions)": "Abrir",
    "Page Not Found(404 page)": "Página no encontrada",
    "Parameters(type table)": "Parámetros",
    "Previous Page(pagination)": "Anterior",
    "Prop(type table)": "Propiedad",
    "Read {url}, I want to ask questions about it.(page actions)":
      "Lee {url}, quiero hacerte preguntas sobre esta página.",
    "Returns(type table)": "Devuelve",
    "Search(search dialog)": "Buscar",
    "Search(search trigger)": "Buscar",
    "Show Sidebar(sidebar)": "Mostrar la barra lateral",
    "System(theme switcher)(aria-label)": "Sistema",
    "Table of Contents(inline table of contents)": "Índice",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "Es posible que la página que buscas se haya eliminado, haya cambiado de nombre o no esté disponible temporalmente.",
    "Toggle Menu(mobile menu)(aria-label)": "Mostrar u ocultar el menú",
    "Toggle Theme(theme switcher)(aria-label)": "Cambiar el tema",
    "Type(type table)": "Tipo",
    "View as Markdown(page actions)": "Ver como Markdown",
  },
};
