import type { DocsCopy } from "../copy";

/** Docs UI copy in pt-BR; see `en` in ../copy.ts for what each entry is. */
export const ptBR: DocsCopy = {
  nav: { website: "Site" },

  release: { latest: "a versão mais recente no GitHub" },

  store: {
    listed: (product: string, store: string) =>
      `Instale o ${product} pela página dele na loja ${store}.`,
    notListed: (product: string, store: string) =>
      `O ${product} chega em breve à loja ${store}.`,
    noneListed: (product: string) =>
      `O ${product} ainda não está em nenhuma loja de navegador.`,
    listedOn: (product: string) => `O ${product} está disponível em:`,
  },

  home: {
    install: (product: string) => `Instalar o ${product}`,
    addTo: (browser: string) => `Adicionar ao ${browser}, grátis`,
    otherBrowsers: "Outros navegadores",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: [
      "duplicatas",
      "links quebrados",
      "importar",
      "atalhos",
      "chave de API",
    ],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "Encontrar uma página",
    label: "Pesquisar a documentação por tarefa",
    placeholder: "O que você quer fazer?",
    idle: (total: number) =>
      `Escolha uma tarefa ou digite para filtrar todas as ${total} páginas. Enter abre o primeiro resultado.`,
    count: (shown: number, total: number) => `${shown} de ${total} páginas`,
    noMatch: (query: string) =>
      `Nenhuma página corresponde a “${query}”. Tente menos palavras ou use Pesquisar, no topo da página, para pesquisar dentro de todas as páginas.`,
  },

  shortcut: {
    or: " ou ",
    notes: {
      mac: " ({keys} no Mac)",
      other: " ({keys} no Windows e no Linux)",
    },
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated:
      "Esta página ainda não foi traduzida, por isso é mostrada em inglês.",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      'Dois pop-ups: "pas" digitado na caixa de pesquisa com a pasta Pasta (Recipes / Italian) selecionada em Salvar na pasta, e sugestões da IA para a página atual: a pasta existente Recipes/Italian/Pasta e uma nova pasta Recipes/Quick Dinners',
    "quick-save":
      "Uma página de receita com a notificação de salvamento rápido no canto superior: salvo em Pasta, com Desfazer e outras pastas em Mover para",
    manager:
      "O gerenciador de favoritos na barra de favoritos: a árvore de pastas com Recipes, School, Travel, Family e Shopping, uma única caixa de pesquisa e a tabela de favoritos",
    duplicates:
      "A revisão do Limpador de duplicatas sobre o gerenciador, com o favorito a manter em cada grupo marcado como Manter",
    settings:
      "A guia Essenciais das configurações: Pasta de salvamento rápido, Pasta de destino, Menu do botão direito (desativado), Tema e Idioma",
    "options-ai":
      "A guia IA das configurações: o quadro A IA é opcional explica do que a IA precisa e quanto pode custar, e Recursos de IA está desativado, o padrão",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)".
   */
  ui: {
    displayName: "Português (Brasil)",
    "Ask AI(AI chat button)": "Perguntar à IA",
    "Back to Home(404 page)": "Voltar para o início",
    "Choose a language(language switcher)": "Escolha um idioma",
    "Choose a language(language switcher)(aria-label)": "Escolha um idioma",
    "Close Banner(banner)(aria-label)": "Fechar aviso",
    "Close Search(search dialog)(aria-label)": "Fechar pesquisa",
    "Close Sidebar(aria-label)": "Fechar barra lateral",
    "Close Sidebar(sidebar)(aria-label)": "Fechar barra lateral",
    "Collapse Sidebar(sidebar)(aria-label)": "Recolher barra lateral",
    "Copied Anchor Link(heading anchor)(aria-label)": "Link da seção copiado",
    "Copied Link(accordion)(aria-label)": "Link copiado",
    "Copied Markdown(page actions)": "Markdown copiado",
    "Copied Text(code block)(aria-label)": "Texto copiado",
    "Copy Anchor Link(heading anchor)(aria-label)": "Copiar link da seção",
    "Copy Link(accordion)(aria-label)": "Copiar link",
    "Copy Markdown(page actions)": "Copiar Markdown",
    "Copy Text(code block)(aria-label)": "Copiar texto",
    "Dark(theme switcher)(aria-label)": "Escuro",
    "Default(type table)": "Padrão",
    "Edit on GitHub(edit page)": "Editar no GitHub",
    "Hide Sidebar(sidebar)": "Ocultar barra lateral",
    "Last updated on(page footer)": "Última atualização em",
    "Layout Tab(layout tab trigger)": "Guia de layout",
    "Light(theme switcher)(aria-label)": "Claro",
    "Next Page(pagination)": "Próxima página",
    "No Headings(table of contents)": "Nenhum título",
    "No results found(search dialog)": "Nenhum resultado encontrado",
    "On this page(table of contents)": "Nesta página",
    "Open Search(search trigger)(aria-label)": "Abrir pesquisa",
    "Open Sidebar(sidebar)(aria-label)": "Abrir barra lateral",
    "Open in ChatGPT(page actions)": "Abrir no ChatGPT",
    "Open in Claude(page actions)": "Abrir no Claude",
    "Open in Cursor(page actions)": "Abrir no Cursor",
    "Open in GitHub(page actions)": "Abrir no GitHub",
    "Open in Scira AI(page actions)": "Abrir no Scira AI",
    "Open(page actions)": "Abrir",
    "Page Not Found(404 page)": "Página não encontrada",
    "Parameters(type table)": "Parâmetros",
    "Previous Page(pagination)": "Página anterior",
    "Prop(type table)": "Prop",
    "Read {url}, I want to ask questions about it.(page actions)":
      "Leia {url}, quero fazer perguntas sobre esse conteúdo.",
    "Returns(type table)": "Retorna",
    "Search(search dialog)": "Pesquisar",
    "Search(search trigger)": "Pesquisar",
    "Show Sidebar(sidebar)": "Mostrar barra lateral",
    "System(theme switcher)(aria-label)": "Sistema",
    "Table of Contents(inline table of contents)": "Índice",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "A página que você está procurando pode ter sido removida, ter mudado de nome ou estar temporariamente indisponível.",
    "Toggle Menu(mobile menu)(aria-label)": "Abrir ou fechar menu",
    "Toggle Theme(theme switcher)(aria-label)": "Alternar tema",
    "Type(type table)": "Tipo",
    "View as Markdown(page actions)": "Ver como Markdown",
  },
};
