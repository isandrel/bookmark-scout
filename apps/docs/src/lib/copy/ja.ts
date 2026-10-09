import type { DocsCopy } from "../copy";

/** Docs UI copy in ja; see `en` in ../copy.ts for what each entry is. */
export const ja: DocsCopy = {
  nav: { website: "ウェブサイト" },

  release: { latest: "最新の GitHub リリース" },

  store: {
    listed: (product: string, store: string) =>
      `${store} の掲載ページから ${product} をインストールできます。`,
    notListed: (product: string, store: string) =>
      `${product} はまだ ${store} に掲載されていません。GitHub のリリースからインストールしてください：`,
    noneListed: (product: string) =>
      `${product} はまだどのブラウザのストアにも掲載されていません。`,
    listedOn: (product: string) =>
      `${product} は次のストアに掲載されています：`,
  },

  home: {
    install: (product: string) => `${product} をインストール`,
    download: "最新リリースをダウンロード",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: [
      "重複",
      "リンク切れ",
      "インポート",
      "ショートカット",
      "API キー",
    ],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "ページを探す",
    label: "やりたいことからドキュメントを検索",
    placeholder: "何をしたいですか?",
    idle: (total: number) =>
      `やりたいことを選ぶか、入力して全 ${total} ページを絞り込みます。Enter キーで最初に一致したページを開きます。`,
    count: (shown: number, total: number) =>
      `${total} ページ中 ${shown} ページ`,
    noMatch: (query: string) =>
      `「${query}」に一致するページはありません。語句を減らすか、ページ上部の「検索」を使ってすべてのページの本文を検索してください。`,
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated:
      "このページはまだ翻訳されていないため、英語で表示しています。",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      "ポップアップのフォルダツリーと、「docs」で検索して一致部分が強調表示された画面",
    manager:
      "フォルダツリー、タイトルと URL のフィルター、ブックマークの表を表示したブックマークマネージャー",
    duplicates:
      "マネージャーの上に表示された重複クリーナーの確認画面。各グループで残すブックマークに「保持」の印が付いている",
    "options-ai": "設定の AI タブ。AI機能は初期設定どおりオフになっている",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)".
   */
  ui: {
    displayName: "日本語",
    "Ask AI(AI chat button)": "AI に質問",
    "Back to Home(404 page)": "ホームに戻る",
    "Choose a language(language switcher)": "言語を選択",
    "Choose a language(language switcher)(aria-label)": "言語を選択",
    "Close Banner(banner)(aria-label)": "お知らせを閉じる",
    "Close Search(search dialog)(aria-label)": "検索を閉じる",
    "Close Sidebar(aria-label)": "サイドバーを閉じる",
    "Close Sidebar(sidebar)(aria-label)": "サイドバーを閉じる",
    "Collapse Sidebar(sidebar)(aria-label)": "サイドバーを折りたたむ",
    "Copied Anchor Link(heading anchor)(aria-label)":
      "見出しへのリンクをコピーしました",
    "Copied Link(accordion)(aria-label)": "リンクをコピーしました",
    "Copied Markdown(page actions)": "Markdown をコピーしました",
    "Copied Text(code block)(aria-label)": "テキストをコピーしました",
    "Copy Anchor Link(heading anchor)(aria-label)": "見出しへのリンクをコピー",
    "Copy Link(accordion)(aria-label)": "リンクをコピー",
    "Copy Markdown(page actions)": "Markdown をコピー",
    "Copy Text(code block)(aria-label)": "テキストをコピー",
    "Dark(theme switcher)(aria-label)": "ダーク",
    "Default(type table)": "既定値",
    "Edit on GitHub(edit page)": "GitHub で編集",
    "Hide Sidebar(sidebar)": "サイドバーを隠す",
    "Last updated on(page footer)": "最終更新日:",
    "Layout Tab(layout tab trigger)": "レイアウトタブ",
    "Light(theme switcher)(aria-label)": "ライト",
    "Next Page(pagination)": "次へ",
    "No Headings(table of contents)": "見出しはありません",
    "No results found(search dialog)": "結果が見つかりませんでした",
    "On this page(table of contents)": "このページの内容",
    "Open Search(search trigger)(aria-label)": "検索を開く",
    "Open Sidebar(sidebar)(aria-label)": "サイドバーを開く",
    "Open in ChatGPT(page actions)": "ChatGPT で開く",
    "Open in Claude(page actions)": "Claude で開く",
    "Open in Cursor(page actions)": "Cursor で開く",
    "Open in GitHub(page actions)": "GitHub で開く",
    "Open in Scira AI(page actions)": "Scira AI で開く",
    "Open(page actions)": "開く",
    "Page Not Found(404 page)": "ページが見つかりません",
    "Parameters(type table)": "パラメーター",
    "Previous Page(pagination)": "前へ",
    "Prop(type table)": "プロパティ",
    "Read {url}, I want to ask questions about it.(page actions)":
      "{url} を読んでください。このページについて質問があります。",
    "Returns(type table)": "戻り値",
    "Search(search dialog)": "検索",
    "Search(search trigger)": "検索",
    "Show Sidebar(sidebar)": "サイドバーを表示",
    "System(theme switcher)(aria-label)": "システム",
    "Table of Contents(inline table of contents)": "目次",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "お探しのページは削除されたか、名前が変更されたか、一時的に利用できない可能性があります。",
    "Toggle Menu(mobile menu)(aria-label)": "メニューを開閉",
    "Toggle Theme(theme switcher)(aria-label)": "テーマを切り替え",
    "Type(type table)": "型",
    "View as Markdown(page actions)": "Markdown で表示",
  },
};
