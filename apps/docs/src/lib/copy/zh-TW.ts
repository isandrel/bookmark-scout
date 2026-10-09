import type { DocsCopy } from "../copy";

/** Docs UI copy in zh-TW; see `en` in ../copy.ts for what each entry is. */
export const zhTW: DocsCopy = {
  nav: { website: "網站" },

  release: { latest: "最新的 GitHub 版本發布" },

  store: {
    listed: (product: string, store: string) =>
      `從 ${store} 上的商店資訊頁面安裝 ${product}。`,
    notListed: (product: string, store: string) =>
      `${product} 尚未在 ${store} 上架。請從 GitHub 版本發布安裝：`,
    noneListed: (product: string) =>
      `${product} 目前尚未在任何瀏覽器商店上架。`,
    listedOn: (product: string) => `${product} 已在下列商店上架：`,
  },

  home: {
    install: (product: string) => `安裝 ${product}`,
    download: "下載最新版本",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: ["重複書籤", "失效連結", "匯入", "快速鍵", "API 金鑰"],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "尋找頁面",
    label: "依工作搜尋說明文件",
    placeholder: "想做什麼？",
    idle: (total: number) =>
      `選擇一項工作，或輸入文字篩選全部 ${total} 個頁面。按下 Enter 會開啟第一個相符的頁面。`,
    count: (shown: number, total: number) => `${shown} 個頁面 (共 ${total} 個)`,
    noMatch: (query: string) =>
      `沒有符合「${query}」的頁面。請減少輸入的字數，或使用頁面頂端的「搜尋」在所有頁面的內容中搜尋。`,
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated: "這個頁面尚未翻譯，因此以英文顯示。",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup:
      "彈出式視窗中的資料夾樹狀結構，以及搜尋「docs」的結果，相符的文字已醒目顯示",
    manager: "書籤管理員，包含資料夾樹狀結構、標題和網址篩選器，以及書籤表格",
    duplicates:
      "書籤管理員上方的重複書籤清理工具確認畫面，每個群組中要保留的書籤標示為「保留」",
    "options-ai": "設定中的「AI」分頁，「AI 功能」為關閉 (預設值)",
  },

  /**
   * Labels of Fumadocs' own UI (search, table of contents, page footer, switchers), keyed by
   * Fumadocs' label id such as "Search(search trigger)".
   */
  ui: {
    displayName: "繁體中文",
    "Ask AI(AI chat button)": "詢問 AI",
    "Back to Home(404 page)": "返回首頁",
    "Choose a language(language switcher)": "選擇語言",
    "Choose a language(language switcher)(aria-label)": "選擇語言",
    "Close Banner(banner)(aria-label)": "關閉橫幅",
    "Close Search(search dialog)(aria-label)": "關閉搜尋",
    "Close Sidebar(aria-label)": "關閉側欄",
    "Close Sidebar(sidebar)(aria-label)": "關閉側欄",
    "Collapse Sidebar(sidebar)(aria-label)": "收合側欄",
    "Copied Anchor Link(heading anchor)(aria-label)": "已複製錨點連結",
    "Copied Link(accordion)(aria-label)": "已複製連結",
    "Copied Markdown(page actions)": "已複製 Markdown",
    "Copied Text(code block)(aria-label)": "已複製文字",
    "Copy Anchor Link(heading anchor)(aria-label)": "複製錨點連結",
    "Copy Link(accordion)(aria-label)": "複製連結",
    "Copy Markdown(page actions)": "複製 Markdown",
    "Copy Text(code block)(aria-label)": "複製文字",
    "Dark(theme switcher)(aria-label)": "深色",
    "Default(type table)": "預設值",
    "Edit on GitHub(edit page)": "在 GitHub 上編輯",
    "Hide Sidebar(sidebar)": "隱藏側欄",
    "Last updated on(page footer)": "上次更新時間：",
    "Layout Tab(layout tab trigger)": "版面配置分頁",
    "Light(theme switcher)(aria-label)": "淺色",
    "Next Page(pagination)": "下一頁",
    "No Headings(table of contents)": "沒有標題",
    "No results found(search dialog)": "找不到結果",
    "On this page(table of contents)": "本頁內容",
    "Open Search(search trigger)(aria-label)": "開啟搜尋",
    "Open Sidebar(sidebar)(aria-label)": "開啟側欄",
    "Open in ChatGPT(page actions)": "在 ChatGPT 中開啟",
    "Open in Claude(page actions)": "在 Claude 中開啟",
    "Open in Cursor(page actions)": "在 Cursor 中開啟",
    "Open in GitHub(page actions)": "在 GitHub 中開啟",
    "Open in Scira AI(page actions)": "在 Scira AI 中開啟",
    "Open(page actions)": "開啟",
    "Page Not Found(404 page)": "找不到網頁",
    "Parameters(type table)": "參數",
    "Previous Page(pagination)": "上一頁",
    "Prop(type table)": "屬性",
    "Read {url}, I want to ask questions about it.(page actions)":
      "請閱讀 {url}，我想針對其內容提出問題。",
    "Returns(type table)": "傳回值",
    "Search(search dialog)": "搜尋",
    "Search(search trigger)": "搜尋",
    "Show Sidebar(sidebar)": "顯示側欄",
    "System(theme switcher)(aria-label)": "系統",
    "Table of Contents(inline table of contents)": "目錄",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "你要找的網頁可能已遭移除、名稱已變更，或暫時無法使用。",
    "Toggle Menu(mobile menu)(aria-label)": "切換選單",
    "Toggle Theme(theme switcher)(aria-label)": "切換主題",
    "Type(type table)": "類型",
    "View as Markdown(page actions)": "以 Markdown 格式檢視",
  },
};
