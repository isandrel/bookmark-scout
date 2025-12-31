<p align="center">
  <strong>English</strong> ·
  <a href="./translations/README.ja.md">日本語</a> ·
  <a href="./translations/README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/isandrel/bookmark-scout/main/apps/extension/public/icon-128.png" alt="Bookmark Scout Logo" width="80" height="80">
</p>

<h1 align="center">🔖 Bookmark Scout</h1>

<p align="center">
  <strong>A modern browser extension to search, organize, and save bookmarks. Powered by AI folder recommendations with multi-provider support.</strong>
</p>

<p align="center">
  <a href="https://github.com/isandrel/bookmark-scout/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/isandrel/bookmark-scout/stargazers"><img src="https://img.shields.io/github/stars/isandrel/bookmark-scout?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/isandrel/bookmark-scout/issues"><img src="https://img.shields.io/github/issues/isandrel/bookmark-scout?style=flat-square" alt="Issues"></a>
  <a href="https://github.com/isandrel/bookmark-scout/pulls"><img src="https://img.shields.io/github/issues-pr/isandrel/bookmark-scout?style=flat-square" alt="PRs"></a>
  <a href="https://github.com/sponsors/isandrel"><img src="https://img.shields.io/badge/sponsor-❤-ea4aaa?style=flat-square" alt="Sponsor"></a>
  <img src="https://img.shields.io/badge/manifest-v3-blue?style=flat-square" alt="Manifest V3">
</p>

<p align="center">
  <a href="https://github.com/isandrel/bookmark-scout/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/isandrel/bookmark-scout/ci.yml?style=flat-square&label=ci" alt="CI"></a>
  <a href="https://github.com/isandrel/bookmark-scout/actions/workflows/release-extension.yml"><img src="https://img.shields.io/github/actions/workflow/status/isandrel/bookmark-scout/release-extension.yml?style=flat-square&label=release" alt="Release CI"></a>
  <a href="https://github.com/isandrel/bookmark-scout/releases"><img src="https://img.shields.io/github/v/release/isandrel/bookmark-scout?style=flat-square" alt="Release"></a>
  <img src="https://img.shields.io/github/last-commit/isandrel/bookmark-scout?style=flat-square" alt="Last Commit">
  <a href="https://bookmark-scout.com"><img src="https://img.shields.io/badge/website-live-brightgreen?style=flat-square" alt="Website"></a>
  <a href="https://docs.bookmark-scout.com"><img src="https://img.shields.io/badge/docs-live-blue?style=flat-square" alt="Documentation"></a>
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
  <img src="https://img.shields.io/badge/Chrome-Supported-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/Firefox-Supported-FF7139?style=flat-square&logo=firefox&logoColor=white" alt="Firefox">
  <img src="https://img.shields.io/badge/Edge-Supported-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" alt="Edge">
  <img src="https://img.shields.io/badge/Safari-Not%20Supported-999999?style=flat-square&logo=safari&logoColor=white" alt="Safari">
</p>

---

## 📚 Documentation

