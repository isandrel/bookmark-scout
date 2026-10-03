# Permission Justifications

Derived on 2026-10-03 from the built manifests, which `apps/extension/manifest.config.ts` generates per browser (checked by `tests/unit/manifest-config.test.ts`):

```bash
NX_DAEMON=false bunx nx run extension:build:chrome
NX_DAEMON=false bunx nx run extension:build:firefox
NX_DAEMON=false bunx nx run extension:build:edge
# then read apps/extension/dist/{chrome-mv3,firefox-mv2,edge-mv3}/manifest.json
```

Rebuild and compare before each submission. If a permission is added or removed, update this file, `README.md` (Permissions), and the privacy documents.

## Built manifests at version 0.3.0

Every permission that a browser lets an extension ask for later is optional and requested only when the user turns on or runs the feature that needs it. The table of permissions and features is `apps/extension/src/lib/permission-catalog.ts`; the manifests and the runtime requests both read it.

| Key | Chrome `chrome-mv3` | Edge `edge-mv3` | Firefox `firefox-mv2` |
| --- | --- | --- | --- |
| `manifest_version` | 3 | 3 | 2 |
| `permissions` (granted at install) | `bookmarks`, `storage`, `activeTab`, `sidePanel` | Same as Chrome | `bookmarks`, `storage`, `activeTab`, `contextMenus` |
| `optional_permissions` | `tabs`, `favicon`, `contextMenus` | Same as Chrome | `tabs`, `http://*/*`, `https://*/*` |
| Optional host access | `optional_host_permissions`: `http://*/*`, `https://*/*` | Same as Chrome | In `optional_permissions` (MV2) |
| Host permissions at install | None | None | None |
| `chrome_url_overrides` | `bookmarks` → `bookmarks.html` | Same as Chrome | Absent |
| Side panel or sidebar | `side_panel.default_path` | Same as Chrome | `sidebar_action.default_panel` |
| `web_accessible_resources` | None | None | None |
| Content scripts | None | None | None |
| `browser_specific_settings.gecko` | Not applicable | Not applicable | `id`: `bookmark-scout@isandrel.github.io`, `strict_min_version`: `140.0`, `data_collection_permissions`: `required: ["none"]`, `optional: ["authenticationInfo", "bookmarksInfo", "browsingActivity", "websiteContent"]` (see [`privacy-disclosures.md`](privacy-disclosures.md#firefox-add-ons-data-collection-declaration)); `gecko_android.strict_min_version`: `142.0` |

Why the rest stay required: `bookmarks` is the product; `storage` holds settings every page reads, has no warning, and cannot be optional in Firefox; `activeTab` has no warning and gives the toolbar popup and right-click menu the current page; `sidePanel` has no warning, and Chrome registers a side panel granted at runtime only after the extension reloads. Firefox cannot make `contextMenus` optional, so it stays required there (it shows no prompt).

### Install-time warnings

| Browser | Before (0.2.0 as released) | After |
| --- | --- | --- |
| Chrome and Edge | "Read and change your bookmarks", "Read your browsing history" (`tabs`, which also covers `favicon`) | "Read and change your bookmarks" |
| Firefox | "Read and modify bookmarks", "Access browser tabs" | "Read and modify bookmarks"; data collection: "doesn't require data collection" |

### When each optional permission is requested

| Permission or consent | Browsers | Requested when | If declined | If revoked later |
| --- | --- | --- | --- | --- |
| `tabs` | All | The user saves the current page, or asks for AI folder suggestions, from a page without `activeTab` (the side panel). A dialog explains it first. The toolbar popup never asks: clicking the toolbar button grants `activeTab`. | Nothing is saved; a toast says how to allow it later | The side panel asks again next time |
| `contextMenus` | Chrome, Edge | The user turns on **Context Menu** in Settings (off by default). No prompt: Chrome grants permissions without a warning silently. | The switch stays off; a toast explains | The menu is removed and the switch shows off |
| `favicon` | Chrome, Edge | The user turns on **Use the browser's icon cache** in Settings (off by default) | The switch stays off; bookmarks keep saved or generic icons | Icons fall back to saved or generic ones |
| `http://*/*`, `https://*/*` | All | The user runs Check Dead Links, Metadata Fetcher, or Refresh Site Icons (a dialog explains it first), or turns on Read page content | Nothing is scanned, or the setting stays off | Tools ask again; page reading stops |
| One provider origin | All | The user clicks Verify Service or Refresh Models | The check still runs if the provider allows CORS | Not applicable |
| Data collection: AI categories | Firefox | The user turns on **Enable AI** or Read page content | AI stays off | AI calls stop; the switch shows off |
| Data collection: `authenticationInfo` | Firefox | The user clicks Verify Service or Refresh Models (same prompt as the provider origin) | Nothing is sent | Not applicable |

A feature works only while its setting is on and its permission is granted. Revoking a permission turns the feature off at once (`permissions.onRemoved`), and Options shows the switch as off, but the synced setting is not rewritten, so a revoke on one device does not switch the feature off on another where it is still granted. Code: `src/services/permissions.ts`, `src/hooks/use-permission.tsx`, and `PermissionDialog`.

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

### `activeTab`

```text
When the user clicks the toolbar button or the right-click menu, the extension reads the title and URL of that tab only, so the popup can save the page the user is viewing into a chosen folder (and, if the user turned on AI, suggest a folder for it), and a right-click save can be named after the page title. No access to other tabs and no browsing history.
```

Code: `getCurrentTab` in `src/services/bookmarks.ts`, `PopupPage.tsx`, `getBookmarkTitle` in `src/services/context-menu.ts`.

### `tabs` (optional)

```text
Optional, never granted at install. The side panel stays open while the user switches tabs and gets no activeTab, so when the user saves the current page or asks for a folder suggestion from the side panel, the extension first explains why and then asks for this permission. It reads only the active tab's title and URL, only at that moment, and stores nothing else. If the user declines, nothing is saved.
```

Code: `currentTab` in `src/lib/permission-catalog.ts`, `usePermissionGate` in `src/hooks/use-permission.tsx`, `PopupPage.tsx`.

### `favicon` (optional, Chrome and Edge)

```text
Optional, never granted at install. When the user turns on "Use the browser's icon cache" in Settings, bookmarks show the site icons the browser has already cached, read through the chrome-extension://<id>/_favicon/ URL. No network request is made for these icons. Without it, bookmarks show icons the user saved with Refresh Site Icons, or a generic icon.
```

Code: `getFaviconUrl` and `getSiteIconUrl` in `src/services/bookmarks.ts`, `useSiteIconUrl` in `src/hooks/use-site-icon.ts`. The extension's own pages load these icons without any `web_accessible_resources` entry, so web pages cannot load icons through the extension (`tests/e2e/favicon-access.spec.ts`). Firefox has no such permission, so the Firefox manifest leaves it out, the setting is hidden there, and bookmarks show icons saved by Refresh Site Icons or a generic icon (covered by the Firefox smoke suite).

### `storage`

```text
Saves the user's settings (synced through the browser account where supported) and, in local storage only, AI provider settings including the user's own API key, saved tags and summaries, saved searches, recent folders, and recent searches. Nothing is stored on a server.
```

Code: `src/lib/*-storage.ts`. See [`privacy-disclosures.md`](privacy-disclosures.md) for the full list.

### `sidePanel` (Chrome and Edge)

```text
Provides the side panel view, which shows the same bookmark tree and search as the popup so users can keep it open while browsing.
```

Required by the `side_panel` manifest key, and kept required because it has no warning and Chrome does not register a side panel granted at runtime until the extension reloads. The code does not call the `sidePanel` API. Invalid in Firefox, which uses `sidebar_action` instead.

### `contextMenus` (optional in Chrome and Edge)

```text
Optional in Chrome and Edge, never granted at install. When the user turns on Context Menu in Settings (off by default), the extension asks for this permission and adds a right-click menu on links so the user can save a link into a recent folder or the Bookmarks Bar. Turning the setting off removes the menu.
```

Code: `src/services/context-menu.ts`. The menu is registered for `link` contexts only. Firefox does not allow `contextMenus` as an optional permission, so it is declared at install there (no prompt), and the menu still appears only after the user turns the setting on.

### Optional host access: `http://*/*`, `https://*/*`

```text
Not granted at install. Requested at click time in three cases. (1) When the user runs Check Dead Links, Metadata Fetcher, or Refresh Site Icons, the browser asks for access to websites so the extension can request the bookmarked pages (and, for Refresh Site Icons, an icon file on each bookmarked site) directly; bookmarks can point to any site, so a narrower pattern is not possible. Requests are sent without cookies, and only the page head is read for titles and icon links. If the user declines, nothing is scanned. (2) When the user clicks Verify Service or Refresh Models for an AI provider, the browser asks for access to that one provider origin only. (3) When the user turns on Read page content in the AI settings, the browser asks for access to websites so folder recommendations, Auto-Tagging, and Content Summarizer can download the pages, without cookies, and send their readable text to the AI provider the user configured. Pages on the local network are never read. If the user declines, the setting stays off.
```

Code: `webAccess` and `pageReading` in `src/lib/permission-catalog.ts`, `requestProviderHostAccess` in `src/services/ai-settings.ts`, `requestWithTimeout` in `src/services/bookmark-network-tools.ts` (`credentials: 'omit'`), `readPageText` in `src/services/page-reader.ts`.

### Bookmarks page override (Chrome and Edge)

Not a permission, but reviewers check it. The `chrome_url_overrides.bookmarks` key replaces the browser's Bookmarks page with the Bookmark Scout manager. The listing says so in its own paragraph, as the Chrome Web Store expects for page overrides. The popup and side panel also open the manager with **Open bookmark manager**, which is the only way in from Firefox.

## Remote code (Chrome Web Store)

Answer "No, I am not using remote code." All JavaScript ships in the package. The only network calls are user-triggered requests to bookmarked pages and to the user's chosen AI provider API, and their responses are treated as data.

## Linter results

`bunx addons-linter@latest --output json apps/extension/dist/firefox-mv2` on 2026-10-03 reported 0 errors, 0 notices, and 8 warnings. The four manifest warnings of 2026-10-01 (`MANIFEST_PERMISSIONS` for `favicon` and `sidePanel`, `MISSING_DATA_COLLECTION_PERMISSIONS`, `MISSING_ADDON_ID`) are fixed. What remains is third-party library code:

| Code | Where | Meaning and action |
| --- | --- | --- |
| `DANGEROUS_EVAL` (2) | `background.js`, `chunks/theme-*.js` | Zod 4's capability probe `Function('')` inside `try`/`catch`. The extension CSP blocks it, and Zod falls back to its non-JIT path. Explain in reviewer notes. |
| `UNSAFE_VAR_ASSIGNMENT` (5) | `chunks/theme-*.js`, `chunks/PopupPage-*.js` | React DOM's `dangerouslySetInnerHTML` support. The extension source never uses `dangerouslySetInnerHTML` or `innerHTML` (checked with `grep`). Explain in reviewer notes. |
| `UNSAFE_VAR_ASSIGNMENT` (1) | `chunks/PopupPage-*.js` | "Unsafe call to `document().write`": the Markdown parser behind the Ask AI answers (`mdast-util-from-markdown`) calls `write` on its own tokenizer object, not on a DOM document. Explain in reviewer notes. |

Chrome and Edge have no equivalent offline linter; their review is manual.

## Package size

The 5.1 MB source icon (`icon-original.png`), which no manifest key or source file references, moved from `apps/extension/public/` to `store/assets/`, so it is no longer copied into every package or into the Firefox sources ZIP.
