# Japanese Listing Copy (日本語)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-01 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 73 |
| Firefox Add-ons summary | 114 |
| Full description, Chrome and Edge | 1,720 |
| Full description, Firefox | 943 |

## Name

```text
ブックマークスカウト
```

Read from `extName` in `apps/extension/public/_locales/ja/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged today:

```text
ブックマークを素早く検索し、特定のフォルダに保存します。
```

Optional replacement (requires editing `extDescription` and a new version):

```text
ブックマークを素早く検索・整理・掃除。フォルダへのワンクリック保存、重複やリンク切れの検出、自分の API キーで使えるオプトインの AI 機能。
```

### Firefox Add-ons summary (250 characters maximum)

```text
ツールバーからブックマークを検索・整理。即時検索、ドラッグ＆ドロップ対応のフォルダツリー、任意のフォルダへのワンクリック保存に加え、自分で選んだプロバイダーと API キーで使えるオプトインの AI フォルダ提案を備えています。
```

## Search terms (Edge Add-ons)

```text
ブックマーク管理
ブックマーク検索
重複ブックマーク
リンク切れ
ブックマーク フォルダ
AI ブックマーク
ブックマーク インポート
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
Bookmark Scout（ブックマークスカウト）は、ブラウザを離れずにブックマークを探し、保存し、整理できる拡張機能です。

ツールバーから検索と保存
• すべてのブックマークを即時検索（大文字と小文字の区別、単語単位、正規表現に対応）
• ドラッグ＆ドロップ、すべて展開／折りたたみ、新規フォルダ作成ができるフォルダツリー
• 表示中のページを任意のフォルダにワンクリックで保存（同じフォルダには重複保存しません）
• 右クリックメニュー（設定で「コンテキストメニュー」をオン）からリンクを最近使ったフォルダに保存
• 同じツリーと検索を使えるサイドパネル
• ブラウザの Ctrl/Cmd ショートカットを妨げないキーボードショートカット
• 確認ダイアログ（既定でオン）と 10 秒間の元に戻す付きの削除

ブックマークマネージャー
ブラウザの「ブックマーク」ページを、フォルダツリー、パンくずリスト、並べ替えと絞り込みができる表、幅を変えられる列、保存した検索（条件だけを保存し、常に最新の結果を表示するスマートビュー）を備えたマネージャーに置き換えます。

メンテナンスツール
• 重複クリーナー：重複グループを確認してから余分なコピーを削除
• URLクリーナー：トラッキングパラメータの削除をプレビューして適用
• リンク切れチェック：アクセスできないリンクを検出し、修復（削除、リダイレクト先の使用、アーカイブ版へのリンク、URL の編集）を確認してから適用、元に戻すも可能
• メタデータ取得：ページタイトルを提案し、選んだものだけを適用
• プライバシースキャナー：ブックマーク内の機密性の高いクエリパラメータ、URL フラグメント、メールアドレス、UUID を検出
• 統計：ドメイン、フォルダ、階層の深さ、重複
• サイトアイコンを更新：サードパーティのアイコンサービスを使わず、各サイト自身のアイコンを取得
• HTML または JSON からのインポート（プレビュー、重複の扱いの選択、元に戻すに対応）
• HTML、JSON、Markdown、CSV へのエクスポート（機密値を伏せ字にできるプライバシー確認付き）

リンク切れチェック、メタデータ取得、サイトアイコンを更新、および AI 設定の「ページの内容を読む」は、初回使用時にウェブサイトへのアクセス（任意の権限）を求めます。インストール時には付与されず、リクエストは Cookie なしで送信され、拒否した場合はその機能がオフのままになります。

