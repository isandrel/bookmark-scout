{# source: 4d963e58c520 #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="{{ site.name }} のロゴ" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">どのページも、数秒で正しいブックマークフォルダへ。</h3>

<p align="center">
  フォルダ名を数文字入力するか、ショートカットを 1 つ押すだけで、ページが本来のフォルダに保存されます。<br>
  無料で、アカウントも広告もありません。開発者には何も送られません。
</p>

<p align="center">
{{ md.store_badges("{browser} に追加") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/ウェブサイト-見る-{{ site.brand_color }}?style=flat-square" alt="ウェブサイト"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/ガイド-読む-{{ site.brand_color }}?style=flat-square" alt="ガイド"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/オープンソース-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="オープンソースのライセンス"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="{{ site.name }} のポップアップ。「fin」と入力すると AI / LLMs の中の Fine-tuning フォルダが見つかり、Enter でそこにページを保存できる。横には、プロンプトキャッシュの記事に対する任意の AI の提案（新しいフォルダを含む）。" width="800">
  </picture>
</p>

## ✨ できること

- 📁 **名前を入力して正しいフォルダに保存。** 数文字入力して Enter を押すだけ。ほかのフォルダの奥深くにあるフォルダも見つかり、少しの入力ミスがあっても一致します。
- ⚡ **ショートカット 1 つで保存。** どのページでも {{ shortcuts["commands.quick-save"].both }}を押します。保存先を示す小さなメッセージから、**元に戻す** ことも、ほかのフォルダへ移すこともできます。
- 🔎 **保存したものをすぐ見つける。** ツールバー、サイドパネル、または全画面のブックマークマネージャーから、入力と同時にすべてのブックマークを検索できます。
- 🧹 **何年分ものブックマークを片付ける。** 重複を削除し、開けなくなったリンクを見つけ、ウェブアドレスからトラッキング用のコードを取り除きます。変更はすべて実行前に確認でき、元に戻せます。
- ✨ **AI の提案は任意。** 自分の AI アカウント、または Chrome に組み込まれた AI など自分のパソコンで動く無料の AI モデルを使って、AI にフォルダを選ばせることもできます。AI は自分でオンにするまでオフのままです。
- 🔒 **プライバシーを重視した設計。** アカウント、広告、トラッキングはなく、開発者には何も届きません。保存と検索はオフラインでも使えます。

🌍 対応言語: {{ locales|map(attribute="name")|join(" · ") }}

## 📦 インストール

{{ md.store_links("{store} での公開準備中です。それまでは [手動でインストール]({docs}/installation#{id}) できます（上級者向け）。") }}

インストールしたら、最初のページを保存してみましょう。

1. **ピン留めする。** ブラウザのツールバーにあるパズルのピースのアイコンをクリックし、{{ site.name }} の横のピンをクリックします。
2. **残しておきたいページを開き**、{{ site.name }} のアイコンをクリックします。
3. **フォルダ名を数文字入力し**、Enter を押します。一覧の最初のフォルダにページが保存されます。別のフォルダを選ぶときは、先に ↓ を押します。これで完了です。

次からは、そのページで {{ shortcuts["commands.quick-save"].both }}を押すだけです。詳しくは [保存と整理のガイド]({{ docs_url }}/guides/save-and-organize) をご覧ください。

## 🔒 プライバシー

{{ site.name }} にはアカウントもサーバーもないため、ブックマークや設定などが開発者に届くことはありません。ブックマークの読み取りと変更はブラウザの中で行われます。データがブラウザの外に出るのは、それを必要とする機能を使ったときだけです。たとえば AI（自分で選んだ AI 企業に送られます）や、リンク切れの確認（ブックマークしたウェブサイトにアクセスします）です。詳しくは [プライバシーポリシー]({{ pages.privacy }}) をご覧ください。

## 🔐 権限

ブラウザが確認する内容:

- **インストール時:** 「ブックマークの読み取りと変更」。{{ site.name }} を使い始めるのに必要なのはこれだけです。
- **それ以上が必要な機能を使うときだけ**、{{ site.name }} の短い説明のあとで確認されます。たとえば、リンク切れの確認ではそのウェブサイトへのアクセスを、サイドパネルからの保存では開いているタブの確認を求めます。許可しなくても、止まるのはその機能だけです。

[すべての権限とその理由]({{ docs_url }}/permissions) をご覧ください。

## ❓ よくある質問

**本当に無料ですか？**<br>
はい。広告も有料プランもなく、コードは誰でも読めるように公開されています。AI 企業のアカウントで AI をオンにした場合は、その企業から利用料を請求されることがあります。

**AI は必要ですか？**<br>
いいえ。保存、検索、片付けはすべて AI なしで使えます。

**Firefox、Edge、Safari で使えますか？**<br>
Firefox と Edge は使えます（[インストール](#-インストール) をご覧ください）。Safari は、拡張機能からブックマークを扱えないため使えません。

ほかの質問への答えは [FAQ]({{ docs_url }}/faq) にあります。

## 💬 ヘルプとリンク

- 🌐 ウェブサイト: [{{ site.url }}]({{ site.url }})
- 📖 ガイド: [{{ docs_url }}]({{ docs_url }})
- ✉️ メール: [{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 問題を見つけた、またはアイデアがある場合は [GitHub でお知らせください]({{ site.repo.new_issue }})

{{ site.name }} は企業ではなく、個人の開発者 [@{{ site.author.name }}]({{ site.author.url }}) が作っています。広告もアカウントもなく、オープンソースです。

## 🛠️ 開発者と AI エージェントの方へ

ソースからのビルド、技術スタック、開発状況、テストは [DEVELOPMENT.md]({{ links.DEVELOPMENT }})（英語）にあります。協力していただける場合は [CONTRIBUTING.md]({{ links.CONTRIBUTING }}) をお読みください。Claude Code など、パソコン上の AI コーディングエージェントに、承認したうえでブックマークの検索と整理を任せることもできます。[ローカル AI エージェントで使う]({{ docs_url }}/guides/local-agents) をご覧ください。

---

<p align="center">
  <a href="{{ root }}LICENSE">{{ site.license.spdx }} ライセンス</a>の無料オープンソースです。
</p>
