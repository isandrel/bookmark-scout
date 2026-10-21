{# source: 755c10623769 #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="{{ site.name }} 標誌" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">幾秒內將每個網頁儲存到正確的書籤資料夾。</h3>

<p align="center">
  輸入資料夾名稱中的幾個字，或按下快捷鍵，網頁就會儲存到它所屬的資料夾。<br>
  完全免費，不需要帳戶，也沒有廣告。不會傳送任何資料給開發人員。
</p>

<p align="center">
{{ md.store_badges("加到 {browser}") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/網站-前往-{{ site.brand_color }}?style=flat-square" alt="網站"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/使用指南-閱讀-{{ site.brand_color }}?style=flat-square" alt="使用指南"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/開放原始碼-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="開放原始碼授權"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="{{ site.name }} 彈出式視窗：輸入「fin」就會找到 AI / LLMs 中的 Fine-tuning 資料夾，按 Enter 即可將網頁儲存到那裡。旁邊是針對一篇提示快取文章的選用 AI 建議，其中包括一個新資料夾。" width="800">
  </picture>
</p>

## ✨ 功能

- 📁 **輸入名稱，儲存到正確的資料夾。** 輸入幾個字後按 Enter 即可，即使是藏在其他資料夾深處的資料夾也找得到。有小小的拼字錯誤也沒關係。
- ⚡ **按下快捷鍵就能儲存。** 在任何網頁上按 {{ shortcuts["commands.quick-save"].both }}。畫面上會出現一則小通知，說明網頁儲存到哪裡，並提供 **復原** 和可改為移動到的其他資料夾。
- 🔎 **找出儲存過的所有內容。** 從工具列、側邊面板或整頁顯示的書籤管理員，邊輸入邊搜尋所有書籤。
- 🧹 **整理多年累積的書籤。** 移除重複的書籤、找出已經失效的連結，並清除網址中的追蹤碼。每項變更都會先讓你確認，之後也能復原。
- 🕘 **查看每一項變更，找回刪除的書籤。** 記錄會列出書籤的每一項變更，包括在 Bookmark Scout 之外做的變更，即使瀏覽器重新啟動後，也能還原刪除的內容。記錄只會儲存在你的電腦上。
- ✨ **選用的 AI 建議。** 讓 AI 為你挑選資料夾：可以使用自己的 AI 帳戶，或在自己電腦上執行的免費 AI 模型，例如 Chrome 內建的 AI。在你開啟之前，AI 會一直維持關閉。
- 🔒 **從設計上保護隱私。** 不需要帳戶、沒有廣告、沒有追蹤，也不會傳送任何資料給開發人員。儲存和搜尋甚至可以離線使用。

🌍 支援語言：{{ locales|map(attribute="name")|join(" · ") }}

## 📦 安裝

{{ md.store_links("即將在 {store} 上架。在此之前，可以[手動安裝]({docs}/installation#{id}) (進階)。") }}

接著儲存第一個網頁：

1. **固定到工具列。** 按一下瀏覽器工具列中的拼圖圖示，然後按一下 {{ site.name }} 旁邊的圖釘。
2. **開啟想保留的網頁**，然後按一下 {{ site.name }} 圖示。
3. **輸入資料夾名稱中的幾個字**，然後按 Enter：網頁就會儲存到清單中的第一個資料夾。如要選擇其他資料夾，請先按 ↓。這樣就完成了。

下次只要在網頁上按 {{ shortcuts["commands.quick-save"].both }}即可。詳情請參閱「[儲存和整理指南]({{ docs_url }}/guides/save-and-organize)」。

## 🔒 隱私權

{{ site.name }} 不需要帳戶，也沒有伺服器，因此開發人員永遠不會收到你的書籤、設定或任何其他資料。書籤的讀取和變更都在瀏覽器中進行。只有在使用需要連線的功能時，資料才會離開瀏覽器，例如 AI (傳送到你選擇的 AI 公司) 或失效連結檢查 (連線到加入書籤的網站)。詳情請參閱[隱私權政策]({{ pages.privacy }})。

## 🔐 權限

瀏覽器會要求的權限：

- **安裝時：**「讀取及變更你的書籤」。這是 {{ site.name }} 開始運作唯一需要的權限。
- **只有在使用需要更多權限的功能時**，{{ site.name }} 才會先簡短說明，再由瀏覽器提出要求。例如，檢查失效連結時會要求連線到那些網站，從側邊面板儲存時會要求查看目前開啟的分頁。如果拒絕，只有該功能無法使用。

請參閱[所有權限及需要的原因]({{ docs_url }}/permissions)。

## ❓ 常見問題

**真的免費嗎？**<br>
是的。沒有廣告、沒有付費方案，程式碼也公開讓任何人閱讀。如果使用 AI 公司的帳戶開啟 AI，該公司可能會向你收取使用費用。

**一定要使用 AI 嗎？**<br>
不用。儲存、搜尋和清理都不需要 AI 就能使用。

**可以在 Firefox、Edge 或 Safari 中使用嗎？**<br>
Firefox 和 Edge：可以 (請參閱「[安裝](#-安裝)」)。Safari：不行，因為 Safari 不允許擴充功能存取書籤。

更多解答請參閱[常見問題]({{ docs_url }}/faq)。

## 💬 說明和連結

- 🌐 網站：[{{ site.url }}]({{ site.url }})
- 📖 使用指南：[{{ docs_url }}]({{ docs_url }})
- ✉️ 電子郵件：[{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 發現問題或有任何想法？[請在 GitHub 上告訴我們]({{ site.repo.new_issue }})

{{ site.name }} 由獨立開發人員 [@{{ site.author.name }}]({{ site.author.url }}) 製作，沒有公司背景：沒有廣告、不需要帳戶，而且開放原始碼。

## 🛠️ 給開發人員和 AI 代理

從原始碼建置、技術堆疊、專案狀態和測試，請參閱 [DEVELOPMENT.md]({{ links.DEVELOPMENT }}) (英文)。如果想參與貢獻，請閱讀 [CONTRIBUTING.md]({{ links.CONTRIBUTING }})。你電腦上的 AI 程式設計代理 (例如 Claude Code) 在你核准後，也能搜尋和整理你的書籤：請參閱「[搭配本機 AI 代理使用]({{ docs_url }}/guides/local-agents)」。

---

<p align="center">
  依 <a href="{{ root }}LICENSE">{{ site.license.spdx }} 授權</a>免費提供且開放原始碼。
</p>
