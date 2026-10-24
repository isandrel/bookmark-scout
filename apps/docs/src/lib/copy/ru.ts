import type { DocsCopy } from "../copy";

/** Docs UI copy in ru; see `en` in ../copy.ts for what each entry is. */
export const ru: DocsCopy = {
  nav: { website: "Сайт" },

  release: { latest: "последнего выпуска на GitHub" },

  store: {
    listed: (product: string, store: string) =>
      `Установите ${product} со страницы расширения в магазине ${store}.`,
    notListed: (product: string, store: string) =>
      `${product} скоро появится в магазине ${store}.`,
    noneListed: (product: string) =>
      `${product} пока нет ни в одном магазине браузеров.`,
    listedOn: (product: string) => `${product} доступен в магазинах:`,
  },

  home: {
    install: (product: string) => `Установить ${product}`,
    addTo: (browser: string) => `Добавить в ${browser} бесплатно`,
    otherBrowsers: "Другие браузеры",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: [
      "дубликаты",
      "неработающие ссылки",
      "импорт",
      "быстрые клавиши",
      "API-ключ",
    ],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "Поиск страницы",
    label: "Поиск по документации по задаче",
    placeholder: "Что вы хотите сделать?",
    idle: (total: number) =>
      `Выберите задачу или начните вводить текст, чтобы отфильтровать все страницы (${total}). Enter открывает первое совпадение.`,
    count: (shown: number, total: number) => `${shown} из ${total} стр.`,
    noMatch: (query: string) =>
      `Нет страниц, подходящих под «${query}». Попробуйте меньше слов или воспользуйтесь поиском вверху страницы, чтобы искать по тексту всех страниц.`,
  },

  shortcut: {
    or: " или ",
    notes: {
      mac: "{keys} на Mac",
      other: "{keys} в Windows и Linux",
      pair: "{primary} ({secondary})",
      click: "щелчок",
    },
  },

  languages: {
    en: "английский",
    "zh-CN": "упрощённый китайский",
    es: "испанский",
    fr: "французский",
    "pt-BR": "бразильский португальский",
    de: "немецкий",
    ja: "японский",
    ko: "корейский",
    "zh-TW": "традиционный китайский",
    ru: "русский",
    it: "итальянский",
    id: "индонезийский",
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated:
      "Эта страница ещё не переведена, поэтому она показана на английском языке.",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      "Два всплывающих окна: в поле поиска введено «fin», и в разделе «Сохранить в папку» выбрана папка Fine-tuning (AI / LLMs); подсказки ИИ для другой страницы: новая папка AI/LLMs/Inference и существующая папка AI/LLMs",
    "quick-save":
      "Страница руководства для разработчиков с уведомлением быстрого сохранения в верхнем углу: сохранено в Agents (AI / Agents), с кнопкой «Отменить» и папкой Papers в разделе «Переместить в»",
    manager:
      "Диспетчер закладок в папке AI / LLMs / Fine-tuning: дерево папок с AI, Dev, Design, Tools и Reading list, одно поле поиска и таблица закладок со значком каждого сайта",
    duplicates:
      "Проверка в инструменте «Очистка дубликатов» поверх диспетчера: в каждой группе закладка, которую нужно оставить, отмечена «Оставить»",
    settings:
      "Вкладка «Основные» в настройках: «Папка для быстрого сохранения», «Папка для сохранения», «Контекстное меню» (выключено), «Тема» и «Язык»",
    "options-ai":
      "Вкладка «ИИ» в настройках: «Функции ИИ» включены, а в разделе «Добавить сервис» два ИИ-сервиса, добавленные пользователем: облачная ИИ-компания со скрытым ключом, выбранная по умолчанию, и модель на компьютере",
    "manager-cards":
      "Диспетчер закладок показывает папку Reading list карточками: три статьи с обложками, тегами и описаниями и три сайта в виде плиток со значком, рядом дерево папок",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)". A label missing here falls back to English.
   */
  ui: {
    displayName: "Русский",
    "Ask AI(AI chat button)": "Спросить ИИ",
    "Back to Home(404 page)": "Вернуться на главную",
    "Choose a language(language switcher)": "Выберите язык",
    "Choose a language(language switcher)(aria-label)": "Выберите язык",
    "Close Banner(banner)(aria-label)": "Закрыть баннер",
    "Close Search(search dialog)(aria-label)": "Закрыть поиск",
    "Close Sidebar(aria-label)": "Закрыть боковую панель",
    "Close Sidebar(sidebar)(aria-label)": "Закрыть боковую панель",
    "Close(image zoom)(aria-label)": "Закрыть",
    "Collapse Sidebar(sidebar)(aria-label)": "Свернуть боковую панель",
    "Copied Anchor Link(heading anchor)(aria-label)":
      "Ссылка на раздел скопирована",
    "Copied Link(accordion)(aria-label)": "Ссылка скопирована",
    "Copied Markdown(page actions)": "Markdown скопирован",
    "Copied Text(code block)(aria-label)": "Текст скопирован",
    "Copy Anchor Link(heading anchor)(aria-label)":
      "Копировать ссылку на раздел",
    "Copy Link(accordion)(aria-label)": "Копировать ссылку",
    "Copy Markdown(page actions)": "Копировать Markdown",
    "Copy Text(code block)(aria-label)": "Копировать текст",
    "Dark(theme switcher)(aria-label)": "Тёмная",
    "Default(type table)": "По умолчанию",
    "Edit on GitHub(edit page)": "Изменить на GitHub",
    "Hide Sidebar(sidebar)": "Скрыть боковую панель",
    "Image Viewer(image zoom)(aria-label)": "Просмотр изображения",
    "Last updated on(page footer)": "Последнее обновление",
    "Layout Tab(layout tab trigger)": "Вкладка макета",
    "Light(theme switcher)(aria-label)": "Светлая",
    "Next Image(image zoom)(aria-label)": "Следующее изображение",
    "Next Page(pagination)": "Следующая страница",
    "No Headings(table of contents)": "Нет заголовков",
    "No results found(search dialog)": "Ничего не найдено",
    "On this page(table of contents)": "На этой странице",
    "Open Search(search trigger)(aria-label)": "Открыть поиск",
    "Open Sidebar(sidebar)(aria-label)": "Открыть боковую панель",
    "Open in ChatGPT(page actions)": "Открыть в ChatGPT",
    "Open in Claude(page actions)": "Открыть в Claude",
    "Open in Cursor(page actions)": "Открыть в Cursor",
    "Open in GitHub(page actions)": "Открыть на GitHub",
    "Open in Scira AI(page actions)": "Открыть в Scira AI",
    "Open(page actions)": "Открыть",
    "Page Not Found(404 page)": "Страница не найдена",
    "Parameters(type table)": "Параметры",
    "Previous Image(image zoom)(aria-label)": "Предыдущее изображение",
    "Previous Page(pagination)": "Предыдущая страница",
    "Prop(type table)": "Свойство",
    "Read {url}, I want to ask questions about it.(page actions)":
      "Прочитай {url}, я хочу задать по нему вопросы.",
    "Returns(type table)": "Возвращает",
    "Search failed(search dialog)": "Не удалось выполнить поиск",
    "Search failed, showing results for {query}(search dialog)":
      "Не удалось выполнить поиск, показаны результаты для «{query}»",
    "Search(search dialog)": "Поиск",
    "Search(search trigger)": "Поиск",
    "Show Sidebar(sidebar)": "Показать боковую панель",
    "System(theme switcher)(aria-label)": "Системная",
    "Table of Contents(inline table of contents)": "Содержание",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "Страница, которую вы ищете, могла быть удалена или переименована либо временно недоступна.",
    "Toggle Menu(mobile menu)(aria-label)": "Показать или скрыть меню",
    "Toggle Theme(theme switcher)(aria-label)": "Сменить тему",
    "Type(type table)": "Тип",
    "View as Markdown(page actions)": "Открыть как Markdown",
  },
};
