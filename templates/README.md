{% import "_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="{{ site.name }} logo" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">Save every page to the right bookmark folder, in seconds.</h3>

<p align="center">
  Type a few letters of a folder's name, or press one shortcut, and the page goes where it belongs.<br>
  Free, with no account and no ads. Nothing is sent to the developer.
</p>

<p align="center">
{{ md.store_badges("Add to {browser}") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/website-visit-{{ site.brand_color }}?style=flat-square" alt="Website"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/guides-read-{{ site.brand_color }}?style=flat-square" alt="Guides"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/open%20source-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="Open source license"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="The {{ site.name }} popup: typing &quot;fin&quot; finds the Fine-tuning folder inside AI / LLMs, ready to save the page there with Enter. Beside it, optional AI suggestions for an article about prompt caching, including a new folder." width="800">
  </picture>
</p>

## ✨ What it does

- 📁 **Save to the right folder by typing its name.** Type a few letters, even of a folder tucked deep inside others, and press Enter. Small typos still match.
- ⚡ **Save with one shortcut.** Press {{ shortcuts["commands.quick-save"].both }} on any page. A small message shows where the page went, with **Undo** and other folders to move it to.
- 🔎 **Find anything you saved.** Search every bookmark as you type, from the toolbar, the side panel, or a full-page bookmark manager, which can also show your bookmarks as cards with a picture of each page. If you turn it on, search also finds words inside the pages you saved.
- 🧹 **Tidy up years of bookmarks.** Remove duplicates, find links that no longer work, strip tracking codes from web addresses, and set up your own rules that add tags and move bookmarks into folders. Cleanups and rules show you every change before it happens, and you can undo it.
- 🕘 **See every change, and get deleted bookmarks back.** The History lists each change to your bookmarks, even ones made outside Bookmark Scout, and brings back what was deleted, even after the browser restarts. It stays on your computer.
- ✨ **Optional AI suggestions.** Let AI pick the folder for you, using your own AI account or a free AI model on your own computer, such as the one built into Chrome. AI stays off until you turn it on.
- 🔒 **Private by design.** No account, no ads, no tracking, and nothing goes to the developer. Saving and searching even work offline.

🌍 Available in {{ locales|map(attribute="name")|join(" · ") }}.

## 📦 Install

{{ md.store_links("coming soon to {store}. Until then, you can [install it by hand]({docs}/installation#{id}) (advanced).") }}

Then save your first page:

1. **Pin it.** Click the puzzle-piece icon in your browser's toolbar, then the pin next to {{ site.name }}.
2. **Open a page you want to keep** and click the {{ site.name }} icon.
3. **Type a few letters of a folder's name** and press Enter: the page is saved to the first folder listed. To pick another one, press ↓ first. That's it.

Next time, just press {{ shortcuts["commands.quick-save"].both }} on the page. The [saving and organizing guide]({{ docs_url }}/guides/save-and-organize) shows more.

## 🔒 Your privacy

{{ site.name }} has no account and no server, so the developer never receives your bookmarks, settings, or anything else. Your bookmarks are read and changed inside your browser. Data leaves it only when you use a feature that needs to, for example AI (it goes to the AI company you chose) or the broken-link check (it visits the bookmarked websites). Read the [privacy policy]({{ pages.privacy }}) for the details.

## 🔐 Permissions

What your browser will ask:

- **When you install:** *"Read and change your bookmarks."* That is the only thing {{ site.name }} needs to start.
- **Only when you use a feature that needs more**, after a short explanation from {{ site.name }}. For example, checking for broken links asks to visit those websites, and saving from the side panel asks to see which tab is open. If you say no, only that feature stays off.

See [every permission and why it is needed]({{ docs_url }}/permissions).

## ❓ Questions

**Is it really free?**<br>
Yes. No ads, no paid plan, and the code is open for anyone to read. If you turn on AI with an AI company's account, that company may charge you for its use.

**Do I need AI?**<br>
No. Saving, searching, and cleanup all work without it.

**Does it work in Firefox, Edge, or Safari?**<br>
Firefox and Edge: yes (see [Install](#-install)). Safari: no, because Safari does not let extensions work with bookmarks.

More answers are in the [FAQ]({{ docs_url }}/faq).

## 💬 Help and links

- 🌐 Website: [{{ site.url }}]({{ site.url }})
- 📖 Guides: [{{ docs_url }}]({{ docs_url }})
- ✉️ Email: [{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 Found a problem or have an idea? [Tell us on GitHub]({{ site.repo.new_issue }})

{{ site.name }} is made by an independent developer, [@{{ site.author.name }}]({{ site.author.url }}), not a company: no ads, no account, and open source.

## 🛠️ For developers and AI agents

Building from source, the tech stack, project status, and tests are in [DEVELOPMENT.md]({{ links.DEVELOPMENT }}). To help out, read [CONTRIBUTING.md]({{ links.CONTRIBUTING }}). AI coding agents on your computer, such as Claude Code, can search and organize your bookmarks with your approval: see [Use with local AI agents]({{ docs_url }}/guides/local-agents).

---

<p align="center">
  Free and open source under the <a href="{{ root }}LICENSE">{{ site.license.spdx }} license</a>.
</p>
