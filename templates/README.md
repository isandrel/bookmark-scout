<p align="center">
  <strong>English</strong> ·
  <a href="./translations/README.ja.md">日本語</a> ·
  <a href="./translations/README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/{{GITHUB_REPO}}/main/apps/extension/public/icon-128.png" alt="{{SITE_NAME}} Logo" width="80" height="80">
</p>

<h1 align="center">🔖 {{SITE_NAME}}</h1>

<p align="center">
  <strong>{{SITE_DESCRIPTION}}</strong>
</p>

<p align="center">
  <a href="https://github.com/{{GITHUB_REPO}}/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/stargazers"><img src="https://img.shields.io/github/stars/{{GITHUB_REPO}}?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/issues"><img src="https://img.shields.io/github/issues/{{GITHUB_REPO}}?style=flat-square" alt="Issues"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/pulls"><img src="https://img.shields.io/github/issues-pr/{{GITHUB_REPO}}?style=flat-square" alt="PRs"></a>
  <a href="https://github.com/sponsors/{{AUTHOR_NAME}}"><img src="https://img.shields.io/badge/sponsor-❤-ea4aaa?style=flat-square" alt="Sponsor"></a>
  <img src="https://img.shields.io/badge/manifest-v3-blue?style=flat-square" alt="Manifest V3">
</p>

<p align="center">
  <a href="https://github.com/{{GITHUB_REPO}}/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/{{GITHUB_REPO}}/ci.yml?style=flat-square&label=ci" alt="CI"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/actions/workflows/release-extension.yml"><img src="https://img.shields.io/github/actions/workflow/status/{{GITHUB_REPO}}/release-extension.yml?style=flat-square&label=release" alt="Release CI"></a>
  <a href="https://github.com/{{GITHUB_REPO}}/releases"><img src="https://img.shields.io/github/v/release/{{GITHUB_REPO}}?style=flat-square" alt="Release"></a>
  <img src="https://img.shields.io/github/last-commit/{{GITHUB_REPO}}?style=flat-square" alt="Last Commit">
  <a href="{{SITE_URL}}"><img src="https://img.shields.io/badge/website-live-brightgreen?style=flat-square" alt="Website"></a>
  <a href="{{DOCS_URL}}"><img src="https://img.shields.io/badge/docs-live-blue?style=flat-square" alt="Documentation"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/WXT-0.20-646CFF?style=flat-square&logo=vite&logoColor=white" alt="WXT">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/TailwindCSS-4.1-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/Zustand-5.0-764ABC?style=flat-square" alt="Zustand">
  <img src="https://img.shields.io/badge/shadcn%2Fui-0.9-000000?style=flat-square" alt="shadcn/ui">
  <img src="https://img.shields.io/badge/Nx-23-143055?style=flat-square&logo=nx&logoColor=white" alt="Nx">
  <img src="https://img.shields.io/badge/Bun-1.3-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/Biome-2.3-60A5FA?style=flat-square" alt="Biome">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Supported-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/Firefox-Supported-FF7139?style=flat-square&logo=firefox&logoColor=white" alt="Firefox">
  <img src="https://img.shields.io/badge/Edge-Supported-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" alt="Edge">
  <img src="https://img.shields.io/badge/Safari-Not%20Supported-999999?style=flat-square&logo=safari&logoColor=white" alt="Safari">
</p>

---

## 📚 Documentation

Visit **[{{DOCS_URL}}]({{DOCS_URL}})** for comprehensive documentation:

- **Getting Started** — Installation and setup guides
- **Features** — Detailed feature documentation
- **Contributing** — How to contribute to the project

---

## 🌐 Website

Visit **[{{SITE_URL}}]({{SITE_URL}})** for the landing page and download links.

---

## 🌐 Browser Support

