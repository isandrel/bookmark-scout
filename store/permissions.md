# Permission Justifications

Derived on 2026-10-01 from the built manifests, not from `wxt.config.ts` alone:

```bash
NX_DAEMON=false bunx nx run extension:build:chrome
NX_DAEMON=false bunx nx run extension:build:firefox
NX_DAEMON=false bunx nx run extension:build:edge
# then read apps/extension/dist/{chrome-mv3,firefox-mv2,edge-mv3}/manifest.json
```

Rebuild and compare before each submission. If a permission is added or removed, update this file, `README.md` (Permissions), and the privacy documents.

## Built manifests at version 0.2.0

| Key | Chrome `chrome-mv3` | Edge `edge-mv3` | Firefox `firefox-mv2` |
| --- | --- | --- | --- |
| `manifest_version` | 3 | 3 | 2 |
| `permissions` | `bookmarks`, `tabs`, `favicon`, `storage`, `sidePanel`, `contextMenus` | Same as Chrome | Same list (`favicon` and `sidePanel` are not valid in Firefox; see linter results) |
| Optional host access | `optional_host_permissions`: `http://*/*`, `https://*/*` | Same as Chrome | `optional_permissions`: `http://*/*`, `https://*/*` |
| Host permissions at install | None | None | None |
| `chrome_url_overrides` | `bookmarks` → `bookmarks.html` | Same as Chrome | Absent |
| Side panel or sidebar | `side_panel.default_path` | Same as Chrome | `sidebar_action.default_panel` |
| `web_accessible_resources` | `_favicon/*` for `<all_urls>`, any extension ID | Same as Chrome | `_favicon/*` |
| Content scripts | None | None | None |
| `browser_specific_settings.gecko` | Not applicable | Not applicable | **Absent** (no add-on ID, no `data_collection_permissions`) |

## Chrome Web Store single purpose

Paste into the "Single purpose" field:

```text
Bookmark Scout helps users find, save, and organize their browser bookmarks. Every feature works on the user's own bookmarks: searching them, saving the current page or a link into a folder, editing and moving them, cleaning up duplicates, tracking parameters, and dead links, importing and exporting them, and, only if the user turns it on, asking an AI provider of the user's choice to suggest folders, tags, or summaries.
```

## Per-permission justification

The text in each block is written to be pasted into the Chrome Web Store "Permission justification" fields. The same reasoning answers Edge and AMO reviewers.

### `bookmarks`

```text
Core function. The extension reads the bookmark tree to show and search it, and creates, edits, moves, and deletes bookmarks and folders only when the user acts in the popup, side panel, bookmarks manager, or right-click menu. Destructive actions are confirmed (by default) and can be undone.
```

Code: `apps/extension/src/services/bookmarks.ts` and the background listeners in `src/entrypoints/background.ts`.

### `tabs`

```text
Reads the title and URL of the active tab so the popup and side panel can save the page the user is viewing into a chosen folder without saving it twice in the same folder. If the user has turned on AI, the same title and URL are what folder suggestions are based on, and Ask AI can look them up when the user asks about the current page. The extension also opens bookmarks in a new tab. It does not read other tabs or track browsing.
```

Code: `getCurrentTab` and `openBookmarkInNewTab` in `src/services/bookmarks.ts`, `PopupPage.tsx`. `activeTab` alone is not enough because the side panel stays open across tab switches and is not opened by the toolbar button.

### `favicon` (Chrome and Edge)

```text
Shows each bookmark's site icon by reading it from the browser's own favicon cache through the chrome-extension://<id>/_favicon/ URL. No network request is made for icons.
```

Code: `getFaviconUrl` and `getSiteIconUrl` in `src/services/bookmarks.ts`. In Firefox this permission is invalid and the `_favicon` URL is never used: bookmarks show icons saved by Refresh Site Icons, or a generic icon (covered by the Firefox smoke suite).

### `storage`

```text
Saves the user's settings (synced through the browser account where supported) and, in local storage only, AI provider settings including the user's own API key, saved tags and summaries, saved searches, recent folders, and recent searches. Nothing is stored on a server.
```

Code: `src/lib/*-storage.ts`. See [`privacy-disclosures.md`](privacy-disclosures.md) for the full list.

### `sidePanel` (Chrome and Edge)

```text
Provides the side panel view, which shows the same bookmark tree and search as the popup so users can keep it open while browsing.
```

