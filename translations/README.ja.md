<p align="center">
  <a href="../README.md">English</a> ·
  <strong>日本語</strong> ·
  <a href="./README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/isandrel/bookmark-scout/main/public/icon-128.png" alt="Bookmark Scout Logo" width="80" height="80">
</p>

<h1 align="center">🔖 Bookmark Scout</h1>

<p align="center">
  <strong>ブックマークを素早く検索、整理、特定のフォルダに保存できるモダンなChrome拡張機能</strong>
</p>

---

## ✨ 機能

### ✅ 現在の重点：ポップアップ＆サイドパネル

- [x] 🔍 **インスタント検索** — デバウンス検索とフォルダフィルタリングでブックマークを素早く検索
- [x] 📂 **ドラッグ＆ドロップ** — 直感的なドラッグ＆ドロップでブックマークとフォルダを整理
- [x] ⚡ **クイック追加** — ワンクリックで現在のタブを任意のフォルダに保存
- [x] 📱 **サイドパネル** — Chromeのサイドパネルからブックマークにアクセス
- [x] 🌙 **ダークモード** — スムーズなトランジションを持つ美しいダークテーマ
- [x] 🎯 **すべて展開/折りたたみ** — ネストされたフォルダを素早く展開または折りたたみ
- [x] 📁 **フォルダ作成** — ポップアップから直接新しいフォルダを作成
- [x] 🗑️ **アイテム削除** — 確認後にブックマークとフォルダを削除

### 🚧 ロードマップ

- [ ] 🗂️ **フルブックマークマネージャー** — Chromeのデフォルトブックマークページをモダンなテーブルビューに置き換え
- [ ] ⚙️ **オプションページ** — 拡張機能の設定とプリファレンスをカスタマイズ
- [ ] 🏷️ **タグ** — ブックマークにカスタムタグを追加してより良い整理を実現
- [ ] 🔄 **同期** — クラウドバックアップによるクロスデバイスブックマーク同期
- [ ] 📊 **分析** — ブックマーク使用統計を表示
- [ ] 🔗 **重複検出** — 重複したブックマークを検出して削除
- [ ] 💀 **デッドリンクチェッカー** — 壊れたリンクを検出してクリーンアップ
- [ ] 📤 **インポート/エクスポート** — JSONとしてブックマークをバックアップおよび復元
- [ ] ⌨️ **キーボードショートカット** — ホットキーでブックマークをナビゲートおよび管理
- [ ] 🔒 **プライベートブックマーク** — パスワード保護されたブックマークフォルダ

---

## 🛠️ 技術スタック

| レイヤー               | テクノロジー                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| **フレームワーク**     | React 19 + TypeScript                                                                            |
| **ビルド**             | [WXT](https://wxt.dev) + Rolldown-Vite + Nx（キャッシュ付きmonorepo）                            |
| **ランタイム**         | Bun 1.3                                                                                          |
| **状態管理**           | [Zustand](https://zustand-demo.pmnd.rs/)（軽量状態管理）                                         |
| **スタイリング**       | TailwindCSS 4 + CSS変数                                                                          |
| **UIコンポーネント**   | [shadcn/ui](https://ui.shadcn.com)（Radixプリミティブ）                                          |
| **ドラッグ＆ドロップ** | [@atlaskit/pragmatic-drag-and-drop](https://atlassian.design/components/pragmatic-drag-and-drop) |
| **アニメーション**     | Framer Motion                                                                                    |
| **テーブル**           | TanStack React Table                                                                             |

> **📍 現在の重点：** ポップアップ開発。オプションページとブックマークオーバーライドは一時的に無効化されています。

---

## 📦 インストール

### ソースから

```bash
# リポジトリをクローン
git clone https://github.com/isandrel/bookmark-scout.git
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
4. `dist` フォルダを選択

---

## 🚀 開発

```bash
# 開発サーバーを起動
bun run dev

# 本番用にビルド
bun run build

# コードをリント
bun run lint
```

---

## 📁 プロジェクト構造

```
src/
├── components/
│   ├── page/
│   │   ├── BookmarksPage.tsx    # フルブックマークマネージャー
│   │   ├── OptionsPage.tsx      # 拡張機能設定
│   │   └── PopupPage.tsx        # メインポップアップ（検索＆DnD）
│   └── ui/                      # shadcnコンポーネント
├── hooks/                       # カスタムReact Hooks
├── lib/                         # ユーティリティ関数
├── popup.html                   # ポップアップエントリ
├── bookmarks.html               # ブックマークページオーバーライド
├── options.html                 # オプションページ
└── sidepanel.html               # サイドパネル
```

---

## 🔐 権限

| 権限        | 目的                               |
| ----------- | ---------------------------------- |
| `bookmarks` | ブックマークの読み取りと書き込み   |
| `tabs`      | クイック追加用の現在のタブ情報取得 |
| `favicon`   | ウェブサイトファビコンを表示       |
| `storage`   | ユーザー設定を保存                 |
| `sidePanel` | Chromeサイドパネルを有効化         |

---

## 🤝 コントリビューション

コントリビューションを歓迎します！お気軽にPull Requestを提出してください。

1. リポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'feat: 素晴らしい機能を追加'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Requestを作成

---

## 📄 ライセンス

このプロジェクトはGNU Affero General Public License v3.0の下でライセンスされています - 詳細は[LICENSE](../LICENSE)ファイルをご覧ください。

---

<p align="center">
  <a href="https://github.com/isandrel">isandrel</a> が ❤️ を込めて作成
</p>
