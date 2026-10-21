{% import "_partials/markdown.md.j2" as md %}
<p align="center">
  <a href="README.md">← Back to the README</a>
</p>

<h1 align="center">{{ site.name }} for developers</h1>

<p align="center">
  How the extension, website, and docs are built, what works today, and where to start.<br>
  How to contribute is in <a href="CONTRIBUTING.md">CONTRIBUTING.md</a>; the rules for coding agents are in <a href="AGENTS.md">AGENTS.md</a>.
</p>

<p align="center">
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/license-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="License"></a>
  <a href="{{ site.repo.url }}"><img src="https://img.shields.io/github/stars/{{ site.repo.slug }}?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/{{ site.repo.slug }}/issues"><img src="https://img.shields.io/github/issues/{{ site.repo.slug }}?style=flat-square" alt="Issues"></a>
  <a href="https://github.com/{{ site.repo.slug }}/pulls"><img src="https://img.shields.io/github/issues-pr/{{ site.repo.slug }}?style=flat-square" alt="PRs"></a>
  <img src="https://img.shields.io/badge/manifest-v3-blue?style=flat-square" alt="Manifest V3">
</p>

<p align="center">
  <a href="https://github.com/{{ site.repo.slug }}/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/{{ site.repo.slug }}/ci.yml?style=flat-square&label=ci" alt="CI"></a>
  <a href="https://github.com/{{ site.repo.slug }}/actions/workflows/release-extension.yml"><img src="https://img.shields.io/github/actions/workflow/status/{{ site.repo.slug }}/release-extension.yml?style=flat-square&label=release" alt="Release CI"></a>
  <a href="https://github.com/{{ site.repo.slug }}/releases"><img src="https://img.shields.io/github/v/release/{{ site.repo.slug }}?style=flat-square" alt="Release"></a>
  <img src="https://img.shields.io/github/last-commit/{{ site.repo.slug }}?style=flat-square" alt="Last Commit">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/website-live-brightgreen?style=flat-square" alt="Website"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/docs-live-blue?style=flat-square" alt="Documentation"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-{{ versions.react }}-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-{{ workspace_versions["apps/extension"].typescript }}-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/WXT-{{ versions.wxt }}-646CFF?style=flat-square&logo=vite&logoColor=white" alt="WXT">
  <img src="https://img.shields.io/badge/Vite-{{ versions.vite }}-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/TailwindCSS-{{ versions.tailwindcss }}-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/Zustand-{{ versions.zustand }}-764ABC?style=flat-square" alt="Zustand">
  <img src="https://img.shields.io/badge/shadcn%2Fui-000000?style=flat-square" alt="shadcn/ui">
  <img src="https://img.shields.io/badge/Nx-{{ versions.nx }}-143055?style=flat-square&logo=nx&logoColor=white" alt="Nx">
  <img src="https://img.shields.io/badge/Bun-{{ versions.bun }}-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/Biome-{{ versions["@biomejs/biome"] }}-60A5FA?style=flat-square" alt="Biome">
</p>

<p align="center">
{{ md.browser_badges("Supported") }}
  <img src="https://img.shields.io/badge/Safari-Not%20Supported-999999?style=flat-square&logo=safari&logoColor=white" alt="Safari">
</p>

## 📋 Contents

