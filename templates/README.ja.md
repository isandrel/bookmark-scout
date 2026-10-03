<p align="center">
  <a href="../README.md">English</a> ·
  <strong>日本語</strong> ·
  <a href="./README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/{{GITHUB_REPO}}/{{DEFAULT_BRANCH}}/apps/extension/public/icon-128.png" alt="{{SITE_NAME}} Logo" width="80" height="80">
</p>

<h1 align="center">🔖 {{SITE_NAME}}</h1>

<p align="center">
  <strong>{{SITE_DESCRIPTION}}</strong>
</p>

<p align="center">
  <a href="{{LICENSE_FILE_URL}}"><img src="https://img.shields.io/badge/license-{{LICENSE_BADGE}}-blue?style=flat-square" alt="ライセンス"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/stargazers"><img src="https://img.shields.io/github/stars/{{GITHUB_REPO}}?style=flat-square" alt="スター"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/releases"><img src="https://img.shields.io/github/v/release/{{GITHUB_REPO}}?style=flat-square" alt="リリース"></a>
  <a href="{{SITE_URL}}"><img src="https://img.shields.io/badge/website-live-brightgreen?style=flat-square" alt="ウェブサイト"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-{{VERSION:react}}-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-{{VERSION:typescript}}-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/WXT-{{VERSION:wxt}}-646CFF?style=flat-square&logo=vite&logoColor=white" alt="WXT">
  <img src="https://img.shields.io/badge/Vite-{{VERSION:vite}}-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/TailwindCSS-{{VERSION:tailwindcss}}-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/Zustand-{{VERSION:zustand}}-764ABC?style=flat-square" alt="Zustand">
  <img src="https://img.shields.io/badge/shadcn%2Fui-{{VERSION:shadcn-ui}}-000000?style=flat-square" alt="shadcn/ui">
  <img src="https://img.shields.io/badge/Nx-{{VERSION:nx}}-143055?style=flat-square&logo=nx&logoColor=white" alt="Nx">
  <img src="https://img.shields.io/badge/Bun-{{VERSION:bun}}-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/Biome-{{VERSION:@biomejs/biome}}-60A5FA?style=flat-square" alt="Biome">
</p>

<p align="center">
{{BROWSER_BADGES:対応}}
  <img src="https://img.shields.io/badge/Safari-非対応-999999?style=flat-square&logo=safari&logoColor=white" alt="Safari">
</p>

---

## 📚 ドキュメント

詳細なドキュメントは **[{{DOCS_URL}}]({{DOCS_URL}})** をご覧ください：

- **はじめに** — インストールとセットアップガイド
- **機能** — 詳細な機能ドキュメント
- **コントリビュート** — プロジェクトへの貢献方法

---

## 🌐 ウェブサイト

ランディングページとダウンロードリンクは **[{{SITE_URL}}]({{SITE_URL}})** をご覧ください。

---

## 🌐 ブラウザサポート

