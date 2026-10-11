# bookmark-scout

## Unreleased

### Features

- Quick save shortcuts: press Alt+Shift+S on any page to save it without opening Bookmark Scout, to the folder that best matches it (ranked on your device from folder names and the bookmarks in them), the last used folder, or a folder you choose (Settings > Saving & Search > Quick Save Shortcuts). Alt+Shift+D saves it to the first AI suggestion instead. A notification in the page says where it went, with Undo and other folders to move it to; a page already bookmarked is not saved twice. On pages extensions cannot draw on, the toolbar badge shows the result and the popup offers Undo. Rebind the keys in the browser's shortcut settings.
- Setting up the quick save shortcuts: in Firefox, Settings > Saving & Search > Keyboard shortcuts records new keys when you press them, explains combinations Firefox cannot use, and resets them to the default. In Chrome and Edge, **Change shortcuts** opens the browser's shortcut page, with a note to find Bookmark Scout there. When the browser left a quick save shortcut without keys (another extension already had them), the popup and side panel show **Quick save shortcut not set** with **Set it up**, until you set it or dismiss the line.
- Settings that were typed as comma-separated text have proper editors: query parameter lists are chips you add with Enter or pick from suggestions, and **Success Status Codes** is a checklist of common HTTP codes with a box for any other code. Timeouts and notification duration are set in seconds, the icon cache in MB, and reorganization confidence shows as a percentage. A minimum (tags per bookmark, bookmarks per folder) can no longer be set above its maximum, and settings with only one possible value (the fixed scopes of Auto-Tagging, Content Summarizer, Duplicate Cleaner, and Privacy Scanner) are no longer shown.
- Settings take less space: each tool's on/off switch sits beside its heading and folds the tool's settings while it is off; technical settings (timeouts, concurrency, retries, status codes, batch size, file names, indentation, icon sizes) sit under a closed **Advanced settings** that a search opens; popup width and height, tags per bookmark, and bookmarks per folder share one row each; and **Show Favicons** and **Recent Folders** each lead one row with the settings they control.
- Settings are regrouped so each page has titled sections: **Saving & Search** comes first (folder matches, search, recent folders, right-click menu), **Appearance** takes the popup size and notification settings that were under **Advanced**, AI Folder Reorganization limits move to **AI Tools**, and every tool on the Maintenance, Metadata & Content, Security, Analytics, and AI Tools pages has its own heading. **Data** is now **Import & Export**. No setting or default changed.
- Save to a folder by typing its name. While you search in the popup or side panel, **Save to folder** lists the matching folders above the results with where they are, best first; press Down and then Enter, or click one, to save the current page there. Several words also match parent folders ("react hooks", "frontend/react"), a longer word may have one typo, and folders you saved to recently rank higher. Settings > Search can turn the list off, change how many folders it shows, and turn off typo matching.
- Pressing Down right after typing in the search box now moves to the new results instead of the previous ones.
- The popup footer says **Save here** while a folder is selected, since Enter saves the page there.
- URLs shown in the manager table, tool results, import and export reviews, dead-link repair, folder suggestions, and bookmark details are now links. A new setting, Settings > Behavior > **Open links in**, chooses whether a click opens a new tab (the default), a background tab, or the current tab; it also applies to bookmarks clicked in the popup and side panel. Middle-click and Ctrl/Cmd-click keep the browser's behavior.

### Stored data

- **This update resets your saved data.** Bookmark Scout stores its data in a new format and removes what older versions stored instead of converting it. After updating, your settings are back to their defaults, AI services and API keys need to be added again, and custom prompts, saved searches, recent searches, recent folders, tags and summaries, and saved site icons are gone. Your bookmarks themselves are not touched. To keep your settings, click **Export** at the bottom of Settings before updating, and **Import** the file afterwards.
- Only the settings you change are saved, so a default improved in a later version still reaches you, and **Export** in Settings saves only those. The quick save folder, the site icon cache size, AI activity recording, and Ask AI's web search are kept on each device instead of syncing. Settings no longer hold an AI provider and model: AI uses the services you add under Settings > AI, and their names, providers, and models stay on the device.
- Settings sync within the browser's size limit: the URL Cleaner and Privacy Scanner parameter lists hold up to 20 names of up to 32 characters each (letters, digits, and URL punctuation), and **Success Status Codes** up to 20 codes.
- The manager table's visible columns, their order, and the sort still follow you to other devices, but column widths and the page size now stay on each device, since they suit one screen. Changing the view in one manager tab no longer undoes a different change made in another.
- The prompt library keeps up to 10 custom prompts in all, so that at their largest they fit in browser sync with your settings; saving one more says so. A prompt left behind by a save that stopped halfway is removed a day later, when the browser starts.
- A model list fetched in Settings > AI belongs to its service, so two services of the same provider no longer share one, and it is offered for 7 days before it has to be fetched again. Deleting a service deletes its list too.
- Changes made at the same moment in two Bookmark Scout tabs, or in a tab and the background, no longer overwrite each other.
- Data saved by a newer version of Bookmark Scout on another synced device is never overwritten by an older one; changing it asks you to update the extension.
- In Chrome 140 and later, the storage that holds API keys is closed to scripts running in web pages.

### Permissions and privacy

- New install-time permissions without a warning: `scripting` in every browser (shows the quick save notification in the tab where the shortcut was pressed) and `offscreen` in Chrome and Edge (runs AI quick save's request in a hidden extension page). The AI quick save shortcut sends the same data as AI folder suggestions in the popup, to the AI provider you set up.

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