- [Browser support](#-browser-support)
- [Features and status](#-features-and-status)
- [Tech stack](#-tech-stack)
- [Install a release build](#-install-a-release-build)
- [Build from source](#-build-from-source)
- [Project structure](#-project-structure)
- [Generated Markdown](#-generated-markdown)
- [Local AI agents (MCP)](#-local-ai-agents-mcp)
- [Permissions](#-permissions)

---

## 🌐 Browser support

|                                                   Browser                                                   | Support Level  | Notes                              |
| :---------------------------------------------------------------------------------------------------------: | :------------: | ---------------------------------- |
| ![Chrome](https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white) | ⭐⭐⭐ Primary | Manifest V3, all features          |
|  ![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefox&logoColor=white)   | ⭐⭐ Secondary | Manifest V2, side panel in the Firefox sidebar |
|  ![Edge](https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)   | ⭐⭐ Secondary | Chromium-based, full compatibility |
|    ![Safari](https://img.shields.io/badge/Safari-999999?style=for-the-badge&logo=safari&logoColor=white)    |    ❌ None     | `bookmarks` API not implemented    |

> **Why Safari?** Safari Web Extensions do not support the `browser.bookmarks` API, which is essential for this extension's core functionality.

---

## ✨ Features and status

### ✅ Implemented

- [x] 📥 **Save to a Folder by Name** — Type part of a folder's name, even a nested folder or a path such as `work/react`, then press Enter to save the current page to the first matching folder (↓ picks another); small typos still match and recently used folders come first
- [x] 🤖 **AI Folder Recommendations** — Smart folder suggestions powered by OpenAI, Anthropic, Google AI, Groq, Mistral, DeepSeek, xAI, Azure OpenAI, OpenRouter, Ollama, CLIProxyAPI, about 200 more from the models.dev catalog, or custom OpenAI-compatible providers. In Chrome, also free on the computer with Chrome's built-in AI (Gemini Nano through the Prompt API), which picks from a shortlist the local word match makes and falls back to it. A suggested new folder opens a review dialog; confirming creates the missing folders and saves the page there
- [x] ⚡ **Quick Save Shortcuts** — Press {{ shortcuts["commands.quick-save"].both }} on any page to save it to the best matching folder (ranked on your device from folder names and the bookmarks in them), the last used folder, or a folder you choose, or {{ shortcuts["commands.ai-quick-save"].both }} to save it where AI suggests. A small notification shows where it went, with Undo and other folders to move it to; no extension window needs to be open
- [x] 🔍 **Instant Search** — Quickly find bookmarks with debounced search and folder filtering
- [x] 📂 **Drag & Drop** — Organize bookmarks and folders with intuitive drag-and-drop
- [x] ⚡ **Quick Add** — Save the current tab to any folder with one click
- [x] 📱 **Side Panel** — Access your bookmarks from Chrome's side panel
- [x] 🗂️ **Full Bookmarks Manager** — Replaces Chrome's bookmarks page and works like it: select rows with click, {{ shortcuts["mouse.select_toggle"].both }}, and {{ shortcuts["mouse.select_range"].both }}, right-click menus (edit, cut, copy, paste, open all in tabs, a new window, or an incognito window, copy a folder link), drag and drop of rows, folders, and links from other pages, sort by name, add a bookmark or folder, `?id=` and `?q=` links (including Chrome's own folder links), an ARIA folder tree with Chrome's keys and separate account and device sections, and drawers in narrow windows. Choose which commands the menus show in Settings
- [x] ↕️ **Configurable Sorting** — Sort bookmark views in the browser's own order (the default), by date added, in natural alphabetical order, or folders first
- [x] ⚙️ **Settings Page** — Opens on **Essentials**, the few settings most people change; eleven more categories sit under **Advanced** (Saving & Search, Appearance, Behavior, AI, AI Tools, Maintenance, Page Titles & Icons, Security, Analytics, Import & Export, and For developers), with a settings search, list and segment editors, and folded Advanced settings
- [x] 👋 **Welcome Page** — Opens once after a new install with the first steps: pin the icon, save a page, and the keys the quick save shortcut got
- [x] 🌙 **Dark Mode** — Use light, dark, or system theme settings
- [x] 🎯 **Expand/Collapse All** — Quickly expand or collapse nested folders
- [x] 📁 **Create Folders** — Create new folders directly from the popup
- [x] ⌨️ **Keyboard Shortcuts** — In the popup, `{{ shortcuts["popup.focus_search"].both }}` searches, arrow keys move through and open folders, and Enter saves the current page, leaving the browser's own shortcuts alone; in the manager, Chrome's keys for select all, copy, cut, paste, undo, redo, open, edit, and delete, such as {{ shortcuts["manager.select_all"].both }} and {{ shortcuts["manager.undo"].both }}, plus `{{ shortcuts["manager.show_help"].both }}` to list shortcuts and `{{ shortcuts["manager.open_saved_searches"].both }}` for saved searches
- [x] 🔖 **Saved Searches** — Save the manager's filters, sort, and folder scope as named smart views, then open, rename, or delete them. Only the query is stored (on this device, not synced), so results always reflect your current bookmarks; deleted folders are skipped with a notice
- [x] 🗑️ **Delete and Undo** — Remove bookmarks and folders from the popup or manager with a confirmation dialog (on by default; can be turned off in Settings) and a 10-second Undo. The manager keeps an undo and redo history of the last 100 changes ({{ shortcuts["manager.undo"].both }} and {{ shortcuts["manager.redo"].both }}) for the browser session, including changes made from the popup, Ask AI, and local AI agents
- [x] 🕘 **Bookmark History** — Every change to bookmarks, made by Bookmark Scout or elsewhere (another extension, the browser's own manager, sync), recorded on this device in IndexedDB with its items and a read-back check; Undo and Redo while the session holds the change, and Restore of deleted items from stored recovery copies after a restart. Changes made while the extension was off show as one difference with its interval.
- [x] 🔗 **Duplicate Cleaner** — Find duplicate bookmarks and remove extras with configurable matching
- [x] 🧹 **URL Cleaner** — Remove tracking parameters, normalize query strings, and preview URL changes, with undo
- [x] 💀 **Dead Link Checker** — Scan selected bookmarks for unreachable links, then review and apply repairs (delete, redirect target, archived copy, or edited URL) with undo
- [x] 🧾 **Metadata Fetcher** — Fetch page titles and descriptions, then apply only the titles you select; descriptions are shown for review and are not saved
- [x] 🖼️ **Refresh Site Icons** — Download each bookmarked site's own icon (never from a third-party icon service), review the results, and keep them on this device so bookmarks show real icons even when the browser has none cached, and in Firefox
- [x] 🛡️ **Privacy Scanner** — Detect sensitive query parameters, fragments, emails, and UUIDs in bookmarks
- [x] 📊 **Bookmark Statistics** — Summarize domains, folders, protocols, duplicates, and depth
- [x] 📤 **Import/Export** — Export HTML, JSON, Markdown, or CSV and import HTML or JSON. JSON exports keep each bookmark's tags and summary. Imports open a preview of the target folder, counts, and duplicates, let you skip duplicates or import everything, and can be undone. Exports and AI context exports that contain sensitive values open a privacy review where you can download the original, a redacted copy, or nothing
- [x] 🧠 **AI Tools** — Pack bookmarks for LLM context (including your saved tags and summaries when enabled), suggest tags (reusing the names of your most used tags), summarize bookmarks, and plan folder reorganizations that are always previewed before they apply, each with undo. Prompts are editable, with a placeholder list in the editor (today's date, the AI output language, About me, and existing tags); an AI output language setting chooses the language of tags, summaries, and new folder names, and an About me text tells every prompt about the user
- [x] 💬 **Ask AI** — A chat in the popup and side panel that searches your bookmarks (by words, folder, tag, site, or date), finds duplicates, checks links, and suggests folders. When you ask, it saves pages and proposes moves, renames, deletions, and new folders as a plan that changes nothing until you approve it; answers can end with buttons for the next step. Choose what it may do in Settings
- [x] 🔌 **Local AI Agents (MCP)** — Let Claude Code, Codex, Cursor, and other MCP clients on your computer search and organize your bookmarks through the `bookmark-scout-mcp` program (`packages/mcp-bridge`), which reaches the extension through native messaging and never opens a network port. Off by default; changes need **Allow changes**, and each one waits for your approval in the browser. See [Use with local AI agents]({{ docs_url }}/guides/local-agents)
- [x] 🖱️ **Context Menu Save** — Save links from the right-click menu into recent or default folders, after turning on **Right-Click Menu** in Settings
- [x] 🌍 **i18n** — English, Simplified Chinese, Spanish, French, Brazilian Portuguese, German, Japanese, Korean, and Traditional Chinese in the extension, website, and docs
- [x] 🔄 **Bookmark Sync** — Cross-device bookmark sync via browser's built-in sync
- [x] ⚙️ **Settings Sync and Backup** — Only the settings you change sync with `chrome.storage.sync`; device-specific values and AI services stay on the device. A backup file saves and restores settings, custom prompts, AI services (never API keys), and saved searches

> **🤖 AI Features Disclaimer**
>
> AI-powered recommendations and AI tools are **disabled by default** and require manual opt-in:
>
> 1. Go to **Settings → AI** tab
> 2. Enable AI features and select your preferred provider (OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, xAI, Azure OpenAI, OpenRouter, Ollama, CLIProxyAPI, or a custom OpenAI-compatible endpoint), or, in Chrome, the free built-in AI for folder suggestions
> 3. Enter your own API key when your selected provider requires one
>
> ⚠️ **Note:** AI features may send bookmark titles, URLs, folder paths, and selected bookmark context to the configured provider. API usage may incur costs depending on your provider. Results are experimental and should be reviewed before applying destructive organization changes.

### 🟡 Partial

- [x] 🏷️ **Tags and Summaries** — Save, edit, and clear tags and summaries in Bookmark Details, or save reviewed AI suggestions. They are stored only in this browser's local extension storage and are not synced or searchable in the popup; JSON bookmark exports and imports carry them, Ask AI can look them up, and AI context exports include them when enabled
- [x] 🎛️ **AI tool limits** — Tag count and style, summary length, and reorganization folder limits are sent to the provider as instructions; the provider's output is not checked against them
- [x] 🦊 **Firefox and Edge** — CI runs the full browser test suite in Edge and an 18-test smoke suite in Firefox (popup, side panel page, manager address, undo, folder tree keys, menus, and drag and drop, quick save shortcut setup, settings, per-site website access, import/export, and reports); both are required checks. In Firefox, the browser's icon cache is unavailable (no favicon API), so bookmarks show icons saved with Refresh Site Icons or a generic icon, and the manager opens from the popup's Open bookmark manager button, because Firefox cannot replace the bookmarks page

### 🚧 Current Focus

- [ ] 🧪 **Browser Coverage** — Grow the Firefox smoke suite toward the full suite (context menus, drag and drop, network and AI tools)
- [ ] 🛒 **Store Distribution** — The Chrome Web Store listing is live. Listing copy in nine languages, permission justifications, privacy disclosures, the privacy policy, screenshots, and submission checklists for Firefox Add-ons and Edge Add-ons are in [`store/`](store/); those submissions are manual and await approval. The Firefox package has its permanent add-on ID and data collection declaration

---

## 🧰 Tech stack

### Framework & Language

|                                                    Technology                                                     | Version | Description          |
| :---------------------------------------------------------------------------------------------------------------: | :-----: | -------------------- |
|        ![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)         |  {{ versions.react }}   | UI library           |
| ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) |   {{ workspace_versions["apps/extension"].typescript }}   | Type-safe JavaScript |
|    ![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)     |   {{ versions.next }}    | Website framework    |

### Build & Tooling

|                                           Technology                                            | Version | Description          |
| :---------------------------------------------------------------------------------------------: | :-----: | -------------------- |
|  ![WXT](https://img.shields.io/badge/WXT-646CFF?style=for-the-badge&logo=vite&logoColor=white)  |  {{ versions.wxt }}   | Extension framework  |
| ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white) |    {{ versions.vite }}    | Build tool           |
|    ![Nx](https://img.shields.io/badge/Nx-143055?style=for-the-badge&logo=nx&logoColor=white)    |   {{ versions.nx }}    | Monorepo management  |
|  ![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)   |   {{ versions.bun }}   | JavaScript runtime   |
|             ![Biome](https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge)             |   {{ versions["@biomejs/biome"] }}   | Linting & formatting |

### UI & Styling

|                                                      Technology                                                      | Version | Description            |
| :------------------------------------------------------------------------------------------------------------------: | :-----: | ---------------------- |
| ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) |   {{ versions.tailwindcss }}   | Utility-first CSS      |
|                  ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge)                   |   —   | Base UI-based components |
|       ![Base UI](https://img.shields.io/badge/Base_UI-161618?style=for-the-badge)        |   {{ versions["@base-ui/react"] }}   | Headless UI primitives |
|                      ![Lucide](https://img.shields.io/badge/Lucide-F56565?style=for-the-badge)                       |   {{ versions["lucide-react"] }}   | Icon library           |

### State & Data

|                                                       Technology                                                       | Version | Description            |
| :--------------------------------------------------------------------------------------------------------------------: | :-----: | ---------------------- |
|                      ![Zustand](https://img.shields.io/badge/Zustand-764ABC?style=for-the-badge)                       |   {{ versions.zustand }}   | State management       |
|               ![TanStack Table](https://img.shields.io/badge/TanStack_Table-FF4154?style=for-the-badge)                |  {{ versions["@tanstack/react-table"] }}   | Headless table library |
| ![Pragmatic DnD](https://img.shields.io/badge/Pragmatic_DnD-0052CC?style=for-the-badge&logo=atlassian&logoColor=white) |   {{ versions["@atlaskit/pragmatic-drag-and-drop"] }}   | Drag & drop            |

### Deploy & Infrastructure

|                                                    Technology                                                     | Version | Description     |
| :---------------------------------------------------------------------------------------------------------------: | :-----: | --------------- |
|       ![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)       |    -    | CI/CD & hosting |
| ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white) |    -    | CDN & DNS       |

---

## 📦 Install a release build

Store installs are listed in the [README](README.md#-install). Builds for every browser are attached to each [GitHub release](https://github.com/{{ site.repo.slug }}/releases):

```bash
# Download release assets using GitHub CLI
gh release download --repo {{ site.repo.slug }} --pattern "bookmark-scout-*-chrome.zip"

# Extract the Chrome zip file
unzip bookmark-scout-*-chrome.zip -d bookmark-scout
```

Release assets are published per browser:

- `bookmark-scout-*-chrome.crx` for Chrome sideloading in developer mode
- `bookmark-scout-*-chrome.zip` for Chrome unpacked installation or Web Store packaging
- `bookmark-scout-*-firefox.zip` for Firefox temporary add-on installation
- `bookmark-scout-*-edge.zip` for Edge unpacked installation

To load one, follow the steps for your browser in the [installation guide]({{ docs_url }}/installation#install-from-a-github-release).

---

## 🔨 Build from source

[CONTRIBUTING.md](CONTRIBUTING.md#-development-setup) has the setup, build, and load-unpacked steps, and [the test suites](CONTRIBUTING.md#code-style). In short:

```bash
gh repo clone {{ site.repo.slug }}
cd bookmark-scout
bun install
bun run build   # then load apps/extension/dist/chrome-mv3 with Load unpacked
```

---

## 📁 Project structure

```
bookmark-scout/
├── apps/
│   ├── extension/          # Browser extension (WXT)
│   │   ├── src/
│   │   │   ├── components/ # React components
│   │   │   ├── entrypoints/ # popup, sidepanel, options, bookmarks
│   │   │   ├── hooks/      # Custom React hooks
│   │   │   ├── stores/     # Zustand stores
│   │   │   └── services/   # Bookmark API services
│   │   └── wxt.config.ts
│   ├── website/            # Next.js marketing site
│   │   └── app/
│   └── docs/               # Fumadocs documentation site
│       └── content/docs/
├── packages/
│   ├── config/             # Shared configuration
│   └── mcp-bridge/         # bookmark-scout-mcp: MCP server and native messaging host
├── config/
│   ├── project.toml        # Project identity shared by every app
│   └── web.toml            # Website and docs hosting
├── i18n/<language>/        # README.md and CONTRIBUTING.md in each other language (generated)
├── scripts/                # Repository scripts, such as the Markdown generator
└── templates/              # Templates for README.md, CONTRIBUTING.md, DEVELOPMENT.md, and i18n/
```

---

## 📝 Generated Markdown

`README.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md`, and their translations in `i18n/<language>/` are generated: edit the template at the same path under `templates/` (`templates/i18n/ja/README.md` for `i18n/ja/README.md`), never the output. `[markdown]` in `config/project.toml` lists the documents, the languages each one has (every supported language unless it lists fewer), and the language switcher's order. Adding a language or a document is a config entry plus a template.

Templates are [MiniJinja](https://docs.rs/minijinja/latest/minijinja/syntax/index.html), rendered by the `minijinja-js` package with the settings in `templates/minijinja.toml`. Values come from the workspace config, the website messages, the extension's shortcuts, and the installed packages, never typed by hand: `{% raw %}{{ site.name }}{% endraw %}`, `{% raw %}{{ shortcuts["commands.quick-save"].both }}{% endraw %}`, `{% raw %}{{ versions.react }}{% endraw %}`, `{% raw %}{{ pages.privacy }}{% endraw %}`. The language switcher, badges, and store lines are macros in `templates/_partials/markdown.md.j2`. An unknown variable fails the run. With trim-blocks on, a `{% raw %}{% %}{% endraw %}` tag at the end of a text line also removes that line's newline, so end text lines with text or a `{% raw %}{{ }}{% endraw %}` expression.

```bash
bun run generate:markdown          # write every output (the pre-commit hook runs it)
bun run generate:markdown --check  # fail if an output is missing or stale (CI's Lint job)
bun run generate:markdown --stale  # list translations made from an older English template
```

Each translation starts with `{% raw %}{# source: <hash> #}{% endraw %}`, the hash of the English template it was translated from. When the English template changes, `--check` warns and `--stale` names the translation and the new hash to record once it is updated.

To preview one template while editing it, dump its context and render it with [minijinja-cli](https://github.com/mitsuhiko/minijinja/tree/main/minijinja-cli). It is optional (`brew install minijinja-cli`); the generator needs only `bun install`.

```bash
bun run generate:markdown --dump-context README ja > /tmp/readme-ja.json
minijinja-cli --config-file templates/minijinja.toml templates/i18n/ja/README.md /tmp/readme-ja.json
```

---

## 🔌 Local AI agents (MCP)

`packages/mcp-bridge` is `bookmark-scout-mcp`, an MCP server and native messaging host that lets Claude Code, Codex, Cursor, and other MCP clients search and organize bookmarks through the extension, with every change approved in the browser. It never opens a network port. Setup for users: [Use with local AI agents]({{ docs_url }}/guides/local-agents). Building, testing, and distribution: [packages/mcp-bridge/README.md](packages/mcp-bridge/README.md).

---

## 🔐 Permissions

Every permission, when the browser asks for it, and why is on the docs [Permissions]({{ docs_url }}/permissions) page. The justifications submitted to the stores are in [store/permissions.md](store/permissions.md).

---

## ⭐ Star History

<a href="https://star-history.com/#{{ site.repo.slug }}&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos={{ site.repo.slug }}&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos={{ site.repo.slug }}&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos={{ site.repo.slug }}&type=Date" />
 </picture>
</a>
