import type { DocsCopy } from "../copy";

/** Docs UI copy in zh-CN; see `en` in ../copy.ts for what each entry is. */
export const zhCN: DocsCopy = {
  nav: { website: "网站" },

  release: { latest: "最新的 GitHub 版本发布" },

  store: {
    listed: (product: string, store: string) => `从 ${store} 安装 ${product}。`,
    notListed: (product: string, store: string) =>
      `${product} 尚未在 ${store} 上架。请从 GitHub 版本发布安装：`,
    noneListed: (product: string) => `${product} 尚未在任何浏览器商店上架。`,
    listedOn: (product: string) => `${product} 已在以下商店上架：`,
  },

  home: {
    install: (product: string) => `安装 ${product}`,
    download: "下载最新版本",
    /** Example queries offered as one-click filters in the page finder. */
    suggestions: ["重复书签", "失效链接", "导入", "快捷键", "API 密钥"],
    /** How many sidebar sections, from the top, the page finder lists before anything is typed. */
    featuredSectionCount: 2,
  },

  finder: {
    region: "查找页面",
    label: "按任务搜索文档",
    placeholder: "你想做什么？",
    idle: (total: number) =>
      `选择一项任务，或输入文字筛选全部 ${total} 个页面。按 Enter 打开第一个匹配项。`,
    count: (shown: number, total: number) => `${shown} / ${total} 个页面`,
    noMatch: (query: string) =>
      `没有与“${query}”匹配的页面。请尝试减少关键词，或使用页面顶部的“搜索”在所有页面的内容中搜索。`,
  },

  page: {
    /** Shown above a page that has no translation for the current language yet. */
    untranslated: "此页面尚未翻译，因此以英文显示。",
  },

  /** Alt text for the shared screenshots, by name in `SCREENSHOTS` of `@bookmark-scout/config`. */
  screenshots: {
    popup: "弹出窗口中的文件夹树，以及对“docs”的搜索，匹配项已高亮显示",
    manager: "书签管理器，包含文件夹树、标题和网址筛选器以及书签表格",
    duplicates:
      "显示在书签管理器上方的重复书签清理审阅界面，每组中要保留的书签标有“保留”",
    "options-ai": "设置中的 AI 标签页，AI 功能处于关闭状态（默认）",
  },

  /** Labels of Fumadocs' own UI (search, table of contents, page footer, switchers). */
  ui: {
    displayName: "简体中文",
    "Ask AI(AI chat button)": "询问 AI",
    "Back to Home(404 page)": "返回首页",
    "Choose a language(language switcher)": "选择语言",
    "Choose a language(language switcher)(aria-label)": "选择语言",
    "Close Banner(banner)(aria-label)": "关闭横幅",
    "Close Search(search dialog)(aria-label)": "关闭搜索",
    "Close Sidebar(aria-label)": "关闭侧栏",
    "Close Sidebar(sidebar)(aria-label)": "关闭侧栏",
    "Collapse Sidebar(sidebar)(aria-label)": "收起侧栏",
    "Copied Anchor Link(heading anchor)(aria-label)": "已复制锚点链接",
    "Copied Link(accordion)(aria-label)": "已复制链接",
    "Copied Markdown(page actions)": "已复制 Markdown",
    "Copied Text(code block)(aria-label)": "已复制文本",
    "Copy Anchor Link(heading anchor)(aria-label)": "复制锚点链接",
    "Copy Link(accordion)(aria-label)": "复制链接",
    "Copy Markdown(page actions)": "复制 Markdown",
    "Copy Text(code block)(aria-label)": "复制文本",
    "Dark(theme switcher)(aria-label)": "深色",
    "Default(type table)": "默认值",
    "Edit on GitHub(edit page)": "在 GitHub 上编辑",
    "Hide Sidebar(sidebar)": "隐藏侧栏",
    "Last updated on(page footer)": "最后更新于",
    "Layout Tab(layout tab trigger)": "布局标签页",
    "Light(theme switcher)(aria-label)": "浅色",
    "Next Page(pagination)": "下一页",
    "No Headings(table of contents)": "没有标题",
    "No results found(search dialog)": "未找到结果",
    "On this page(table of contents)": "本页内容",
    "Open Search(search trigger)(aria-label)": "打开搜索",
    "Open Sidebar(sidebar)(aria-label)": "打开侧栏",
    "Open in ChatGPT(page actions)": "在 ChatGPT 中打开",
    "Open in Claude(page actions)": "在 Claude 中打开",
    "Open in Cursor(page actions)": "在 Cursor 中打开",
    "Open in GitHub(page actions)": "在 GitHub 中打开",
    "Open in Scira AI(page actions)": "在 Scira AI 中打开",
    "Open(page actions)": "打开",
    "Page Not Found(404 page)": "找不到页面",
    "Parameters(type table)": "参数",
    "Previous Page(pagination)": "上一页",
    "Prop(type table)": "属性",
    "Read {url}, I want to ask questions about it.(page actions)":
      "请阅读 {url}，我想就其中的内容提问。",
    "Returns(type table)": "返回值",
    "Search(search dialog)": "搜索",
    "Search(search trigger)": "搜索",
    "Show Sidebar(sidebar)": "显示侧栏",
    "System(theme switcher)(aria-label)": "跟随系统",
    "Table of Contents(inline table of contents)": "目录",
    "The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 page)":
      "你要查找的页面可能已被移除、已更改名称，或暂时无法访问。",
    "Toggle Menu(mobile menu)(aria-label)": "切换菜单",
    "Toggle Theme(theme switcher)(aria-label)": "切换主题",
    "Type(type table)": "类型",
    "View as Markdown(page actions)": "以 Markdown 格式查看",
  },
};