|                                                   Browser                                                   | Support Level  | Notes                              |
| :---------------------------------------------------------------------------------------------------------: | :------------: | ---------------------------------- |
| ![Chrome](https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white) | ⭐⭐⭐ Primary | Manifest V3, all features          |
|  ![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefox&logoColor=white)   | ⭐⭐ Secondary | Manifest V2, sidebar not available |
|  ![Edge](https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)   | ⭐⭐ Secondary | Chromium-based, full compatibility |
|    ![Safari](https://img.shields.io/badge/Safari-999999?style=for-the-badge&logo=safari&logoColor=white)    |    ❌ None     | `bookmarks` API not implemented    |

> **Why Safari?** Safari Web Extensions do not support the `browser.bookmarks` API, which is essential for this extension's core functionality.

---

## ✨ Features

### ✅ Implemented

- [x] 🤖 **AI Folder Recommendations** — Smart folder suggestions powered by OpenAI, Anthropic, Google AI, Groq, Mistral, DeepSeek, OpenRouter, Ollama, CLIProxyAPI, or custom OpenAI-compatible providers
- [x] 🔍 **Instant Search** — Quickly find bookmarks with debounced search and folder filtering
- [x] 📂 **Drag & Drop** — Organize bookmarks and folders with intuitive drag-and-drop
- [x] ⚡ **Quick Add** — Save the current tab to any folder with one click
- [x] 📱 **Side Panel** — Access your bookmarks from Chrome's side panel
- [x] 🗂️ **Full Bookmarks Manager** — Replace Chrome's default bookmarks page with a custom table-based manager
- [x] ⚙️ **Options Page** — Configure appearance, search, behavior, AI, maintenance, metadata, security, analytics, and data settings
- [x] 🌙 **Dark Mode** — Use light, dark, or system theme settings
- [x] 🎯 **Expand/Collapse All** — Quickly expand or collapse nested folders
- [x] 📁 **Create Folders** — Create new folders directly from the popup
- [x] 🗑️ **Delete Items** — Remove bookmarks and folders with confirmation
- [x] 🔗 **Duplicate Cleaner** — Find duplicate bookmarks and remove extras with configurable matching
- [x] 🧹 **URL Cleaner** — Remove tracking parameters, normalize query strings, and preview URL changes
- [x] 💀 **Dead Link Checker** — Scan selected bookmarks for unreachable links
- [x] 🧾 **Metadata Fetcher** — Fetch title, favicon, and description metadata
- [x] 🛡️ **Privacy Scanner** — Detect sensitive query parameters, fragments, emails, and UUIDs in bookmarks
- [x] 📊 **Bookmark Statistics** — Summarize domains, folders, protocols, duplicates, and depth
- [x] 📤 **Import/Export** — Export HTML, JSON, Markdown, or CSV and import HTML or JSON
- [x] 🧠 **AI Tools** — Pack bookmarks for LLM context, suggest tags, summarize bookmarks, and plan folder reorganizations
- [x] 🖱️ **Context Menu Save** — Save links from the right-click menu into recent or default folders
- [x] 🌍 **i18n** — English, Japanese, and Korean language support
- [x] 🔄 **Bookmark Sync** — Cross-device bookmark sync via browser's built-in sync
- [x] ⚙️ **Settings Sync** — Sync extension preferences with `chrome.storage.sync`

> **🤖 AI Features Disclaimer**
>
> AI-powered recommendations and AI tools are **disabled by default** and require manual opt-in:
>
> 1. Go to **Settings → AI** tab
> 2. Enable AI features and select your preferred provider (OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, OpenRouter, Ollama, CLIProxyAPI, or a custom OpenAI-compatible endpoint)
> 3. Enter your own API key when your selected provider requires one
>
> ⚠️ **Note:** AI features may send bookmark titles, URLs, folder paths, and selected bookmark context to the configured provider. API usage may incur costs depending on your provider. Results are experimental and should be reviewed before applying destructive organization changes.

### 🚧 Current Focus

- [ ] ⌨️ **Keyboard Shortcuts** — Add faster keyboard-driven navigation and actions
- [ ] 🏷️ **Persistent Tags** — Store and manage custom tags beyond AI-generated suggestions
- [ ] 🧪 **Automated Tests** — Add dedicated unit/integration coverage for bookmark workflows
- [ ] 🛒 **Store Distribution** — Prepare polished Chrome Web Store, Firefox Add-ons, and Edge Add-ons listings

---

## 🛠️ Tech Stack

### Framework & Language

|                                                    Technology                                                     | Version | Description          |
| :---------------------------------------------------------------------------------------------------------------: | :-----: | -------------------- |
|        ![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)         |  19.2   | UI library           |
| ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) |   6.0   | Type-safe JavaScript |
|    ![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)     |   16    | Website framework    |

### Build & Tooling

