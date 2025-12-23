<p align="center">
  <img src="https://raw.githubusercontent.com/isandrel/bookmark-scout/main/public/vite.svg" alt="Bookmark Scout Logo" width="80" height="80">
</p>

<h1 align="center">🔖 Bookmark Scout</h1>

<p align="center">
  <strong>A modern Chrome extension to quickly search, organize, and save bookmarks to specific folders.</strong>
</p>

<p align="center">
  <a href="https://github.com/isandrel/bookmark-scout/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/isandrel/bookmark-scout/stargazers">
    <img src="https://img.shields.io/github/stars/isandrel/bookmark-scout?style=flat-square" alt="Stars">
  </a>
  <a href="https://github.com/isandrel/bookmark-scout/issues">
    <img src="https://img.shields.io/github/issues/isandrel/bookmark-scout?style=flat-square" alt="Issues">
  </a>
  <img src="https://img.shields.io/badge/manifest-v3-blue?style=flat-square" alt="Manifest V3">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Rolldown--Vite-7.3-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Rolldown-Vite">
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="TailwindCSS">
  <img src="https://img.shields.io/badge/Nx-22-143055?style=flat-square&logo=nx&logoColor=white" alt="Nx">
  <img src="https://img.shields.io/badge/Bun-1.3-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
</p>

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

## 🛠️ Tech Stack

| Layer             | Technology                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Framework**     | React 19 + TypeScript                                                                            |
| **Build**         | Rolldown-Vite 7.3 + Nx 22 (monorepo with caching)                                                |
| **Runtime**       | Bun 1.3                                                                                          |
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

<p align="center">
  Made with ❤️ by <a href="https://github.com/isandrel">isandrel</a>
</p>