オプトインの AI ツール（既定でオフ）
設定で AI を有効にし、OpenAI、Anthropic、Google、Groq、Mistral、DeepSeek、OpenRouter、Ollama、CLIProxyAPI、または OpenAI 互換のエンドポイントを選びます。API キーが必要なプロバイダーでは自分のキーを使います。
• 表示中のページに合うフォルダの提案（新しいフォルダパスも確認後に作成）
• 保存前に確認できるタグ候補と短い要約
• フォルダ再編成プラン（既定では適用前にプレビュー）
• 選択したブックマークを AI チャット用の Markdown または XML としてエクスポート（AI なしで使え、何も送信しません）
• AI に質問：ブックマークについてチャットでき、AI は該当するブックマーク、フォルダ名、表示中のページを参照できます
• ページの内容を読む（既定でオフ）：タイトルと URL に加えて各ページの本文も送信し、提案の精度を高めます

AI 機能を使うと、その機能に必要なデータがブラウザから選択したプロバイダーへ直接送信され、そのプロバイダーの規約に従って扱われます。送信されるのは、ブックマークのタイトル、URL、フォルダ名、保存したタグと要約、表示中のページのタイトルと URL、「AI に質問」のメッセージ、そして「ページの内容を読む」をオンにした場合のみ対象ページの本文です。Bookmark Scout には何も送信されません。API キーはこのブラウザのローカル拡張機能ストレージに保存され、同期されません。プロバイダーの利用には料金がかかる場合があります。

プライバシー
• アカウント登録、アナリティクス、トラッキング、広告はありません
• ブックマークはブラウザ内にとどまり、タグ、要約、保存した検索はローカル拡張機能ストレージに保存されます
• 設定は、対応するブラウザではブラウザのアカウントを通じて同期されます
• AGPL-3.0 のオープンソース：https://github.com/isandrel/bookmark-scout

英語、日本語、韓国語に対応。ライト、ダーク、システムのテーマを選べます。

ドキュメント：https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout（ブックマークスカウト）は、ブラウザを離れずにブックマークを探して保存できる拡張機能です。

ツールバーから検索と保存
• すべてのブックマークを即時検索（大文字と小文字の区別、単語単位、正規表現に対応）
• ドラッグ＆ドロップ、すべて展開／折りたたみ、新規フォルダ作成ができるフォルダツリー
• 表示中のページを任意のフォルダにワンクリックで保存（同じフォルダには重複保存しません）
• 右クリックメニューからリンクを最近使ったフォルダに保存
• ブラウザの Ctrl/Cmd ショートカットを妨げないキーボードショートカット
• 確認ダイアログ（既定でオン）と 10 秒間の元に戻す付きの削除

オプトインの AI フォルダ提案（既定でオフ）
設定で AI を有効にし、OpenAI、Anthropic、Google、Groq、Mistral、DeepSeek、OpenRouter、Ollama、CLIProxyAPI、または OpenAI 互換のエンドポイントを選びます。API キーが必要なプロバイダーでは自分のキーを使います。表示中のページに合うフォルダを提案し、確認後に新しいフォルダパスを作成することもできます。

提案を求めると、表示中のページのタイトルと URL、およびフォルダ名が、ブラウザから選択したプロバイダーへ直接送信され、そのプロバイダーの規約に従って扱われます。Bookmark Scout には何も送信されません。API キーはこのブラウザのローカル拡張機能ストレージに保存され、同期されません。プロバイダーの利用には料金がかかる場合があります。

プライバシー
• アカウント登録、アナリティクス、トラッキング、広告はありません
• ブックマークはブラウザ内にとどまります
• 設定は Firefox Sync が有効な場合に同期されます
• AGPL-3.0 のオープンソース：https://github.com/isandrel/bookmark-scout

英語、日本語、韓国語に対応。ライト、ダーク、システムのテーマを選べます。

ブックマークマネージャーは、ツールバーのポップアップから新しいタブで開けます。
```

## Category

Same as `en.md`. Stores set the category once for all locales.

## Support and links

Same as [`en.md`](en.md#support-and-links). Where a store accepts a value per locale, use the Japanese pages:

| Field | Value |
| --- | --- |
| Support URL | https://bookmark-scout.com/ja/support/ |
| Privacy policy URL | https://bookmark-scout.com/ja/privacy/ |
| Support email | support@bookmark-scout.com |
