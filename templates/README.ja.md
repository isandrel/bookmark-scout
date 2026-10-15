<p align="center">
  <a href="../README.md">English</a> ·
  <strong>日本語</strong> ·
  <a href="./README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/{{GITHUB_REPO}}/{{DEFAULT_BRANCH}}/apps/extension/public/icon-128.png" alt="{{SITE_NAME}} のロゴ" width="96" height="96">
</p>

<h1 align="center">{{SITE_NAME}}</h1>

<h3 align="center">どのページも、数秒で正しいブックマークフォルダーへ。</h3>

<p align="center">
  フォルダー名を数文字入力するか、ショートカットを 1 つ押すだけで、ページが本来のフォルダーに保存されます。<br>
  無料で、アカウントも広告もありません。開発者には何も送られません。
</p>

<p align="center">
{{STORE_BADGES:@BROWSER に追加}}
</p>

<p align="center">
  <a href="{{SITE_URL}}"><img src="https://img.shields.io/badge/ウェブサイト-見る-{{BRAND_COLOR}}?style=flat-square" alt="ウェブサイト"></a>
  <a href="{{DOCS_URL}}/ja"><img src="https://img.shields.io/badge/ガイド-読む-{{BRAND_COLOR}}?style=flat-square" alt="ガイド"></a>
  <a href="{{LICENSE_FILE_URL}}"><img src="https://img.shields.io/badge/オープンソース-{{LICENSE_BADGE}}-blue?style=flat-square" alt="オープンソースのライセンス"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{SCREENSHOT:popup:dark}}">
    <img src="{{SCREENSHOT:popup:light}}" alt="Bookmark Scout のポップアップ。「pas」と入力すると Recipes / Italian の中の Pasta フォルダーが見つかり、Enter でそこにページを保存できる。横には、パスタのレシピページに対する任意の AI の提案。" width="800">
  </picture>
</p>

## ✨ できること

- 📁 **名前を入力して正しいフォルダーに保存。** 数文字入力して Enter を押すだけ。ほかのフォルダーの奥深くにあるフォルダーも見つかり、少しの入力ミスがあっても一致します。
- ⚡ **ショートカット 1 つで保存。** どのページでも **{{SHORTCUT:commands.quick-save}}**（Mac では **{{SHORTCUT_MAC:commands.quick-save}}**）を押します。保存先を示す小さなメッセージから、**元に戻す** ことも、ほかのフォルダーへ移すこともできます。
- 🔎 **保存したものをすぐ見つける。** ツールバー、サイドパネル、または全画面のブックマークマネージャーから、入力と同時にすべてのブックマークを検索できます。
- 🧹 **何年分ものブックマークを片付ける。** 重複を削除し、開けなくなったリンクを見つけ、ウェブアドレスからトラッキング用のコードを取り除きます。変更はすべて実行前に確認でき、元に戻せます。
- ✨ **AI の提案は任意。** 自分の AI アカウント、または自分のパソコンで動く無料の AI モデルを使って、AI にフォルダーを選ばせることもできます。AI は自分でオンにするまでオフのままです。
- 🔒 **プライバシーを重視した設計。** アカウント、広告、トラッキングはなく、開発者には何も届きません。保存と検索はオフラインでも使えます。

🌍 対応言語: {{LANGUAGE_NAMES}}

## 📦 インストール

{{STORE_LINKS:@STORE での公開準備中です。それまでは [手動でインストール](@DOCS/ja/installation#@ID) できます（上級者向け）。}}

インストールしたら、最初のページを保存してみましょう。

1. **ピン留めする。** ブラウザのツールバーにあるパズルのピースのアイコンをクリックし、Bookmark Scout の横のピンをクリックします。
2. **残しておきたいページを開き**、Bookmark Scout のアイコンをクリックします。
3. **フォルダー名を数文字入力し**、↓ で選んで Enter を押します。これで完了です。

次からは、そのページで **{{SHORTCUT:commands.quick-save}}**（Mac では **{{SHORTCUT_MAC:commands.quick-save}}**）を押すだけです。詳しくは [保存と整理のガイド]({{DOCS_URL}}/ja/guides/save-and-organize) をご覧ください。

## 🔒 プライバシー

Bookmark Scout にはアカウントもサーバーもないため、ブックマークや設定などが開発者に届くことはありません。ブックマークの読み取りと変更はブラウザの中で行われます。データがブラウザの外に出るのは、それを必要とする機能を使ったときだけです。たとえば AI（自分で選んだ AI 企業に送られます）や、リンク切れの確認（ブックマークしたウェブサイトにアクセスします）です。詳しくは [プライバシーポリシー]({{SITE_PAGE:ja:/privacy}}) をご覧ください。

## 🔐 権限

ブラウザが確認する内容:

- **インストール時:** 「ブックマークの読み取りと変更」。Bookmark Scout を使い始めるのに必要なのはこれだけです。
- **それ以上が必要な機能を使うときだけ**、Bookmark Scout の短い説明のあとで確認されます。たとえば、リンク切れの確認ではそのウェブサイトへのアクセスを、サイドパネルからの保存では開いているタブの確認を求めます。許可しなくても、止まるのはその機能だけです。

[すべての権限とその理由]({{DOCS_URL}}/ja/permissions) をご覧ください。

## ❓ よくある質問

**本当に無料ですか？**<br>
はい。広告も有料プランもなく、コードは誰でも読めるように公開されています。AI 企業のアカウントで AI をオンにした場合は、その企業から利用料を請求されることがあります。

**AI は必要ですか？**<br>
いいえ。保存、検索、片付けはすべて AI なしで使えます。

**Firefox、Edge、Safari で使えますか？**<br>
Firefox と Edge は使えます（[インストール](#-インストール) をご覧ください）。Safari は、拡張機能からブックマークを扱えないため使えません。

ほかの質問への答えは [FAQ]({{DOCS_URL}}/ja/faq) にあります。

## 💬 ヘルプとリンク

- 🌐 ウェブサイト: [{{SITE_URL}}]({{SITE_URL}})
- 📖 ガイド: [{{DOCS_URL}}/ja]({{DOCS_URL}}/ja)
- ✉️ メール: [{{CONTACT:support}}](mailto:{{CONTACT:support}})
- 🐞 問題を見つけた、またはアイデアがある場合は [GitHub でお知らせください]({{NEW_ISSUE_URL}})

Bookmark Scout は企業ではなく、個人の開発者 [@{{AUTHOR_NAME}}]({{AUTHOR_URL}}) が作っています。広告もアカウントもなく、オープンソースです。

## 🛠️ 開発者と AI エージェントの方へ

ソースからのビルド、技術スタック、開発状況、テストは [DEVELOPMENT.md](../DEVELOPMENT.md)（英語）にあります。協力していただける場合は [CONTRIBUTING.md](../CONTRIBUTING.md) をお読みください。Claude Code など、パソコン上の AI コーディングエージェントに、承認したうえでブックマークの検索と整理を任せることもできます。[ローカル AI エージェントで使う]({{DOCS_URL}}/ja/guides/local-agents) をご覧ください。

---

<p align="center">
  <a href="../LICENSE">{{LICENSE_SPDX}} ライセンス</a>の無料オープンソースです。
</p>
