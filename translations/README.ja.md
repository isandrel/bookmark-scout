<p align="center">
  <a href="../README.md">English</a> ·
  <strong>日本語</strong> ·
  <a href="./README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/isandrel/bookmark-scout/main/apps/extension/public/icon-128.png" alt="Bookmark Scout Logo" width="80" height="80">
</p>

<h1 align="center">🔖 Bookmark Scout</h1>

<p align="center">
  <strong>A browser extension to quickly search, organize, and save bookmarks. Features drag-and-drop, instant search, and dark mode.</strong>
</p>

<p align="center">
  <a href="https://github.com/isandrel/bookmark-scout/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="ライセンス"></a>
  <a href="https://github.com/isandrel/bookmark-scout/stargazers"><img src="https://img.shields.io/github/stars/isandrel/bookmark-scout?style=flat-square" alt="スター"></a>
  <a href="https://github.com/isandrel/bookmark-scout/releases"><img src="https://img.shields.io/github/v/release/isandrel/bookmark-scout?style=flat-square" alt="リリース"></a>
  <a href="https://bookmark-scout.com"><img src="https://img.shields.io/badge/website-live-brightgreen?style=flat-square" alt="ウェブサイト"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/WXT-0.20-646CFF?style=flat-square&logo=vite&logoColor=white" alt="WXT">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/TailwindCSS-4.1-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/Zustand-5.0-764ABC?style=flat-square" alt="Zustand">
  <img src="https://img.shields.io/badge/shadcn%2Fui-0.9-000000?style=flat-square" alt="shadcn/ui">
  <img src="https://img.shields.io/badge/Nx-22.3-143055?style=flat-square&logo=nx&logoColor=white" alt="Nx">
  <img src="https://img.shields.io/badge/Bun-1.3-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/Biome-2.3-60A5FA?style=flat-square" alt="Biome">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-対応-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/Firefox-対応-FF7139?style=flat-square&logo=firefox&logoColor=white" alt="Firefox">
  <img src="https://img.shields.io/badge/Edge-対応-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" alt="Edge">
  <img src="https://img.shields.io/badge/Safari-非対応-999999?style=flat-square&logo=safari&logoColor=white" alt="Safari">
</p>

---

## 📚 ドキュメント