|                                           Technology                                            | Version | Description          |
| :---------------------------------------------------------------------------------------------: | :-----: | -------------------- |
|  ![WXT](https://img.shields.io/badge/WXT-646CFF?style=for-the-badge&logo=vite&logoColor=white)  |  0.20   | Extension framework  |
| ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white) |    7    | Build tool           |
|    ![Nx](https://img.shields.io/badge/Nx-143055?style=for-the-badge&logo=nx&logoColor=white)    |   23    | Monorepo management  |
|  ![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)   |   1.3   | JavaScript runtime   |
|             ![Biome](https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge)             |   2.3   | Linting & formatting |

### UI & Styling

|                                                      Technology                                                      | Version | Description            |
| :------------------------------------------------------------------------------------------------------------------: | :-----: | ---------------------- |
| ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) |   4.1   | Utility-first CSS      |
|                  ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge)                   |   0.9   | Radix-based components |
|       ![Radix UI](https://img.shields.io/badge/Radix-161618?style=for-the-badge&logo=radixui&logoColor=white)        |   1.2   | Headless UI primitives |
| ![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)  |  12.23  | Animation library      |
|                      ![Lucide](https://img.shields.io/badge/Lucide-F56565?style=for-the-badge)                       |   1.8   | Icon library           |

### State & Data

|                                                       Technology                                                       | Version | Description            |
| :--------------------------------------------------------------------------------------------------------------------: | :-----: | ---------------------- |
|                      ![Zustand](https://img.shields.io/badge/Zustand-764ABC?style=for-the-badge)                       |   5.0   | State management       |
|               ![TanStack Table](https://img.shields.io/badge/TanStack_Table-FF4154?style=for-the-badge)                |  8.21   | Headless table library |
| ![Pragmatic DnD](https://img.shields.io/badge/Pragmatic_DnD-0052CC?style=for-the-badge&logo=atlassian&logoColor=white) |   2.x   | Drag & drop            |

### Deploy & Infrastructure

|                                                    Technology                                                     | Version | Description     |
| :---------------------------------------------------------------------------------------------------------------: | :-----: | --------------- |
|       ![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)       |    -    | CI/CD & hosting |
| ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white) |    -    | CDN & DNS       |

---

## 📦 Installation

### From GitHub Releases

Download the latest release from [GitHub Releases](https://github.com/{{GITHUB_REPO}}/releases):

```bash
# Download release assets using GitHub CLI
gh release download --repo {{GITHUB_REPO}} --pattern "bookmark-scout-*-chrome.zip"

# Extract the Chrome zip file
unzip bookmark-scout-*-chrome.zip -d bookmark-scout
```

Release assets are published per browser:

- `bookmark-scout-*-chrome.crx` for Chrome sideloading in developer mode
- `bookmark-scout-*-chrome.zip` for Chrome unpacked installation or Web Store packaging
- `bookmark-scout-*-firefox.zip` for Firefox temporary add-on installation
- `bookmark-scout-*-edge.zip` for Edge unpacked installation

### From Source

```bash
# Clone the repository
gh repo clone {{GITHUB_REPO}}
cd bookmark-scout

# Install dependencies
bun install

# Build the extension
bun run build
```

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the extracted release folder, or `apps/extension/dist/chrome-mv3` when building from source

---

## 🚀 Development

```bash
# Start extension dev server
bun run dev

# Start website dev server
bun run dev:website

# Build all
bun run build:all

# Lint
bun run lint
```

---

## 📁 Project Structure

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
│   └── config/             # Shared configuration
├── config/
│   └── site.config.toml    # Central config file
└── templates/              # README templates
```

---

## 🔐 Permissions

| Permission     | Purpose                              |
| -------------- | ------------------------------------ |
| `bookmarks`    | Read and write bookmarks             |
| `tabs`         | Get current tab info for quick-add   |
| `favicon`      | Display website favicons             |
| `storage`      | Save user preferences                |
| `sidePanel`    | Enable Chrome side panel             |
| `contextMenus` | Save links from the right-click menu |

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Fork and clone the repository
gh repo fork {{GITHUB_REPO}} --clone

# Create your feature branch
git checkout -b feature/amazing-feature

# Make your changes and commit
git commit -m 'feat: add amazing feature'

# Push and create a pull request
git push origin feature/amazing-feature
gh pr create --title "feat: add amazing feature"
```

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0** - see the [LICENSE](LICENSE) file for details.

---

## ⭐ Star History

<a href="https://star-history.com/#{{GITHUB_REPO}}&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos={{GITHUB_REPO}}&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos={{GITHUB_REPO}}&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos={{GITHUB_REPO}}&type=Date" />
 </picture>
</a>

---

<p align="center">
  Made with ❤️ by <a href="{{AUTHOR_URL}}">{{AUTHOR_NAME}}</a>
</p>
