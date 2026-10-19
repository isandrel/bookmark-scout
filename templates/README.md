<p align="center">
  <strong>English</strong> ·
  <a href="./translations/README.ja.md">日本語</a> ·
  <a href="./translations/README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/{{GITHUB_REPO}}/{{DEFAULT_BRANCH}}/apps/extension/public/icon-128.png" alt="{{SITE_NAME}} logo" width="96" height="96">
</p>

<h1 align="center">{{SITE_NAME}}</h1>

<h3 align="center">Save every page to the right bookmark folder, in seconds.</h3>

<p align="center">
  Type a few letters of a folder's name, or press one shortcut, and the page goes where it belongs.<br>
  Free, with no account and no ads. Nothing is sent to the developer.
</p>

<p align="center">
{{STORE_BADGES:Add to @BROWSER}}
</p>

<p align="center">
  <a href="{{SITE_URL}}"><img src="https://img.shields.io/badge/website-visit-{{BRAND_COLOR}}?style=flat-square" alt="Website"></a>
  <a href="{{DOCS_URL}}"><img src="https://img.shields.io/badge/guides-read-{{BRAND_COLOR}}?style=flat-square" alt="Guides"></a>
  <a href="{{LICENSE_FILE_URL}}"><img src="https://img.shields.io/badge/open%20source-{{LICENSE_BADGE}}-blue?style=flat-square" alt="Open source license"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{SCREENSHOT:popup:dark}}">
    <img src="{{SCREENSHOT:popup:light}}" alt="The Bookmark Scout popup: typing &quot;fin&quot; finds the Fine-tuning folder inside AI / LLMs, ready to save the page there with Enter. Beside it, optional AI suggestions for an article about prompt caching, including a new folder." width="800">
  </picture>
</p>

## ✨ What it does

- 📁 **Save to the right folder by typing its name.** Type a few letters, even of a folder tucked deep inside others, and press Enter. Small typos still match.
- ⚡ **Save with one shortcut.** Press {{SHORTCUT:commands.quick-save}} on any page. A small message shows where the page went, with **Undo** and other folders to move it to.
- 🔎 **Find anything you saved.** Search every bookmark as you type, from the toolbar, the side panel, or a full-page bookmark manager.
- 🧹 **Tidy up years of bookmarks.** Remove duplicates, find links that no longer work, and strip tracking codes from web addresses. You see every change before it happens, and can undo it.
- ✨ **Optional AI suggestions.** Let AI pick the folder for you, using your own AI account or a free AI model on your own computer, such as the one built into Chrome. AI stays off until you turn it on.
- 🔒 **Private by design.** No account, no ads, no tracking, and nothing goes to the developer. Saving and searching even work offline.

🌍 Available in {{LANGUAGE_NAMES}}.

## 📦 Install

{{STORE_LINKS:coming soon to @STORE. Until then, you can [install it by hand](@DOCS/installation#@ID) (advanced).}}

Then save your first page:

1. **Pin it.** Click the puzzle-piece icon in your browser's toolbar, then the pin next to Bookmark Scout.
2. **Open a page you want to keep** and click the Bookmark Scout icon.
3. **Type a few letters of a folder's name** and press Enter: the page is saved to the first folder listed. To pick another one, press ↓ first. That's it.

Next time, just press {{SHORTCUT:commands.quick-save}} on the page. The [saving and organizing guide]({{DOCS_URL}}/guides/save-and-organize) shows more.

## 🔒 Your privacy

Bookmark Scout has no account and no server, so the developer never receives your bookmarks, settings, or anything else. Your bookmarks are read and changed inside your browser. Data leaves it only when you use a feature that needs to, for example AI (it goes to the AI company you chose) or the broken-link check (it visits the bookmarked websites). Read the [privacy policy]({{SITE_PAGE:en:/privacy}}) for the details.

## 🔐 Permissions

What your browser will ask:

- **When you install:** *"Read and change your bookmarks."* That is the only thing Bookmark Scout needs to start.
- **Only when you use a feature that needs more**, after a short explanation from Bookmark Scout. For example, checking for broken links asks to visit those websites, and saving from the side panel asks to see which tab is open. If you say no, only that feature stays off.

See [every permission and why it is needed]({{DOCS_URL}}/permissions).

## ❓ Questions

**Is it really free?**<br>
Yes. No ads, no paid plan, and the code is open for anyone to read. If you turn on AI with an AI company's account, that company may charge you for its use.

**Do I need AI?**<br>
No. Saving, searching, and cleanup all work without it.

**Does it work in Firefox, Edge, or Safari?**<br>
Firefox and Edge: yes (see [Install](#-install)). Safari: no, because Safari does not let extensions work with bookmarks.

More answers are in the [FAQ]({{DOCS_URL}}/faq).

## 💬 Help and links

- 🌐 Website: [{{SITE_URL}}]({{SITE_URL}})
- 📖 Guides: [{{DOCS_URL}}]({{DOCS_URL}})
- ✉️ Email: [{{CONTACT:support}}](mailto:{{CONTACT:support}})
- 🐞 Found a problem or have an idea? [Tell us on GitHub]({{NEW_ISSUE_URL}})

Bookmark Scout is made by an independent developer, [@{{AUTHOR_NAME}}]({{AUTHOR_URL}}), not a company: no ads, no account, and open source.

## 🛠️ For developers and AI agents

Building from source, the tech stack, project status, and tests are in [DEVELOPMENT.md](DEVELOPMENT.md). To help out, read [CONTRIBUTING.md](CONTRIBUTING.md). AI coding agents on your computer, such as Claude Code, can search and organize your bookmarks with your approval: see [Use with local AI agents]({{DOCS_URL}}/guides/local-agents).

---

<p align="center">
  Free and open source under the <a href="LICENSE">{{LICENSE_SPDX}} license</a>.
</p>
