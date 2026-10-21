{# source: c43b8d0cbafe #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
# 🤝 {{ site.name }} へのコントリビュート

{{ site.name }} へのコントリビュートを検討していただき、ありがとうございます。皆さんの協力が、この拡張機能をすべての人にとってより良いものにしています。

## 📋 目次

- [行動規範](#-行動規範)
- [コントリビュートの方法](#-コントリビュートの方法)
- [開発環境のセットアップ](#-開発環境のセットアップ)
- [プルリクエストの流れ](#-プルリクエストの流れ)
- [スタイルガイドライン](#-スタイルガイドライン)
- [国際化](#-国際化)
- [質問がある場合](#-質問がある場合)

## 📜 行動規範

このプロジェクトは [行動規範]({{ root }}CODE_OF_CONDUCT.md) に従っています。参加する方には、敬意を持ち、誰もが参加しやすい振る舞いを守ることが求められます。受け入れられない振る舞いは GitHub Issues で報告してください。

## 🎯 コントリビュートの方法

### 🐛 バグの報告

バグを報告する前に、重複を避けるため既存の issue を確認してください。

**バグを報告するときは、次の情報を含めてください。**

- ブラウザとそのバージョン（{{ browsers|map(attribute="name")|join(", ") }}）
- 拡張機能のバージョン
- 再現手順
- 期待した動作と実際の動作
- 必要に応じてスクリーンショット

[バグ報告テンプレート]({{ root }}.github/ISSUE_TEMPLATE/01-bug-report.yml) を使ってください。

### ✨ 機能の提案

機能の提案を歓迎します。[機能リクエストテンプレート]({{ root }}.github/ISSUE_TEMPLATE/02-feature-request.yml) を使ってください。

**良い機能リクエストには、次の内容が含まれています。**

- 解決したい問題の明確な説明
- 提案する解決方法
- 検討したほかの方法

### 🔧 コードのコントリビュート

取り組む作業を探している場合は、次のラベルが付いた issue を確認してください。

- `good first issue` - 初めての方に最適
- `help wanted` - 協力をお待ちしています

## 💻 開発環境のセットアップ

{{ site.name }} を使うだけなら、[README]({{ links.README }}#-インストール) にあるとおり、ブラウザのストアか GitHub のリリースからインストールしてください。以下の手順は、開発のためにソースからビルドする方法です。技術スタック、機能の状況、リリースビルド、プロジェクト構成については [DEVELOPMENT.md]({{ links.DEVELOPMENT }})（英語）をご覧ください。

### 前提条件

- [Bun](https://bun.sh)（最新バージョン）
- ランタイム管理用の [mise](https://mise.jdx.dev/)
- 次のいずれかのブラウザ: {{ browsers|map(attribute="name")|join(", ") }}

### インストール

```bash
# リポジトリをクローンする
git clone {{ site.repo.url }}.git
cd {{ site.repo.name }}

# 依存関係をインストールする
bun install

# 開発サーバーを起動する（Chrome）
bun run dev
```

### ビルド

```bash
# すべてのブラウザ向けにビルドする
bun run build

# Chrome 向けにビルドする
bunx nx run extension:build:chrome

# Firefox 向けにビルドする
bun run build:firefox

# Edge 向けにビルドする
bun run build:edge
```

### 拡張機能の読み込み

**Chrome / Edge:**

1. `chrome://extensions` または `edge://extensions` を開きます
2. 「デベロッパー モード」（Edge では「開発者モード」）をオンにします
3. 「パッケージ化されていない拡張機能を読み込む」（Edge では「展開して読み込み」）をクリックします
4. `apps/extension/dist/chrome-mv3`（Chrome）または `apps/extension/dist/edge-mv3`（Edge）を選びます

**Firefox:**

1. `about:debugging#/runtime/this-firefox` を開きます
2. 「一時的なアドオンを読み込む」をクリックします
3. `apps/extension/dist/firefox-mv2` にある `manifest.json` ファイルを選びます

## 🔄 プルリクエストの流れ

### 始める前に

1. **main と同期する**: 作業を始める前に、必ず rebase で pull してください
   ```bash
   git checkout {{ site.repo.branch }}
   git pull --rebase origin {{ site.repo.branch }}
   ```

2. **issue を作成する**: 大きな変更は、実装する前に話し合ってください

3. **ブランチを作成する**: 決められた命名規則に従ってください
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) と [Gitmoji](https://gitmoji.dev/) を組み合わせて使います。

`commit-msg` フックと **PR title** チェックがこの形式を確認します。使える種類は `config/commits.toml` にあります。

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| 絵文字 | タイプ     | 説明                 |
| ------ | ---------- | -------------------- |
| ✨     | `feat`     | 新機能               |
| 🐛     | `fix`      | バグ修正             |
| 📝     | `docs`     | ドキュメント         |
| 💄     | `style`    | UI とスタイル        |
| ♻️      | `refactor` | リファクタリング     |
| ⚡     | `perf`     | パフォーマンス       |
| ✅     | `test`     | テスト               |
| 🔧     | `chore`    | メンテナンス         |

### プルリクエストの作成

1. **ブランチをプッシュする**
   ```bash
   git push -u origin feat/123-description
   ```

2. **GitHub CLI で PR を作成する**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base {{ site.repo.branch }}
   ```

3. **CI チェックが通るまで待つ**

4. **レビューのフィードバックに対応する**（ある場合）

### PR チェックリスト

- [ ] コードがプロジェクトのスタイルガイドラインに従っている
- [ ] セルフレビューを済ませた
- [ ] 関連する lint とビルドの確認を済ませた
- [ ] 変更した部分にテストスイートがある場合は、必要に応じてテストを追加または更新した
- [ ] 必要に応じてドキュメントを更新した
- [ ] 関連する issue にリンクした

## 📐 スタイルガイドライン

### コードスタイル

lint とフォーマットには [Biome](https://biomejs.dev/) を使います。

```bash
# lint を確認する
bun run lint

# 拡張機能の lint だけを実行する
bunx nx run extension:lint

# 拡張機能のテストをすべて実行する（Chrome 向けにビルドし、Playwright の Chromium をインストールします）
bun run test
```

このテストコマンドは、ユニットテストと、ヘッドレスの Chromium で動く E2E スイート（ポップアップ、サイドパネル、ブックマークマネージャー、設定、クイック保存、メンテナンス、レポート、インポートとエクスポート、Ask AI、複数の画面にまたがる操作）を実行します。CI は、ブラウザを手動で準備しなくても同じスイートを実行し、さらに Edge のスイートと Firefox のスモークスイートも実行します。ネットワークに依存する処理と AI プロバイダーの処理はオフラインで実行されます。`[mocked provider contract]` という名前のテストは、AI プロバイダーをスタブに置き換え（Vitest の `ai` モックと、Playwright でルーティングした OpenAI 互換エンドポイント）、ネットワークの取得もルートのモックで処理します。これらのテストが確認するのは {{ site.name }} のリクエストとレスポンスの取り決め、オプトインによる有効化、エラー処理であり、実際のプロバイダーやウェブサイトとの互換性ではありません。

そのほかのスイートは、対象となる変更に応じて実行します。

```bash
# Edge と Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# ローカル AI エージェント: MCP ブリッジ自体のテストの後、コンパイルした
# bookmark-scout-mcp を Chromium 上の拡張機能と組み合わせて実行する（Linux と macOS）
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# 大きなライブラリでの応答速度とスクロール。速度に関わる変更の前後に実行する
bunx nx run extension:test:perf

# 実際のプロバイダーに対する AI 機能。BS_LIVE_AI_* 変数を設定しない限りスキップされる
# （apps/extension/tests/live/README.md を参照）
bunx nx run extension:test:live
```

CI は、拡張機能または `packages/mcp-bridge` が変更されたときにブリッジのテストを、毎日パフォーマンススイートを実行し、ライブ AI スイートは必要なときだけ実行します。

### Chrome の内蔵 AI

**内蔵 AI** サービスは、Chrome 自身のモデル（Gemini Nano、Prompt API の `LanguageModel`）をパソコン上で実行します。ユニットテストと E2E テストは偽の `LanguageModel`（`tests/unit/fake-language-model.ts`、`tests/e2e/builtin-ai.spec.ts`）を使うため、実際のモデルは手動で確認します。

1. [Chrome のハードウェア要件](https://developer.chrome.com/docs/ai/get-started#hardware) を満たすパソコンで、Chrome 138 以降を使います。設定 > AI のサービスの下にある **このパソコンを確認** で、このパソコンが要件を満たしているかを比べられます。性能の低いパソコンで試すには、`chrome://flags/#optimization-guide-on-device-model` を **Enabled BypassPerfRequirement** に設定し、Chrome を再起動します。
2. `bun run dev` が開くブラウザでは、モデルが利用できないと表示されます。下のスイッチを付けて起動するか、ランナーをオフにして、自分の Chrome プロファイルの `chrome://extensions` から `apps/extension/dist/chrome-mv3-dev` を読み込みます。この開発者ごとのファイルは Git に含めないでください。`apps/extension/web-ext.config.ts` は無視されます。

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // または代わりに自分のプロファイルを使う: disabled: true,
   });
   ```

3. **設定** > **AI** で **内蔵 AI を使う** をクリックし、続けて **モデルをダウンロード** をクリックします。`chrome://on-device-internals` では、モデルの状態とダウンロードを確認でき、モデルに直接プロンプトを送ることもできます。ただし Chrome がこのページを開くのは、`chrome://chrome-urls` で内部デバッグページをオンにした後だけです。
4. **AI機能** と **リクエストを記録** をオンにし、ページ上でポップアップを開いて、フォルダの提案ボタンをクリックします。**AI アクティビティ** に、そのプロンプトが `ON-DEVICE` として表示されます。
5. ページ上で AI クイック保存のショートカットを 2 回押します。どちらの保存も **AI アクティビティ** に表示され、2 回目のほうが速くなります。AI ホストページ（オフスクリーンドキュメント。`chrome://extensions` の拡張機能のビューに表示されます）が、`apps/extension/config/ai/built-in.toml` の `[quick_save] idle_timeout_ms` の間、指示を読み込んだままにしているためです。

### TypeScript

- 新しいコードはすべて TypeScript で書く
- オブジェクトの型には `interface` より `type` を使う
- 関数には戻り値の型を明示する

### React コンポーネント

- フックを使った関数コンポーネントを使う
- コンポーネントは小さく、1 つの役割に絞る
- わかりやすい prop 名を使う

### ファイル構成

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

`packages/mcp-bridge` には、ローカル AI エージェントが使う MCP サーバー兼ネイティブ メッセージング ホストの `bookmark-scout-mcp` が入っています。拡張機能とやり取りするメッセージは `packages/mcp-bridge/src/protocol.ts` で定義されています。

## 🌐 国際化

ユーザーに表示されるテキストを追加するとき:

1. `apps/extension/public/_locales/<locale>/messages.json` に文字列を追加します
2. `config/project.toml` の `[locales] extension` にあるすべてのロケールに追加します
3. 既存の i18n ヘルパー `t("message_key")` を使います

`README.md`、このガイド、そして `i18n/<language>/` にあるそれらの翻訳は、`templates/` から生成されます。生成されたファイルではなく、テンプレートを編集してください。詳しくは [Generated Markdown]({{ links.DEVELOPMENT }}#-generated-markdown)（英語）をご覧ください。

## 🤔 質問がある場合

- 既存の [issue]({{ site.repo.url }}/issues) を確認する
- [ディスカッション]({{ site.repo.url }}/discussions) を始める
- [質問の issue]({{ root }}.github/ISSUE_TEMPLATE/04-question.yml) を作成する

## 🙏 ありがとうございます

どのようなコントリビュートも {{ site.name }} をより良くします。たとえば:

- 🐛 バグの報告
- ✨ 機能の提案
- 📝 ドキュメントの改善
- 🔧 コードの作成
- 🌐 翻訳

時間と労力を割いていただき、感謝しています。
