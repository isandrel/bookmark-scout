# bookmark-scout

## Unreleased

### Features

- URLs shown in the manager table, tool results, import and export reviews, dead-link repair, folder suggestions, and bookmark details are now links. A new setting, Settings > Behavior > **Open links in**, chooses whether a click opens a new tab (the default), a background tab, or the current tab; it also applies to bookmarks clicked in the popup and side panel. Middle-click and Ctrl/Cmd-click keep the browser's behavior.

## 0.3.2

### Languages

- The extension, website, and store listings are now available in Simplified Chinese, Traditional Chinese, Spanish, German, French, and Brazilian Portuguese, alongside English, Japanese, and Korean. With Language on Browser setting, Chinese browsers in Hong Kong, Macau, and Singapore get the matching Chinese variant.
- Plural forms now follow each language's rules, and Chinese text uses Chinese fonts instead of Japanese ones.

### Privacy

- Turning on AI or Read page content first explains what is sent and that it goes straight to the AI provider you set up, before the browser's own permission prompt.

### Fixes

- Setting sliders follow a mouse drag again; before, only the arrow keys moved them.
- The Firefox popup no longer clips its rounded corners and edges.
- The manifest summary describes the extension in full.

### Documentation

- The docs site is available in all nine languages, with English pages shown where a translation is missing, and search in each language.
- The docs say the side panel works in Firefox, where it opens as the Firefox sidebar.
- Refresh repository, docs-site, website, and localized README content to reflect current implemented features and planned work.
- Move implemented options, theme, settings sync, full bookmarks manager, import/export, duplicate cleanup, dead-link checking, and bookmark tooling out of roadmap copy.

## 0.3.1

### Privacy

- The AI Features setting now says, in every browser, what AI tools send (bookmark titles, URLs, folder names, the current page, and Ask AI messages) and that it goes straight to the provider you choose. Before, only Firefox showed this.
- The privacy policy adds the Chrome Web Store Limited Use statement and states that pages are downloaded only when Read page content is on.

### Store listing

- New screenshots of the redesigned popup, manager, Tools, and settings, a store icon with padding, a small promo tile, and a marquee tile.
- The Chrome and Edge listing descriptions name every AI feature and everything it sends.

## 0.3.0

### Highlights

- **Permissions only when needed.** Chrome and Edge now ask only for bookmark access at install. Tab access, the browser's icon cache, the right-click menu, website access, and (in Firefox) AI data collection are requested the first time you use the feature that needs them. The right-click menu is off by default.
- **Firefox ready for Add-ons review.** Permanent add-on ID, data collection declared as optional, a clean `addons-linter` run, and an "Open bookmark manager" button in the popup and side panel (Firefox cannot replace its bookmarks page).
- **Ask AI.** A read-only bookmark assistant in the popup and side panel.

### AI

- About 200 providers from the models.dev catalog with search and logos, named AI services with a popup switcher, and presets for local servers.
- Model lists and Verify Service without spending tokens, with clearer, localized errors.
- Opt-in page reading for AI tools, an opt-in AI activity log that redacts keys and custom credential headers, and a prompt library with saved custom prompts per tool.
- Reorganization moves bookmarks into the folders it suggests (creating new ones), skips bookmarks you moved after the preview, can apply partially, and is undoable.

### Bookmarks and tools

- Keyboard shortcuts in the popup and manager, saved searches, resizable table columns, persisted table views, and configurable sorting.
- Reviewed dead-link repair, import preview with duplicate strategy and undo, export privacy review, Refresh Site Icons, and stored tags and summaries.
- One delete-with-undo flow in the popup and manager that skips items changed since you confirmed; Undo disappears when its window ends.

### Fixes

- Dozens of fixes from exploratory QA: AI suggestions layout and folder names containing "/", keyboard access to search history, bulk move order, the manager page scrolling away, settings errors, translations in Japanese and Korean, and dark-mode contrast.
- Security: provider catalog data is validated before it is written or loaded, and site icons are no longer exposed to web pages.

### Under the hood

- Configuration split into validated TOML files with one source per value, shared building blocks replacing duplicated code, a clean type check in CI, and a refreshed website and docs site.

## 0.2.0

### Minor Changes

- Add AI provider routing controls for provider-specific AI service selection.
- Refresh extension, docs, and CI dependencies after merging the latest Dependabot updates.
- Document release asset installation paths for Chrome, Firefox, and Edge.

## 0.1.0

### Minor Changes

- ### Tooling & Build System Improvements

  - Add Nx 22 for monorepo-style build orchestration and caching
  - Integrate Rolldown-Vite 7.3 for faster builds
  - Add Changesets for version management and changelog generation
  - Migrate ESLint to Biome for linting and formatting
  - Convert config files from JS to TypeScript (postcss.config.ts, tailwind.config.ts)
