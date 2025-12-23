<p align="center">
  <strong>English</strong> ·
  <a href="./translations/README.ja.md">日本語</a> ·
  <a href="./translations/README.ko.md">한국어</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/isandrel/bookmark-scout/main/public/icon-128.png" alt="Bookmark Scout Logo" width="80" height="80">
</p>

<h1 align="center">🔖 Bookmark Scout</h1>

<p align="center">
  <strong>A modern Chrome extension to quickly search, organize, and save bookmarks to specific folders.</strong>
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
  <a href="https://github.com/isandrel/bookmark-scout/actions/workflows/release-extension.yml"><img src="https://img.shields.io/github/actions/workflow/status/isandrel/bookmark-scout/release-extension.yml?style=flat-square&label=release" alt="Release CI"></a>
  <a href="https://github.com/isandrel/bookmark-scout/actions/workflows/repomix.yml"><img src="https://img.shields.io/github/actions/workflow/status/isandrel/bookmark-scout/repomix.yml?style=flat-square&label=repomix" alt="Repomix CI"></a>
  <a href="https://github.com/isandrel/bookmark-scout/releases"><img src="https://img.shields.io/github/v/release/isandrel/bookmark-scout?style=flat-square" alt="Release"></a>
  <img src="https://img.shields.io/github/last-commit/isandrel/bookmark-scout?style=flat-square" alt="Last Commit">
  <img src="https://img.shields.io/github/repo-size/isandrel/bookmark-scout?style=flat-square" alt="Repo Size">
  <a href="https://depfu.com/github/isandrel/bookmark-scout"><img src="https://img.shields.io/depfu/dependencies/github/isandrel/bookmark-scout?style=flat-square" alt="Depfu"></a>
  <a href="https://bookmark-scout.vercel.app"><img src="https://img.shields.io/badge/website-live-brightgreen?style=flat-square" alt="Website"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/WXT-0.20-646CFF?style=flat-square&logo=vite&logoColor=white" alt="WXT">
  <img src="https://img.shields.io/badge/Rolldown--Vite-7.3-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Rolldown-Vite">
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/Zustand-5-764ABC?style=flat-square&logo=redux&logoColor=white" alt="Zustand">
  <img src="https://img.shields.io/badge/Nx-22-143055?style=flat-square&logo=nx&logoColor=white" alt="Nx">
  <img src="https://img.shields.io/badge/Bun-1.3-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Supported-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/Firefox-Supported-FF7139?style=flat-square&logo=firefox&logoColor=white" alt="Firefox">
  <img src="https://img.shields.io/badge/Edge-Supported-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" alt="Edge">
  <img src="https://img.shields.io/badge/Safari-Not%20Supported-999999?style=flat-square&logo=safari&logoColor=white" alt="Safari">
</p>

---

## 🌐 Browser Support

| Browser | Status          | Notes                                          |
| ------- | --------------- | ---------------------------------------------- |
| Chrome  | ✅ Supported     | Full support with Manifest V3                  |
| Firefox | ✅ Supported     | Full support with Manifest V2                  |
| Edge    | ✅ Supported     | Full support with Manifest V3 (Chromium-based) |
| Safari  | ❌ Not Supported | Apple has not implemented the `bookmarks` API  |

### Why Safari is Not Supported

Safari Web Extensions do not support the `browser.bookmarks` API, which is essential for this extension's core functionality. Despite Apple announcing Web Extension support in Safari 14 (2020), the bookmarks API was never implemented. This is an Apple platform limitation, not a WXT or extension framework issue.