Visit **[https://docs.bookmark-scout.com](https://docs.bookmark-scout.com)** for comprehensive documentation:

- **Getting Started** — Installation and setup guides
- **Features** — Detailed feature documentation
- **Contributing** — How to contribute to the project

---

## 🌐 Website

Visit **[https://bookmark-scout.com](https://bookmark-scout.com)** for the landing page and download links.

---

## 🌐 Browser Support

|                                                   Browser                                                   | Support Level | Notes                              |
| :---------------------------------------------------------------------------------------------------------: | :-----------: | ---------------------------------- |
| ![Chrome](https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white) |  ⭐⭐⭐ Primary  | Manifest V3, all features          |
|  ![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=firefox&logoColor=white)   | ⭐⭐ Secondary  | Manifest V2, sidebar not available |
|  ![Edge](https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)   | ⭐⭐ Secondary  | Chromium-based, full compatibility |
|    ![Safari](https://img.shields.io/badge/Safari-999999?style=for-the-badge&logo=safari&logoColor=white)    |    ❌ None     | `bookmarks` API not implemented    |

> **Why Safari?** Safari Web Extensions do not support the `browser.bookmarks` API, which is essential for this extension's core functionality.

---

## ✨ Features

### ✅ Implemented

- [x] 🤖 **AI Folder Recommendations** — Smart folder suggestions powered by OpenAI, Anthropic, or Google AI
- [x] 🔍 **Instant Search** — Quickly find bookmarks with debounced search and folder filtering
- [x] 📂 **Drag & Drop** — Organize bookmarks and folders with intuitive drag-and-drop
- [x] ⚡ **Quick Add** — Save the current tab to any folder with one click
- [x] 📱 **Side Panel** — Access your bookmarks from Chrome's side panel
- [x] 🎯 **Expand/Collapse All** — Quickly expand or collapse nested folders
- [x] 📁 **Create Folders** — Create new folders directly from the popup
- [x] 🗑️ **Delete Items** — Remove bookmarks and folders with confirmation
- [x] 🌍 **i18n** — English, Japanese, and Korean language support
- [x] 🔄 **Bookmark Sync** — Cross-device bookmark sync via browser's built-in sync

> **🤖 AI Features Disclaimer**
>
> AI-powered folder recommendations are **disabled by default** and require manual opt-in:
>
> 1. Go to **Settings → AI** tab
> 2. Enable AI features and select your preferred provider (OpenAI, Anthropic, or Google)
> 3. Enter your own API key from your provider's dashboard
>
> ⚠️ **Note:** This feature uses third-party AI services. Your bookmark titles and URLs are sent to the selected AI provider for processing. API usage may incur costs depending on your provider's pricing. Results are experimental and may vary in accuracy.

### 🚧 Roadmap

- [ ] 🗂️ **Full Bookmarks Manager** — Replace Chrome's default bookmarks page
- [ ] ⚙️ **Options Page** — Customize extension settings
- [ ] 🌙 **Dark Mode** — Beautiful dark theme with smooth transitions
- [ ] ⚙️ **Settings Sync** — Sync extension preferences across devices
- [ ] 🔗 **Duplicate Detection** — Find and remove duplicates
- [ ] 💀 **Dead Link Checker** — Detect broken links
- [ ] 📤 **Import/Export** — Backup bookmarks as JSON

---

## 🛠️ Tech Stack

### Framework & Language

|                                                    Technology                                                     | Version | Description          |
| :---------------------------------------------------------------------------------------------------------------: | :-----: | -------------------- |
|        ![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)         |  19.2   | UI library           |
| ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white) |   5.9   | Type-safe JavaScript |
|    ![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)     |   15    | Website framework    |

### Build & Tooling

|                                           Technology                                            | Version | Description          |
| :---------------------------------------------------------------------------------------------: | :-----: | -------------------- |
|  ![WXT](https://img.shields.io/badge/WXT-646CFF?style=for-the-badge&logo=vite&logoColor=white)  |  0.20   | Extension framework  |
| ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white) |    7    | Build tool           |
|    ![Nx](https://img.shields.io/badge/Nx-143055?style=for-the-badge&logo=nx&logoColor=white)    |  22.3   | Monorepo management  |
|  ![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)   |   1.3   | JavaScript runtime   |
|             ![Biome](https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge)             |   2.3   | Linting & formatting |

### UI & Styling

|                                                      Technology                                                      | Version | Description            |
| :------------------------------------------------------------------------------------------------------------------: | :-----: | ---------------------- |
| ![TailwindCSS](https://img.shields.io/badge/TailwindCSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white) |   4.1   | Utility-first CSS      |
|                  ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge)                   |   0.9   | Radix-based components |
|       ![Radix UI](https://img.shields.io/badge/Radix-161618?style=for-the-badge&logo=radixui&logoColor=white)        |   1.2   | Headless UI primitives |
| ![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)  |  12.23  | Animation library      |
|                      ![Lucide](https://img.shields.io/badge/Lucide-F56565?style=for-the-badge)                       |  0.562  | Icon library           |

### State & Data

|                                                       Technology                                                       | Version | Description            |
| :--------------------------------------------------------------------------------------------------------------------: | :-----: | ---------------------- |
|                      ![Zustand](https://img.shields.io/badge/Zustand-764ABC?style=for-the-badge)                       |   5.0   | State management       |
|               ![TanStack Table](https://img.shields.io/badge/TanStack_Table-FF4154?style=for-the-badge)                |  8.21   | Headless table library |
| ![Pragmatic DnD](https://img.shields.io/badge/Pragmatic_DnD-0052CC?style=for-the-badge&logo=atlassian&logoColor=white) |   1.7   | Drag & drop            |

### Deploy & Infrastructure

|                                                    Technology                                                     | Version | Description     |
| :---------------------------------------------------------------------------------------------------------------: | :-----: | --------------- |
|       ![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)       |    -    | CI/CD & hosting |
| ![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white) |    -    | CDN & DNS       |

---

## 📦 Installation

### From GitHub Releases

Download the latest release from [GitHub Releases](https://github.com/isandrel/bookmark-scout/releases):

```bash
# Download latest release using GitHub CLI
gh release download --repo isandrel/bookmark-scout --pattern "*.zip"

# Extract the zip file
unzip bookmark-scout-chrome-*.zip -d bookmark-scout
```

### From Source

```bash
# Clone the repository
gh repo clone isandrel/bookmark-scout
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
4. Select `apps/extension/.output/chrome-mv3`

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
│   └── website/            # Next.js marketing site
│       └── app/
├── packages/
│   └── config/             # Shared configuration
├── config/
│   └── site.config.toml    # Central config file
└── templates/              # README templates
```

---

## 🔐 Permissions

| Permission  | Purpose                            |
| ----------- | ---------------------------------- |
| `bookmarks` | Read and write bookmarks           |
| `tabs`      | Get current tab info for quick-add |
| `favicon`   | Display website favicons           |
| `storage`   | Save user preferences              |
| `sidePanel` | Enable Chrome side panel           |

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Fork and clone the repository
gh repo fork isandrel/bookmark-scout --clone

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

<a href="https://star-history.com/#isandrel/bookmark-scout&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=isandrel/bookmark-scout&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=isandrel/bookmark-scout&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=isandrel/bookmark-scout&type=Date" />
 </picture>
</a>

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/isandrel">isandrel</a>
</p>