Required by the `side_panel` manifest key. The code does not call the `sidePanel` API. Invalid in Firefox, which uses `sidebar_action` instead.

### `contextMenus`

```text
Adds a right-click menu on links so the user can save a link into a recent folder or the Bookmarks Bar. It can be turned off in Settings.
```

Code: `src/services/context-menu.ts`. The menu is registered for `link` contexts only.

### Optional host access: `http://*/*`, `https://*/*`

```text
Not granted at install. Requested at click time in three cases. (1) When the user runs Check Dead Links, Metadata Fetcher, or Refresh Site Icons, the browser asks for access to websites so the extension can request the bookmarked pages (and, for Refresh Site Icons, an icon file on each bookmarked site) directly; bookmarks can point to any site, so a narrower pattern is not possible. Requests are sent without cookies, and only the page head is read for titles and icon links. If the user declines, nothing is scanned. (2) When the user clicks Verify Service or Refresh Models for an AI provider, the browser asks for access to that one provider origin only. (3) When the user turns on Read page content in the AI settings, the browser asks for access to websites so folder recommendations, Auto-Tagging, and Content Summarizer can download the pages, without cookies, and send their readable text to the AI provider the user configured. Pages on the local network are never read. If the user declines, the setting stays off.
```

Code: `src/services/web-host-access.ts`, `requestProviderHostAccess` in `src/services/ai-settings.ts`, `requestWithTimeout` in `src/services/bookmark-network-tools.ts` (`credentials: 'omit'`), `readPageText` in `src/services/page-reader.ts`.

### Bookmarks page override (Chrome and Edge)

Not a permission, but reviewers check it. The `chrome_url_overrides.bookmarks` key replaces the browser's Bookmarks page with the Bookmark Scout manager. The listing says so in its own paragraph, as the Chrome Web Store expects for page overrides.

### `web_accessible_resources: _favicon/*` (Chrome and Edge)

Declared for `<all_urls>` and any extension ID. The extension's own pages do not need it to load favicons, and it lets web pages request favicon images through the extension's ID. A reviewer may ask why it is there. **Decision for the maintainer:** keep it with a justification, or remove it in a separate change after checking that icons still load in the popup, side panel, and manager.

## Remote code (Chrome Web Store)

Answer "No, I am not using remote code." All JavaScript ships in the package. The only network calls are user-triggered requests to bookmarked pages and to the user's chosen AI provider API, and their responses are treated as data.

## Linter results

`bunx addons-linter@latest apps/extension/dist/firefox-mv2` on 2026-10-01 reported 0 errors, 0 notices, and 8 warnings:

| Code | Where | Meaning and action |
| --- | --- | --- |
| `MANIFEST_PERMISSIONS` | `favicon` | Chromium-only permission. Harmless in Firefox but flagged. Consider dropping it from the Firefox manifest in the WXT hook. |
| `MANIFEST_PERMISSIONS` | `sidePanel` | Chromium-only permission. Same as above. |
| `MISSING_DATA_COLLECTION_PERMISSIONS` | manifest | **Blocking for a new AMO listing.** New Firefox extensions must declare `browser_specific_settings.gecko.data_collection_permissions`. See [`privacy-disclosures.md`](privacy-disclosures.md#firefox-add-ons-data-collection-declaration). |
| `MISSING_ADDON_ID` | manifest | Choose a permanent add-on ID (for example `bookmark-scout@bookmark-scout.com`) and set `browser_specific_settings.gecko.id`. It cannot be changed after the first upload. |
| `DANGEROUS_EVAL` (2) | `background.js`, `chunks/client-*.js` | Zod 4's capability probe `Function('')` inside `try`/`catch`. The extension CSP blocks it, and Zod falls back to its non-JIT path. Explain in reviewer notes. |
| `UNSAFE_VAR_ASSIGNMENT` (2) | `chunks/client-*.js` | React DOM's `dangerouslySetInnerHTML` support. The extension source never uses `dangerouslySetInnerHTML` or `innerHTML` (checked with `grep`). Explain in reviewer notes. |

Chrome and Edge have no equivalent offline linter; their review is manual.

## Package size note

Every build ships `icon-original.png` (5.1 MB, copied from `apps/extension/public/`), which no manifest key or source file references. It is the largest file in each package. Removing it is a separate change; it does not affect permissions.