For updates on Safari API support, see [WebKit Bug Tracker](https://bugs.webkit.org/).

---

## ✨ Features

### ✅ Current Focus: Popup & Side Panel

- [x] 🔍 **Instant Search** — Quickly find bookmarks with debounced search and folder filtering
- [x] 📂 **Drag & Drop** — Organize bookmarks and folders with intuitive drag-and-drop
- [x] ⚡ **Quick Add** — Save the current tab to any folder with one click
- [x] 📱 **Side Panel** — Access your bookmarks from Chrome's side panel
- [x] 🌙 **Dark Mode** — Beautiful dark theme with smooth transitions
- [x] 🎯 **Expand/Collapse All** — Quickly expand or collapse nested folders
- [x] 📁 **Create Folders** — Create new folders directly from the popup
- [x] 🗑️ **Delete Items** — Remove bookmarks and folders with confirmation

### 🚧 Roadmap

- [ ] 🗂️ **Full Bookmarks Manager** — Replace Chrome's default bookmarks page with modern table view
- [ ] ⚙️ **Options Page** — Customize extension settings and preferences
- [ ] 🏷️ **Tags** — Add custom tags to bookmarks for better organization
- [ ] 🔄 **Sync** — Cross-device bookmark sync with cloud backup
- [ ] 📊 **Analytics** — View bookmark usage statistics
- [ ] 🔗 **Duplicate Detection** — Find and remove duplicate bookmarks
- [ ] 💀 **Dead Link Checker** — Detect and clean up broken links
- [ ] 📤 **Import/Export** — Backup and restore bookmarks as JSON
- [ ] ⌨️ **Keyboard Shortcuts** — Navigate and manage bookmarks with hotkeys
- [ ] 🔒 **Private Bookmarks** — Password-protected bookmark folders
---

## 📊 Comparison with Other Extensions

|                         | [Bookmark Scout](https://bookmark-scout.vercel.app) | [Raindrop.io](https://raindrop.io/) | [Pocket](https://getpocket.com/) | [Diigo](https://www.diigo.com/) | [Toby](https://www.gettoby.com/) | [Workona](https://workona.com/) | [Qlearly](https://qlearly.com/) | [Booky.io](https://booky.io/) | [Pinboard](https://pinboard.in/) |      [Linkwarden](https://linkwarden.app/)       |        [Hoarder](https://hoarder.app/)         |
| ----------------------- | :-------------------------------------------------: | :---------------------------------: | :------------------------------: | :-----------------------------: | :------------------------------: | :-----------------------------: | :-----------------------------: | :---------------------------: | :------------------------------: | :----------------------------------------------: | :--------------------------------------------: |
| **Free**                |                          ✅                          |                  ❌                  |                ❌                 |                ❌                |                ❌                 |                ❌                |                ❌                |               ✅               |                ❌                 |                        ✅                         |                       ✅                        |
| **Price**               |                        Free                         |               $28/yr                |              $45/yr              |            $40-59/yr            |              $4/mo               |            $7.50/mo             |             $29/yr              |            €19/yr             |              $22/yr              |                       Free                       |                      Free                      |
| **Open Source**         |                          ✅                          |                  ❌                  |                ❌                 |                ❌                |                ❌                 |                ❌                |                ❌                |               ❌               |                ❌                 |                        ✅                         |                       ✅                        |
| **GitHub**              | [Link](https://github.com/isandrel/bookmark-scout)  |                  ❌                  |                ❌                 |                ❌                |                ❌                 |                ❌                |                ❌                |               ❌               |                ❌                 | [Link](https://github.com/linkwarden/linkwarden) | [Link](https://github.com/hoarder-app/hoarder) |
| **Search**              |                          ✅                          |                  ✅                  |                ✅                 |                ✅                |                ✅                 |                ✅                |                ✅                |               ✅               |                ✅                 |                        ✅                         |                       ✅                        |
| **Full-text Search**    |                          ❌                          |                  ✅                  |                ✅                 |                ✅                |                ❌                 |                ❌                |                ❌                |               ❌               |                ✅                 |                        ✅                         |                       ✅                        |
| **Drag & Drop**         |                          ✅                          |                  ✅                  |                ❌                 |                ❌                |                ✅                 |                ✅                |                ✅                |               ❌               |                ❌                 |                        ✅                         |                       ❌                        |
| **Folder Organization** |                          ✅                          |                  ✅                  |                ❌                 |                ✅                |                ✅                 |                ✅                |                ✅                |               ✅               |                ❌                 |                        ✅                         |                       ✅                        |
| **Nested Folders**      |                          ✅                          |                  ✅                  |                ❌                 |                ✅                |                ✅                 |                ✅                |                ❌                |               ✅               |                ❌                 |                        ✅                         |                       ✅                        |
| **Tags/Labels**         |                          🚧                          |                  ✅                  |                ✅                 |                ✅                |                ✅                 |                ✅                |                ✅                |               ❌               |                ✅                 |                        ✅                         |                      ✅ AI                      |
| **One-Click Save**      |                          ✅                          |                  ✅                  |                ✅                 |                ✅                |                ✅                 |                ✅                |                ✅                |               ✅               |                ✅                 |                        ✅                         |                       ✅                        |
| **Side Panel**          |                          ✅                          |                  ❌                  |                ❌                 |                ❌                |                ❌                 |                ❌                |                ❌                |               ❌               |                ❌                 |                        ❌                         |                       ❌                        |
| **Dark Mode**           |                          ✅                          |                  ✅                  |                ✅                 |                ❌                |                ✅                 |                ✅                |                ✅                |               ✅               |                ❌                 |                        ✅                         |                       ✅                        |
| **Visual Previews**     |                          ❌                          |                  ✅                  |                ✅                 |                ❌                |                ✅                 |                ❌                |                ✅                |               ❌               |                ❌                 |                        ✅                         |                       ✅                        |
| **Annotations/Notes**   |                          ❌                          |                  ✅                  |                ❌                 |                ✅                |                ❌                 |                ❌                |                ❌                |               ✅               |                ✅                 |                        ✅                         |                       ✅                        |
| **Highlights**          |                          ❌                          |                  ✅                  |                ✅                 |                ✅                |                ❌                 |                ❌                |                ❌                |               ❌               |                ❌                 |                        ✅                         |                       ❌                        |
| **Cloud Sync**          |                          🚧                          |                  ✅                  |                ✅                 |                ✅                |                ✅                 |                ✅                |                ✅                |               ✅               |                ✅                 |                        ✅                         |                       ✅                        |
| **Offline Access**      |                          ✅                          |                  ✅                  |                ✅                 |                ❌                |                ❌                 |                ❌                |                ❌                |               ❌               |                ✅                 |                        ❌                         |                       ❌                        |
| **Page Archiving**      |                          ❌                          |                  ✅                  |                ❌                 |                ✅                |                ❌                 |                ❌                |                ❌                |               ❌               |                ✅                 |                        ✅                         |                       ✅                        |
| **Duplicate Detection** |                          🚧                          |                  ❌                  |                ❌                 |                ❌                |                ❌                 |                ❌                |                ❌                |               ❌               |                ❌                 |                        ❌                         |                       ❌                        |
| **Dead Link Checker**   |                          🚧                          |                  ❌                  |                ❌                 |                ❌                |                ❌                 |                ❌                |                ❌                |               ❌               |                ❌                 |                        ❌                         |                       ❌                        |
| **Import/Export**       |                          🚧                          |                  ✅                  |                ✅                 |                ✅                |                ✅                 |                ✅                |                ✅                |               ✅               |                ✅                 |                        ✅                         |                       ✅                        |
| **Keyboard Shortcuts**  |                          🚧                          |                  ✅                  |                ✅                 |                ❌                |                ✅                 |                ✅                |                ✅                |               ❌               |                ✅                 |                        ❌                         |                       ❌                        |
| **Team Collaboration**  |                          ❌                          |                  ✅                  |                ❌                 |                ✅                |                ✅                 |                ✅                |                ✅                |               ❌               |                ❌                 |                        ✅                         |                       ✅                        |
| **Mobile App**          |                          ❌                          |                  ✅                  |                ✅                 |                ✅                |                ❌                 |                ❌                |                ❌                |               ✅               |                ❌                 |                        ✅                         |                       ✅                        |
| **Chrome**              |                          ✅                          |                  ✅                  |                ✅                 |                ✅                |                ✅                 |                ✅                |                ✅                |               ✅               |                ✅                 |                        ✅                         |                       ✅                        |
| **Firefox**             |                          ✅                          |                  ✅                  |                ✅                 |                ✅                |                ✅                 |                ✅                |                ✅                |               ✅               |                ✅                 |                        ✅                         |                       ✅                        |
| **Edge**                |                          ✅                          |                  ✅                  |                ✅                 |                ✅                |                ✅                 |                ✅                |                ✅                |               ❌               |                ❌                 |                        ✅                         |                       ✅                        |
| **Manifest V3**         |                          ✅                          |                  ✅                  |                ✅                 |                ⚠️                |                ⚠️                 |                ✅                |                ⚠️                |               ⚠️               |                ❌                 |                       N/A                        |                      N/A                       |
| **i18n**                |                          ✅                          |                  ✅                  |                ✅                 |                ✅                |                ❌                 |                ✅                |                ❌                |               ❌               |                ❌                 |                        ✅                         |                       ✅                        |
| **Privacy-Focused**     |                          ✅                          |                  ❌                  |                ❌                 |                ❌                |                ❌                 |                ❌                |                ❌                |               ⚠️               |                ✅                 |                        ✅                         |                       ✅                        |
| **Self-Hostable**       |                          ❌                          |                  ❌                  |                ❌                 |                ❌                |                ❌                 |                ❌                |                ❌                |               ❌               |                ❌                 |                        ✅                         |                       ✅                        |
| **AI Features**         |                          ❌                          |                  ❌                  |                ❌                 |                ❌                |                ❌                 |                ❌                |                ❌                |               ❌               |                ❌                 |                        ❌                         |                       ✅                        |

**Legend:** ✅ Supported | ❌ Not Supported | ⚠️ Limited | 🚧 Roadmap | N/A Not Applicable

---


## 🛠️ Tech Stack

| Layer             | Technology                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Framework**     | React 19 + TypeScript                                                                            |
| **Build**         | [WXT](https://wxt.dev) + Rolldown-Vite + Nx (monorepo with caching)                              |
| **Runtime**       | Bun 1.3                                                                                          |
| **State**         | [Zustand](https://zustand-demo.pmnd.rs/) (lightweight state management)                          |
| **Styling**       | TailwindCSS 4 + CSS Variables                                                                    |
| **UI Components** | [shadcn/ui](https://ui.shadcn.com) (Radix primitives)                                            |
| **Drag & Drop**   | [@atlaskit/pragmatic-drag-and-drop](https://atlassian.design/components/pragmatic-drag-and-drop) |
| **Animations**    | Framer Motion                                                                                    |
| **Table**         | TanStack React Table                                                                             |

> **📍 Current Focus:** Popup development. Options page and bookmarks override temporarily disabled.

---

## 📦 Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/isandrel/bookmark-scout.git
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
4. Select the `dist` folder

---

## 🚀 Development

```bash
# Start development server
bun run dev

# Build for production
bun run build

# Lint code
bun run lint
```

---

## 📁 Project Structure

```
src/
├── components/
│   ├── page/
│   │   ├── BookmarksPage.tsx    # Full bookmarks manager
│   │   ├── OptionsPage.tsx      # Extension settings
│   │   └── PopupPage.tsx        # Main popup with search & DnD
│   └── ui/                      # shadcn components
├── hooks/                       # Custom React hooks
├── lib/                         # Utility functions
├── popup.html                   # Popup entry
├── bookmarks.html               # Bookmarks page override
├── options.html                 # Options page
└── sidepanel.html               # Side panel
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

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

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