詳細なドキュメントは **[https://docs.bookmark-scout.com](https://docs.bookmark-scout.com)** をご覧ください：

- **はじめに** — インストールとセットアップガイド
- **機能** — 詳細な機能ドキュメント
- **コントリビュート** — プロジェクトへの貢献方法

---

## 🌐 ウェブサイト

ランディングページとダウンロードリンクは **[https://bookmark-scout.com](https://bookmark-scout.com)** をご覧ください。

---

## 🌐 ブラウザサポート

|                                                  ブラウザ                                                   | サポートレベル | 備考                          |
| :---------------------------------------------------------------------------------------------------------: | :------------: | ----------------------------- |
| ![Chrome](https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white) |    ⭐⭐⭐ 主要    | Manifest V3、全機能対応       |
|  ![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefox&logoColor=white)   |    ⭐⭐ 副次     | Manifest V2、サイドバー非対応 |
|  ![Edge](https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)   |    ⭐⭐ 副次     | Chromiumベース、完全互換      |
|    ![Safari](https://img.shields.io/badge/Safari-999999?style=for-the-badge&logo=safari&logoColor=white)    |    ❌ 非対応    | `bookmarks` API未実装         |

> **なぜSafariは非対応？** Safari Web Extensionsはこの拡張機能に不可欠な`browser.bookmarks` APIをサポートしていません。

---

## ✨ 機能

### ✅ 実装済み

- [x] 🔍 **インスタント検索** — デバウンス検索とフォルダフィルタリングで素早く検索
- [x] 📂 **ドラッグ＆ドロップ** — 直感的なドラッグ＆ドロップで整理
- [x] ⚡ **クイック追加** — ワンクリックで任意のフォルダに保存
- [x] 📱 **サイドパネル** — Chromeのサイドパネルからアクセス
- [x] 🎯 **すべて展開/折りたたみ** — ネストフォルダを素早く操作
- [x] 📁 **フォルダ作成** — ポップアップから直接作成
- [x] 🗑️ **アイテム削除** — 確認付きで削除
- [x] 🌍 **i18n** — 英語、日本語、韓国語対応
- [x] 🔄 **ブックマーク同期** — ブラウザ内蔵同期でクロスデバイス同期

### 🚧 ロードマップ

- [ ] 🗂️ **フルブックマークマネージャー** — Chromeデフォルトページを置換
- [ ] ⚙️ **オプションページ** — 拡張機能設定
- [ ] 🌙 **ダークモード** — スムーズなダークテーマ
- [ ] ⚙️ **設定同期** — デバイス間で設定を同期
- [ ] 🔗 **重複検出** — 重複を検出して削除
- [ ] 💀 **デッドリンクチェッカー** — 壊れたリンクを検出
- [ ] 📤 **インポート/エクスポート** — JSONでバックアップ

---

## 🛠️ 技術スタック

### フレームワーク＆言語

|                                                   テクノロジー                                                    | バージョン | 説明                       |
| :---------------------------------------------------------------------------------------------------------------: | :--------: | -------------------------- |
|        ![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)         |    19.2    | UIライブラリ               |
| ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) |    5.9     | 型安全なJavaScript         |
|    ![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)     |     15     | ウェブサイトフレームワーク |

### ビルド＆ツール

|                                          テクノロジー                                           | バージョン | 説明                       |
| :---------------------------------------------------------------------------------------------: | :--------: | -------------------------- |
|  ![WXT](https://img.shields.io/badge/WXT-646CFF?style=for-the-badge&logo=vite&logoColor=white)  |    0.20    | 拡張機能フレームワーク     |
| ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white) |     7      | ビルドツール               |
|    ![Nx](https://img.shields.io/badge/Nx-143055?style=for-the-badge&logo=nx&logoColor=white)    |    22.3    | モノレポ管理               |
|  ![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)   |    1.3     | JavaScriptランタイム       |
|             ![Biome](https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge)             |    2.3     | リンティング＆フォーマット |

### UI＆スタイリング

|                                                     テクノロジー                                                     | バージョン | 説明                        |
| :------------------------------------------------------------------------------------------------------------------: | :--------: | --------------------------- |
| ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) |    4.1     | ユーティリティファーストCSS |
|                  ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge)                   |    0.9     | Radixベースコンポーネント   |
|       ![Radix UI](https://img.shields.io/badge/Radix-161618?style=for-the-badge&logo=radixui&logoColor=white)        |    1.2     | ヘッドレスUIプリミティブ    |
| ![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)  |   12.23    | アニメーションライブラリ    |
|                      ![Lucide](https://img.shields.io/badge/Lucide-F56565?style=for-the-badge)                       |   0.562    | アイコンライブラリ          |

### 状態＆データ

|                                                      テクノロジー                                                      | バージョン | 説明               |
| :--------------------------------------------------------------------------------------------------------------------: | :--------: | ------------------ |
|                      ![Zustand](https://img.shields.io/badge/Zustand-764ABC?style=for-the-badge)                       |    5.0     | 状態管理           |
|               ![TanStack Table](https://img.shields.io/badge/TanStack_Table-FF4154?style=for-the-badge)                |    8.21    | ヘッドレステーブル |
| ![Pragmatic DnD](https://img.shields.io/badge/Pragmatic_DnD-0052CC?style=for-the-badge&logo=atlassian&logoColor=white) |    1.7     | ドラッグ＆ドロップ |

### デプロイ＆インフラ

|                                                   テクノロジー                                                    | バージョン | 説明                |
| :---------------------------------------------------------------------------------------------------------------: | :--------: | ------------------- |
|       ![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)       |     -      | CI/CD＆ホスティング |
| ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white) |     -      | CDN＆DNS            |

---

## 📦 インストール

### GitHubリリースから

[GitHubリリース](https://github.com/isandrel/bookmark-scout/releases)から最新版をダウンロード：

```bash
# GitHub CLIで最新リリースをダウンロード
gh release download --repo isandrel/bookmark-scout --pattern "*.zip"

# ZIPファイルを展開
unzip bookmark-scout-chrome-*.zip -d bookmark-scout
```

### ソースから

```bash
# リポジトリをクローン
gh repo clone isandrel/bookmark-scout
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
4. `apps/extension/.output/chrome-mv3` を選択

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
│   └── website/            # Next.jsマーケティングサイト
│       └── app/
├── packages/
│   └── config/             # 共有設定
├── config/
│   └── site.config.toml    # 中央設定ファイル
└── templates/              # READMEテンプレート
```

---

## 🔐 権限

| 権限        | 目的                             |
| ----------- | -------------------------------- |
| `bookmarks` | ブックマークの読み取りと書き込み |
| `tabs`      | クイック追加用のタブ情報取得     |
| `favicon`   | ウェブサイトファビコン表示       |
| `storage`   | ユーザー設定を保存               |
| `sidePanel` | Chromeサイドパネル有効化         |

---

## 🤝 コントリビューション

コントリビューションを歓迎します！ガイドラインは[CONTRIBUTING.md](../CONTRIBUTING.md)をご覧ください。

```bash
# リポジトリをフォークしてクローン
gh repo fork isandrel/bookmark-scout --clone

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

<a href="https://star-history.com/#isandrel/bookmark-scout&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=isandrel/bookmark-scout&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=isandrel/bookmark-scout&type=Date" />
   <img alt="スター履歴チャート" src="https://api.star-history.com/svg?repos=isandrel/bookmark-scout&type=Date" />
 </picture>
</a>

---

<p align="center">
  <a href="https://github.com/isandrel">isandrel</a> が ❤️ を込めて作成
</p>