|                                                  ブラウザ                                                   | サポートレベル | 備考                          |
| :---------------------------------------------------------------------------------------------------------: | :------------: | ----------------------------- |
| ![Chrome](https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white) |  ⭐⭐⭐ 主要   | Manifest V3、全機能対応       |
|  ![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefox&logoColor=white)   |   ⭐⭐ 副次    | Manifest V2、サイドバー非対応 |
|  ![Edge](https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)   |   ⭐⭐ 副次    | Chromiumベース、完全互換      |
|    ![Safari](https://img.shields.io/badge/Safari-999999?style=for-the-badge&logo=safari&logoColor=white)    |   ❌ 非対応    | `bookmarks` API未実装         |

> **なぜSafariは非対応？** Safari Web Extensionsはこの拡張機能に不可欠な`browser.bookmarks` APIをサポートしていません。

---

## ✨ 機能

### ✅ 実装済み

- [x] 🤖 **AIフォルダ推薦** — OpenAI、Anthropic、Google AI、Groq、Mistral、DeepSeek、xAI、Azure OpenAI、OpenRouter、Ollama、CLIProxyAPI、models.dev カタログの約200のプロバイダー、またはカスタムOpenAI互換プロバイダーによるスマートなフォルダ提案。新しいフォルダの提案は確認ダイアログで確認し、確定すると不足しているフォルダを作成してページを保存
- [x] 🔍 **インスタント検索** — デバウンス検索とフォルダフィルタリングで素早く検索
- [x] 📂 **ドラッグ＆ドロップ** — 直感的なドラッグ＆ドロップで整理
- [x] ⚡ **クイック追加** — ワンクリックで任意のフォルダに保存
- [x] 📱 **サイドパネル** — Chromeのサイドパネルからアクセス
- [x] 🗂️ **フルブックマークマネージャー** — Chrome標準のブックマークページをカスタムのテーブル型マネージャーに置き換え
- [x] ⚙️ **オプションページ** — 外観、検索、動作、AI、メンテナンス、メタデータ、セキュリティ、分析、データ設定を構成
- [x] 🌙 **ダークモード** — ライト、ダーク、システムテーマ設定に対応
- [x] 🎯 **すべて展開/折りたたみ** — ネストフォルダを素早く操作
- [x] 📁 **フォルダ作成** — ポップアップから直接作成
- [x] ⌨️ **キーボードショートカット** — ポップアップでは `/` で検索、矢印キーでフォルダを移動・開閉、Enter で現在のページを保存。マネージャーでは `/` で絞り込み、`?` で一覧表示、Backspace または Alt+↑ で親フォルダへ、`j`/`k` で行を移動、`s` で保存した検索を開く
- [x] 🔖 **保存済み検索** — マネージャーのフィルター、並べ替え、フォルダの範囲を名前付きのスマートビューとして保存し、開く・名前変更・削除が可能。保存されるのは条件だけ（このデバイスのみ、同期なし）なので、結果は常に現在のブックマークを反映。削除されたフォルダは通知付きでスキップ
- [x] 🗑️ **アイテム削除** — ポップアップまたはマネージャーから削除。確認ダイアログ（既定で有効、設定でオフにできます）と10秒間の元に戻す操作に対応
- [x] 🔗 **重複クリーナー** — 設定可能な照合条件で重複ブックマークを検出して削除
- [x] 🧹 **URLクリーナー** — トラッキングパラメータの削除、クエリ文字列の正規化、変更プレビュー
- [x] 💀 **デッドリンクチェッカー** — 選択したブックマークの到達不能リンクをスキャンし、修復 (削除、リダイレクト先、アーカイブ版、URL 編集) を確認してから適用、元に戻すことも可能
- [x] 🧾 **メタデータ取得** — ページのタイトルと説明を取得し、選択したタイトルだけを適用。説明は確認用に表示されるだけで保存されません
- [x] 🖼️ **サイトアイコンを更新** — ブックマークした各サイトのアイコンを（第三者のアイコンサービスを使わずに）ダウンロードし、結果を確認してこのデバイスに保存。ブラウザにキャッシュがないサイトや Firefox でも実際のアイコンを表示
- [x] 🛡️ **プライバシースキャナー** — センシティブなクエリパラメータ、フラグメント、メール、UUIDを検出
- [x] 📊 **ブックマーク統計** — ドメイン、フォルダ、プロトコル、重複、階層深度を集計
- [x] 📤 **インポート/エクスポート** — HTML、JSON、Markdown、CSVでエクスポートし、HTMLまたはJSONをインポート。インポート前にプレビューで保存先フォルダ、件数、重複を確認でき、重複をスキップするかすべてインポートするかを選べ、元に戻すこともできます。機密値を含むエクスポートとAIコンテキスト出力ではプライバシー確認が開き、元のファイル、伏せ字にしたコピー、またはキャンセルを選べます
- [x] 🧠 **AIツール** — LLM向けコンテキスト出力（有効にすると保存済みのタグと要約を含む）、タグ提案、要約、フォルダ再編成計画（既定では適用前にプレビュー）
- [x] 🖱️ **コンテキストメニュー保存** — 右クリックメニューから最近使ったフォルダまたは標準フォルダにリンクを保存
- [x] 🌍 **i18n** — 英語、日本語、韓国語対応
- [x] 🔄 **ブックマーク同期** — ブラウザ内蔵同期でクロスデバイス同期
- [x] ⚙️ **設定同期** — `chrome.storage.sync`で拡張機能の設定を同期

> **🤖 AI機能に関する注意事項**
>
> AIによる推薦とAIツールは**デフォルトで無効**であり、手動での有効化が必要です：
>
> 1. **設定 → AI** タブに移動
> 2. AI機能を有効にし、使用するプロバイダーを選択（OpenAI、Anthropic、Google、Groq、Mistral、DeepSeek、xAI、Azure OpenAI、OpenRouter、Ollama、CLIProxyAPI、またはカスタムOpenAI互換エンドポイント）
> 3. 選択したプロバイダーで必要な場合は、自分のAPIキーを入力
>
> ⚠️ **注意:** AI機能では、ブックマークのタイトル、URL、フォルダパス、選択したブックマークコンテキストが設定済みプロバイダーに送信される場合があります。プロバイダーによってはAPI使用料が発生する可能性があります。結果は実験的であり、破壊的な整理変更を適用する前に確認してください。

### 🟡 一部対応

- [x] 🏷️ **タグと要約** — ブックマーク詳細でタグと要約を保存・編集・削除したり、確認済みのAI提案を保存したりできます。このブラウザのローカル拡張機能ストレージにのみ保存され、同期・検索・ブックマークのエクスポートには含まれません（有効にするとAIコンテキスト出力には含まれます）
- [x] 🎛️ **AIツールの上限** — タグ数とスタイル、要約の長さ、再編成時のフォルダ上限はプロバイダーへの指示として送信され、出力がそれに従っているかは検証されません
- [x] 🦊 **FirefoxとEdge** — CIはEdgeでブラウザテスト全体を、Firefoxでスモークテスト（ポップアップ、サイドパネルのページ、マネージャー、設定、インポート/エクスポート、レポート）を実行します。この2つのジョブはまだ必須チェックではありません。Firefoxではブラウザのアイコンキャッシュを使えないため（ファビコンAPIがないため）、「サイトアイコンを更新」で保存したアイコンか汎用アイコンを表示します。また、ブックマークページを置き換えられないため、マネージャーはポップアップの「ブックマークマネージャーを開く」から開きます

### 🚧 現在の注力領域

- [ ] 🧪 **ブラウザテスト** — Firefoxのスモークテストを全体のテストに近づける（コンテキストメニュー、ドラッグ＆ドロップ、ネットワークとAIツール）
- [ ] 🛒 **ストア配布** — 掲載文（英語・日本語・韓国語）、権限の説明、プライバシー開示、プライバシーポリシー草案、スクリーンショット、提出チェックリストを [`store/`](../store/) に用意済み。提出は手動で承認待ち。Firefox 版には恒久的なアドオン ID とデータ収集の宣言を設定済み

---

## 🛠️ 技術スタック

### フレームワーク＆言語

|                                                   テクノロジー                                                    | バージョン | 説明                       |
| :---------------------------------------------------------------------------------------------------------------: | :--------: | -------------------------- |
|        ![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)         |    {{VERSION:react}}    | UIライブラリ               |
| ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) |    {{VERSION:typescript}}     | 型安全なJavaScript         |
|    ![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)     |     {{VERSION:next}}     | ウェブサイトフレームワーク |

