{# source: 100d02461807 #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
# 🤝 為 {{ site.name }} 做出貢獻

首先，感謝你考慮為 {{ site.name }} 做出貢獻。正是因為有你這樣的人，這個擴充功能才能讓每個人用得更好。

## 📋 目錄

- [行為準則](#-行為準則)
- [如何參與貢獻？](#-如何參與貢獻)
- [開發環境設定](#-開發環境設定)
- [Pull Request 流程](#-pull-request-流程)
- [風格指南](#-風格指南)
- [國際化](#-國際化)
- [有問題嗎？](#-有問題嗎)

## 📜 行為準則

本專案遵守[行為準則]({{ root }}CODE_OF_CONDUCT.md)。參與本專案時，請保持尊重且包容的態度。如發現不當行為，請透過 GitHub Issues 回報。

## 🎯 如何參與貢獻？

### 🐛 回報錯誤

建立錯誤回報之前，請先查看現有的 Issue，避免重複回報。

**回報錯誤時，請提供：**

- 瀏覽器及其版本 ({{ browsers|map(attribute="name")|join(", ") }})
- 擴充功能版本
- 重現步驟
- 預期的行為與實際的行為
- 螢幕截圖 (如果適用)

請使用我們的[錯誤回報範本]({{ root }}.github/ISSUE_TEMPLATE/01-bug-report.yml)。

### ✨ 建議功能

我們非常歡迎功能建議。請使用我們的[功能要求範本]({{ root }}.github/ISSUE_TEMPLATE/02-feature-request.yml)。

**好的功能要求包含：**

- 清楚說明問題
- 提議的解決方案
- 考慮過的其他做法

### 🔧 貢獻程式碼

在找可以著手的工作嗎？請查看帶有以下標籤的 Issue：

- `good first issue` - 適合新手
- `help wanted` - 歡迎協助

## 💻 開發環境設定

如果只是想使用 {{ site.name }}，請依照 [README]({{ links.README }}#-安裝) 的說明，從瀏覽器的商店或 GitHub 版本發布安裝。以下步驟是為了開發而從原始碼建置。技術堆疊、功能狀態、發行版本建置和專案結構，請參閱 [DEVELOPMENT.md]({{ links.DEVELOPMENT }})。

### 必要條件

- [Bun](https://bun.sh) (最新版本)
- [mise](https://mise.jdx.dev/)，用於管理執行環境
- 以下任一瀏覽器：{{ browsers|map(attribute="name")|join(", ") }}

### 安裝

```bash
# 複製 (clone) 存放區
git clone {{ site.repo.url }}.git
cd {{ site.repo.name }}

# 安裝相依套件
bun install

# 啟動開發伺服器 (Chrome)
bun run dev
```

### 建置

```bash
# 為所有瀏覽器建置
bun run build

# 為 Chrome 建置
bunx nx run extension:build:chrome

# 為 Firefox 建置
bun run build:firefox

# 為 Edge 建置
bun run build:edge
```

### 載入擴充功能

**Chrome/Edge：**

1. 前往 `chrome://extensions` 或 `edge://extensions`
2. 開啟「開發人員模式」
3. 按一下「載入未封裝項目」(Edge 中為「載入解壓縮」)
4. 選取 `apps/extension/dist/chrome-mv3` (Chrome) 或 `apps/extension/dist/edge-mv3` (Edge)

**Firefox：**

1. 前往 `about:debugging#/runtime/this-firefox`
2. 按一下「載入暫用附加元件」
3. 選取 `apps/extension/dist/firefox-mv2` 中的 `manifest.json` 檔案

## 🔄 Pull Request 流程

### 開始之前

1. **與 main 同步**：開始工作前，一律先以 rebase 方式 pull
   ```bash
   git checkout {{ site.repo.branch }}
   git pull --rebase origin {{ site.repo.branch }}
   ```

2. **建立 Issue**：重大變更請先討論再實作

3. **建立分支**：使用慣例命名
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### Commit 訊息

我們使用 [Conventional Commits](https://www.conventionalcommits.org/) 搭配 [Gitmoji](https://gitmoji.dev/)：

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| Emoji | 類型       | 說明             |
| ----- | ---------- | ---------------- |
| ✨    | `feat`     | 新功能           |
| 🐛    | `fix`      | 錯誤修正         |
| 📝    | `docs`     | 說明文件         |
| 💄    | `style`    | UI/樣式          |
| ♻️     | `refactor` | 程式碼重構       |
| ⚡    | `perf`     | 效能             |
| ✅    | `test`     | 測試             |
| 🔧    | `chore`    | 維護             |

### 建立 Pull Request

1. **推送分支**
   ```bash
   git push -u origin feat/123-description
   ```

2. **透過 GitHub CLI 建立 PR**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base {{ site.repo.branch }}
   ```

3. **等待 CI 檢查**通過

4. **處理審查意見** (如果有)

### PR 檢查清單

- [ ] 程式碼符合專案的風格指南
- [ ] 已完成自我審查
- [ ] 已完成相關的 lint/建置驗證
- [ ] 變更的區域有測試套件時，已視需要新增或更新測試
- [ ] 已視需要更新說明文件
- [ ] 已連結到相關的 Issue

## 📐 風格指南

### 程式碼風格

我們使用 [Biome](https://biomejs.dev/) 進行 lint 和格式化。

```bash
# 執行 lint 檢查
bun run lint

# 只執行擴充功能的 lint
bunx nx run extension:lint

# 執行擴充功能的所有測試 (會建置 Chrome 並安裝 Playwright 的 Chromium)
bun run test
```

這個測試指令會執行單元測試和無頭模式的 Chromium E2E 測試套件 (彈出式視窗、側邊面板、書籤管理員、設定、快速儲存、維護、報告、匯入和匯出、詢問 AI，以及跨介面的操作流程)。CI 會執行相同的測試套件，不需要手動設定瀏覽器，另外還會執行 Edge 測試套件和 Firefox 冒煙測試套件。依賴網路和 AI 供應商的流程都會離線執行：標題為 `[mocked provider contract]` 的測試會以 stub 取代 AI 供應商 (Vitest 的 `ai` 模擬，以及透過 Playwright 路由的 OpenAI 相容端點)，並以路由模擬網路擷取。這些測試驗證的是 {{ site.name }} 的要求和回應合約、需自行啟用的限制，以及錯誤處理，而不是與實際供應商或網站的相容性。

其他測試套件，用於它們涵蓋的變更：

```bash
# Edge 和 Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# 本機 AI 代理：先執行 MCP 橋接程式本身的測試，再以 Chromium 中的擴充功能
# 測試編譯後的 bookmark-scout-mcp (Linux 和 macOS)
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# 大型書籤庫上的延遲和捲動；請在影響速度的變更前後各執行一次
bunx nx run extension:test:perf

# 針對實際供應商的 AI 功能；未設定 BS_LIVE_AI_* 變數時會略過
# (請參閱 apps/extension/tests/live/README.md)
bunx nx run extension:test:live
```

擴充功能或 `packages/mcp-bridge` 有所變更時，CI 會執行橋接測試；效能測試套件每日執行，即時 AI 測試套件則只在需要時執行。

### Chrome 內建 AI

**內建 AI** 服務會在你的電腦上執行 Chrome 自己的模型 (Gemini Nano，也就是 Prompt API 的 `LanguageModel`)。單元測試和 E2E 測試使用假的 `LanguageModel` (`tests/unit/fake-language-model.ts`、`tests/e2e/builtin-ai.spec.ts`)；實際的模型則以手動方式檢查：

1. 在符合 [Chrome 硬體需求](https://developer.chrome.com/docs/ai/get-started#hardware)的電腦上使用 Chrome 138 以上版本。「設定」>「AI」中該服務下方的 **檢查這台電腦** 會將這台電腦與這些需求比較。如要在效能較低的電腦上試用，請將 `chrome://flags/#optimization-guide-on-device-model` 設為 **Enabled BypassPerfRequirement**，然後重新啟動 Chrome。
2. `bun run dev` 開啟的瀏覽器會回報模型無法使用。請以下方的參數啟動它，或關閉執行器，並在你自己的 Chrome 設定檔中從 `chrome://extensions` 載入 `apps/extension/dist/chrome-mv3-dev`。請勿將這個每位開發人員各自使用的檔案加入 Git：`apps/extension/web-ext.config.ts` 已被忽略。

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // 或改用你自己的設定檔：disabled: true,
   });
   ```

3. 在 **設定** > **AI** 中，按一下 **使用內建 AI**，然後按一下 **下載模型**。`chrome://on-device-internals` 會顯示模型的狀態和下載進度，也能直接傳送提示給模型；但必須先在 `chrome://chrome-urls` 開啟 Chrome 的內部偵錯頁面，Chrome 才會開啟這個頁面。
4. 開啟 **AI 功能** 和 **記錄要求**，在某個網頁上開啟彈出式視窗，然後按一下資料夾建議按鈕。**AI 活動** 會將提示顯示為 `ON-DEVICE`。
5. 在網頁上按兩次 AI 快速儲存快捷鍵。兩次儲存都會出現在 **AI 活動** 中；第二次會比較快，因為 AI 主機頁面 (一個螢幕外文件，列在 `chrome://extensions` 中擴充功能的檢視項目下) 會在 `apps/extension/config/ai/built-in.toml` 的 `[quick_save] idle_timeout_ms` 期間內保持指示已載入。

### TypeScript

- 所有新程式碼都使用 TypeScript
- 物件型別優先使用 `type` 而非 `interface`
- 函式使用明確的回傳型別

### React 元件

- 使用搭配 hooks 的函式元件
- 讓元件保持精簡且專注
- 使用具描述性的 prop 名稱

### 檔案組織

```
apps/extension/src/
├── components/     # Reusable UI components
├── hooks/          # Custom React hooks
├── services/       # Bookmark actions, AI, browser integrations, import/export
├── stores/         # Zustand stores
├── lib/            # Storage, schemas, and low-level helpers
├── types/          # TypeScript types
└── entrypoints/    # Extension entry points
```

`packages/mcp-bridge` 包含 `bookmark-scout-mcp`，也就是本機 AI 代理使用的 MCP 伺服器和原生訊息傳遞主機；它傳給擴充功能的訊息定義在 `packages/mcp-bridge/src/protocol.ts`。

## 🌐 國際化

新增使用者看得到的文字時：

1. 將字串加到 `apps/extension/public/_locales/<locale>/messages.json`
2. 將字串加到 `config/project.toml` 中 `[locales] extension` 所列的每個語言
3. 使用現有的 i18n 輔助函式：`t("message_key")`

`README.md`、本指南，以及它們在 `i18n/<language>/` 中的翻譯，都是從 `templates/` 產生的：請編輯範本，切勿編輯產生的檔案。請參閱「[Generated Markdown]({{ links.DEVELOPMENT }}#-generated-markdown)」(英文)。

## 🤔 有問題嗎？

- 查看現有的 [Issue]({{ site.repo.url }}/issues)
- 發起[討論]({{ site.repo.url }}/discussions)
- 建立[問題 Issue]({{ root }}.github/ISSUE_TEMPLATE/04-question.yml)

## 🙏 感謝你！

每一份貢獻都能讓 {{ site.name }} 變得更好，無論是：

- 🐛 回報錯誤
- ✨ 建議功能
- 📝 改善說明文件
- 🔧 撰寫程式碼
- 🌐 翻譯

感謝你付出的時間和心力。
