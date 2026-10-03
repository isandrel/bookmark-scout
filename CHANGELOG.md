# bookmark-scout

## Unreleased

### Documentation

- Refresh repository, docs-site, website, and localized README content to reflect current implemented features and planned work.
- Move implemented options, theme, settings sync, full bookmarks manager, import/export, duplicate cleanup, dead-link checking, and bookmark tooling out of roadmap copy.

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