### ビルド＆ツール

|                                          テクノロジー                                           | バージョン | 説明                       |
| :---------------------------------------------------------------------------------------------: | :--------: | -------------------------- |
|  ![WXT](https://img.shields.io/badge/WXT-646CFF?style=for-the-badge&logo=vite&logoColor=white)  |    {{VERSION:wxt}}    | 拡張機能フレームワーク     |
| ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white) |     {{VERSION:vite}}      | ビルドツール               |
|    ![Nx](https://img.shields.io/badge/Nx-143055?style=for-the-badge&logo=nx&logoColor=white)    |     {{VERSION:nx}}     | モノレポ管理               |
|  ![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)   |    {{VERSION:bun}}     | JavaScriptランタイム       |
|             ![Biome](https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge)             |    {{VERSION:@biomejs/biome}}     | リンティング＆フォーマット |

### UI＆スタイリング

|                                                     テクノロジー                                                     | バージョン | 説明                        |
| :------------------------------------------------------------------------------------------------------------------: | :--------: | --------------------------- |
| ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) |    {{VERSION:tailwindcss}}     | ユーティリティファーストCSS |
|                  ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge)                   |    {{VERSION:shadcn-ui}}     | Base UIベースコンポーネント   |
|       ![Base UI](https://img.shields.io/badge/Base_UI-161618?style=for-the-badge)        |    {{VERSION:@base-ui/react}}     | ヘッドレスUIプリミティブ    |
| ![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)  |   {{VERSION:framer-motion}}    | アニメーションライブラリ    |
|                      ![Lucide](https://img.shields.io/badge/Lucide-F56565?style=for-the-badge)                       |    {{VERSION:lucide-react}}     | アイコンライブラリ          |

### 状態＆データ

|                                                      テクノロジー                                                      | バージョン | 説明               |
| :--------------------------------------------------------------------------------------------------------------------: | :--------: | ------------------ |
|                      ![Zustand](https://img.shields.io/badge/Zustand-764ABC?style=for-the-badge)                       |    {{VERSION:zustand}}     | 状態管理           |
|               ![TanStack Table](https://img.shields.io/badge/TanStack_Table-FF4154?style=for-the-badge)                |    {{VERSION:@tanstack/react-table}}    | ヘッドレステーブル |
| ![Pragmatic DnD](https://img.shields.io/badge/Pragmatic_DnD-0052CC?style=for-the-badge&logo=atlassian&logoColor=white) |    {{VERSION:@atlaskit/pragmatic-drag-and-drop}}     | ドラッグ＆ドロップ |

### デプロイ＆インフラ

|                                                   テクノロジー                                                    | バージョン | 説明                |
| :---------------------------------------------------------------------------------------------------------------: | :--------: | ------------------- |
|       ![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)       |     -      | CI/CD＆ホスティング |
| ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white) |     -      | CDN＆DNS            |

---

## 📦 インストール

### GitHubリリースから

[GitHubリリース](https://github.com/{{GITHUB_REPO}}/releases)から最新版をダウンロード：

```bash
# GitHub CLIでリリースアセットをダウンロード
gh release download --repo {{GITHUB_REPO}} --pattern "bookmark-scout-*-chrome.zip"

# Chrome ZIPファイルを展開
unzip bookmark-scout-*-chrome.zip -d bookmark-scout
```

リリースアセットはブラウザごとに公開されます：

- `bookmark-scout-*-chrome.crx` — Chromeのデベロッパーモードでのサイドロード用
- `bookmark-scout-*-chrome.zip` — Chromeの未パッケージ拡張機能またはWeb Storeパッケージ用
- `bookmark-scout-*-firefox.zip` — Firefoxの一時的なアドオン読み込み用
- `bookmark-scout-*-edge.zip` — Edgeの未パッケージ拡張機能用

### ソースから

```bash
# リポジトリをクローン
gh repo clone {{GITHUB_REPO}}
cd bookmark-scout

# 依存関係をインストール
bun install

# 拡張機能をビルド
bun run build
```

### Chromeにロード

1. `chrome://extensions/` を開く
2. **デベロッパーモード**を有効化（右上）
3. **パッケージ化されていない拡張機能を読み込む**をクリック
4. 展開したリリースフォルダ、またはソースからビルドした場合は`apps/extension/dist/chrome-mv3`を選択

---

## 🚀 開発

```bash
# 拡張機能の開発サーバーを起動
bun run dev

# ウェブサイトの開発サーバーを起動
bun run dev:website

# すべてをビルド
bun run build:all

# リント
bun run lint
```

---

## 📁 プロジェクト構造

```
bookmark-scout/
├── apps/
│   ├── extension/          # ブラウザ拡張機能 (WXT)
│   │   ├── src/
│   │   │   ├── components/ # Reactコンポーネント
│   │   │   ├── entrypoints/ # popup, sidepanel, options, bookmarks
│   │   │   ├── hooks/      # カスタムReact Hooks
│   │   │   ├── stores/     # Zustandストア
│   │   │   └── services/   # ブックマークAPIサービス
│   │   └── wxt.config.ts
│   ├── website/            # Next.jsマーケティングサイト
│   │   └── app/
│   └── docs/               # Fumadocsドキュメントサイト
│       └── content/docs/
├── packages/
│   └── config/             # 共有設定
├── config/
│   ├── project.toml        # 全アプリ共通のプロジェクト情報
│   └── web.toml            # ウェブサイトとドキュメントのホスティング
└── templates/              # READMEテンプレート
```

---

## 🔐 権限

| 権限           | 目的                               |
| -------------- | ---------------------------------- |
| `bookmarks`    | ブックマークの読み取りと書き込み   |
| `tabs`         | クイック追加用のタブ情報取得       |
| `favicon`      | ウェブサイトファビコン表示         |
| `storage`      | ユーザー設定を保存                 |
| `sidePanel`    | Chromeサイドパネル有効化           |
| `contextMenus` | 右クリックメニューからリンクを保存 |

---

## 🤝 コントリビューション

コントリビューションを歓迎します！ガイドラインは[CONTRIBUTING.md](../CONTRIBUTING.md)をご覧ください。

```bash
# リポジトリをフォークしてクローン
gh repo fork {{GITHUB_REPO}} --clone

# フィーチャーブランチを作成
git checkout -b feature/amazing-feature

# 変更をコミット
git commit -m 'feat: 素晴らしい機能を追加'

# プッシュしてPRを作成
git push origin feature/amazing-feature
gh pr create --title "feat: 素晴らしい機能を追加"
```

---

## 📄 ライセンス

このプロジェクトは**GNU Affero General Public License v3.0**の下でライセンスされています - 詳細は[LICENSE](../LICENSE)ファイルをご覧ください。

---

## ⭐ スター履歴

<a href="https://star-history.com/#{{GITHUB_REPO}}&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos={{GITHUB_REPO}}&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos={{GITHUB_REPO}}&type=Date" />
   <img alt="スター履歴チャート" src="https://api.star-history.com/svg?repos={{GITHUB_REPO}}&type=Date" />
 </picture>
</a>

---

<p align="center">
  <a href="{{AUTHOR_URL}}">{{AUTHOR_NAME}}</a> が ❤️ を込めて作成
</p>
