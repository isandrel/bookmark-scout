# Traditional Chinese (Taiwan) Listing Copy (繁體中文)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-08 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 57 |
| Firefox Add-ons summary | 70 |
| Full description, Chrome and Edge | 1,577 |
| Full description, Firefox | 706 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/zh_TW/messages.json`. The brand name is not translated.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

`extDescription`; changing it needs a new version:

```text
搜尋、整理及清理書籤：快速搜尋、儲存至資料夾、重複書籤與失效連結工具，以及使用自備金鑰、需自行啟用的 AI 功能。
```

### Firefox Add-ons summary (250 characters maximum)

```text
從工具列搜尋和整理書籤：即時搜尋、支援拖放的資料夾樹狀結構、一鍵儲存至任何資料夾，以及需自行啟用、使用自選供應商和金鑰的 AI 資料夾建議。
```

## Search terms (Edge Add-ons)

```text
書籤管理
書籤搜尋
重複書籤
失效連結
書籤資料夾
AI 書籤
書籤匯入匯出
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
Bookmark Scout 可以在不離開瀏覽器的情況下，尋找、歸檔和整理書籤。

從工具列搜尋和儲存
• 即時搜尋所有書籤，並提供大小寫須相符、全字拼寫須相符和規則運算式選項
• 資料夾樹狀結構，支援拖放、全部展開和全部收合，以及建立新資料夾
• 一鍵將目前網頁儲存至任何資料夾；已在該資料夾中的網頁不會重複儲存
• 側邊面板，提供相同的樹狀結構和搜尋功能
• 選用的右鍵選單 (在「設定」中開啟「右鍵選單」)，可將連結儲存至最近使用的資料夾
• 鍵盤快速鍵絕不會搶用瀏覽器的 Ctrl/Cmd 快速鍵
• 刪除前會顯示確認對話方塊 (預設開啟)，並可在 10 秒內復原

書籤管理員
Bookmark Scout 會以自己的管理員取代瀏覽器的「書籤」頁面，提供資料夾樹狀結構、路徑導覽、可排序和篩選的表格、可調整寬度的欄位，以及已儲存的搜尋 (只儲存篩選條件、一律顯示最新結果的智慧檢視)。

維護工具
• 重複書籤清理工具：先確認重複群組，再移除多餘的副本
• 網址清理工具：預覽並移除追蹤參數
• 失效連結檢查工具：找出無法連線的連結，再確認修復方式 (刪除、改用重新導向的目的地、指向封存副本或編輯網址)，並可復原
• 中繼資料擷取工具：建議網頁標題，只套用選取的項目
• 隱私掃描工具：找出書籤中的敏感查詢參數、網址片段、電子郵件地址和 UUID
• 統計資料：網域、資料夾、層級深度和重複項目
• 重新整理網站圖示：直接取得每個網站本身的圖示，不使用第三方圖示服務
• 從 HTML 或 JSON 匯入，提供預覽、重複項目處理方式和復原功能
• 匯出為 HTML、JSON、Markdown 或 CSV，並可選擇先進行隱私確認，遮蔽敏感值

失效連結檢查工具、中繼資料擷取工具、重新整理網站圖示，以及 AI 設定中的「讀取網頁內容」，會在第一次使用時要求選用的網站存取權。安裝時絕不會授予這項權限，要求不會附帶 Cookie，而且拒絕授權只會讓該功能維持關閉。

需自行啟用的 AI 工具 (預設關閉)
在「設定」中開啟 AI，然後選擇雲端 AI 供應商、任何與 OpenAI 相容的端點，或在自己電腦上執行的模型伺服器；如果供應商需要 API 金鑰，請使用自己的金鑰。
• 為目前網頁建議資料夾，包括確認後建立新的資料夾路徑
• 建議標籤和簡短摘要，確認後才儲存
• 資料夾重組計畫，在做任何變更前先預覽 (預設)
• 將所選書籤匯出為 Markdown 或 XML 格式的脈絡，供 AI 對話使用 (不需要 AI，也不會傳送任何資料)
• 詢問 AI：針對書籤進行對話；AI 可以查詢相符的書籤、資料夾名稱和目前網頁
• 讀取網頁內容 (預設關閉)：除了標題和網址，也傳送每個網頁的可讀文字，以獲得更好的建議

使用 AI 功能時，所需的資料會直接從瀏覽器傳送到所選的供應商，並受該供應商的條款規範：書籤標題、網址、資料夾名稱，以及已儲存的標籤和摘要；目前網頁的標題和網址；傳給「詢問 AI」的訊息；以及只有在開啟「讀取網頁內容」時，相關網頁的文字。不會傳送任何資料給 Bookmark Scout。API 金鑰儲存在這個瀏覽器的本機擴充功能儲存空間中，不會同步。使用供應商的服務可能需要付費。

隱私權
• 不需要帳戶，沒有分析、追蹤或廣告
• 書籤保留在瀏覽器中；標籤、摘要和已儲存的搜尋保留在本機擴充功能儲存空間中
• 在支援的瀏覽器上，設定會透過瀏覽器帳戶同步
• 以 AGPL-3.0 授權的開放原始碼軟體：https://github.com/isandrel/bookmark-scout

提供 9 種介面語言。可選擇淺色、深色或系統主題。

說明文件：https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout 可以在不離開瀏覽器的情況下，尋找和歸檔書籤。

從工具列搜尋和儲存
• 即時搜尋所有書籤，並提供大小寫須相符、全字拼寫須相符和規則運算式選項
• 資料夾樹狀結構，支援拖放、全部展開和全部收合，以及建立新資料夾
• 一鍵將目前網頁儲存至任何資料夾；已在該資料夾中的網頁不會重複儲存
• 從右鍵選單將連結儲存至最近使用的資料夾
• 鍵盤快速鍵絕不會搶用瀏覽器的 Ctrl/Cmd 快速鍵
• 刪除前會顯示確認對話方塊 (預設開啟)，並可在 10 秒內復原

需自行啟用的 AI 資料夾建議 (預設關閉)
在「設定」中開啟 AI，然後選擇雲端 AI 供應商、任何與 OpenAI 相容的端點，或在自己電腦上執行的模型伺服器；如果供應商需要 API 金鑰，請使用自己的金鑰。接著，Bookmark Scout 會為目前網頁建議資料夾，並可在確認後建立新的資料夾路徑。

要求建議時，目前網頁的標題和網址以及資料夾名稱，會直接從瀏覽器傳送到所選的供應商，並受該供應商的條款規範。不會傳送任何資料給 Bookmark Scout。API 金鑰儲存在這個瀏覽器的本機擴充功能儲存空間中，不會同步。使用供應商的服務可能需要付費。

隱私權
• 不需要帳戶，沒有分析、追蹤或廣告
• 書籤保留在瀏覽器中
• 啟用 Firefox Sync 時，設定會同步
• 以 AGPL-3.0 授權的開放原始碼軟體：https://github.com/isandrel/bookmark-scout

提供 9 種介面語言。可選擇淺色、深色或系統主題。

書籤管理員可從工具列的彈出式視窗，在新分頁中開啟。
```

## Category

Same as `en.md`. Stores set the category once for all locales.

## Support and links

Same as [`en.md`](en.md#support-and-links). Where a store accepts a value per locale, use the Traditional Chinese pages once the website ships them (the path below assumes the BCP 47 tag `zh-TW`; until then, use the English pages):

| Field | Value |
| --- | --- |
| Support URL | https://bookmark-scout.com/zh-TW/support/ |
| Privacy policy URL | https://bookmark-scout.com/zh-TW/privacy/ |
| Support email | support@bookmark-scout.com |
