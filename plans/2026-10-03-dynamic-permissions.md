# Dynamic Permissions and Firefox Add-ons Readiness

Date: 2026-10-03. Scope: `apps/extension` (manifest, permission module, popup and side panel, Options, background), the store and privacy material in `store/`, the docs privacy and permissions pages, and the website privacy messages.

## Maintainer decision

Across the whole product, ask for each permission only when the user runs the feature that needs it (optional permissions, requested at runtime). Ask at install only when the extension cannot work without the permission. Add an "Open bookmark manager" entry point to the popup and side panel, because Firefox cannot replace its bookmarks page and Firefox users have no other way into the manager.

## Research

Sources were checked on 2026-10-03.

### Which permissions can be optional

| Permission | Chrome and Edge (MV3) | Chrome install warning | Firefox (MV2 and MV3) | Firefox install prompt |
| --- | --- | --- | --- | --- |
| `bookmarks` | Optional allowed | "Read and change your bookmarks" | Optional allowed | "Read and modify bookmarks" |
| `tabs` | Optional allowed | "Read your browsing history". It also absorbs the `favicon` warning | Optional allowed | "Access browser tabs" |
| `activeTab` | Optional allowed | None | Optional allowed | None |
| `favicon` | Optional allowed. `_favicon/` checks the current permissions on every request | "Read the icons of the websites you visit" (hidden while `tabs` is present) | Not a Firefox permission | Not applicable |
| `sidePanel` | Optional allowed, but **broken**: a panel granted at runtime is registered only after the extension reloads | None | Not a Firefox permission; Firefox uses `sidebar_action` | Not applicable |
| `contextMenus` / `menus` | Optional allowed | None | **Optional not allowed**: Firefox's schema rejects it (MDN says otherwise) | None |
| `storage` | Optional allowed | None | **Optional not allowed** | None |

Sources: [Chrome permissions list and warnings](https://developer.chrome.com/docs/extensions/reference/permissions-list), [chrome.permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions), [Chromium permission message rules](https://github.com/chromium/chromium/blob/main/chrome/common/extensions/permissions/chrome_permission_message_rules.cc), [Chromium favicon_util.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/extensions/favicon/favicon_util.cc), [Chromium extension_side_panel_manager.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/ui/extensions/extension_side_panel_manager.cc), [chromium-extensions thread on optional sidePanel](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/c8QCs94o4d4/m/mfHrO_ByAQAJ), [Firefox menus.json schema](https://github.com/mozilla-firefox/firefox/blob/main/browser/components/extensions/schemas/menus.json), [Firefox manifest.json schema](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/schemas/manifest.json), [MDN optional_permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions), [Mozilla Discourse: contextMenus as an optional permission](https://discourse.mozilla.org/t/contextmenus-as-an-optional-permission/64181), [Firefox permission prompt strings](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/locales/en-US/toolkit/global/extensionPermissions.ftl). Edge follows Chromium ([Edge: declare permissions](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/declare-permissions)).

### activeTab, the popup, and the side panel

- Clicking the toolbar button grants `activeTab` before the popup opens, so the popup can read the active tab's URL and title without `tabs` ([activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [MDN user actions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/User_actions)). Context-menu clicks and keyboard commands grant it too.
- The side panel does **not** get `activeTab`, by design ([chromium-extensions thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/DET2SXCFnDg/m/wctQuRgFAAAJ)). It also stays open across tab switches, so it needs `tabs` to read the current page. Whether a Firefox sidebar gets `activeTab` is unverified; the code does not assume it.
- Without `tabs`, `activeTab`, or a host permission, `tabs.query` returns tabs without `url` and `title` ([chrome.tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)).

### Requests, denial, and revocation

- `permissions.request()` must run in a user gesture. Chrome accepts transient activation (about five seconds); Firefox requires the call to happen synchronously in the input handler, so any `await` before it, even `permissions.contains()`, makes it fail ([Chromium permissions_api.cc](https://github.com/chromium/chromium/blob/main/extensions/browser/api/permissions/permissions_api.cc), [Firefox ExtensionCommon.sys.mjs](https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/ExtensionCommon.sys.mjs), [bug 1398833](https://bugzilla.mozilla.org/show_bug.cgi?id=1398833)). Rule: call `request()` first thing in the click handler, from state already known.
- A denied request resolves `false`; asking again later is allowed. Chrome grants permissions without a warning (such as `contextMenus`) with no prompt.
- Users revoke optional permissions in `about:addons` (Firefox 84+) and site access in `chrome://extensions`; `permissions.onRemoved` fires. Since Chrome 130 the details page lists API permissions but cannot revoke them ([announcement](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/tqbVLwgVh58)); `permissions.remove()` still can ([Chromium permissions.md](https://chromium.googlesource.com/chromium/src/+/main/extensions/docs/permissions.md)).
- In Chrome, `chrome.contextMenus` is `undefined` until granted and appears live after a grant ([_api_features.json](https://github.com/chromium/chromium/blob/main/chrome/common/extensions/api/_api_features.json)), so the background script must register its click listener only when the API exists, and again after `onAdded`.
- Moving a permission from required to optional keeps it granted for existing users in Firefox 75+ ([bug 1618500](https://bugzilla.mozilla.org/show_bug.cgi?id=1618500)); Chrome keeps it in the granted set, so a later request does not prompt.

### Firefox data collection consent

- `browser_specific_settings.gecko.data_collection_permissions` is mandatory for new AMO listings since 2025-11-03 ([AMO blog](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/), [Extension Workshop](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)). Firefox 140 (desktop) and 142 (Android) show the consent.
- `required: ["none"]` with an `optional` list is valid. Optional categories are consented to only through `permissions.request({ data_collection: [...] })` from a user gesture; `contains()` and `getAll()` report them, and the user can withdraw them in `about:addons`.
- Data counts as collected when it is "handled outside of the add-on or the local browser" ([Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)). There is no exception for a provider the user picks, so the AI features collect data. Fetching a bookmarked URL from that same site (network tools) is not addressed; we treat it as not collection, because nothing goes anywhere but the site the bookmark already names, and say so in the reviewer notes.

### Tooling

- WXT drops `optional_host_permissions` from MV2 builds instead of converting it ([WXT manifest.ts](https://github.com/wxt-dev/wxt/blob/main/packages/wxt/src/core/utils/manifest.ts)), so the Firefox origins are added to `optional_permissions` by hand. WXT keeps `data_collection_permissions`.

## Decisions

### Required versus optional, per browser

| Permission | Chrome and Edge | Firefox | Feature that asks for it | Why |
| --- | --- | --- | --- | --- |
| `bookmarks` | Required | Required | Not applicable | Core: every surface reads the tree |
| `storage` | Required | Required | Not applicable | Every page reads settings; no warning; Firefox cannot make it optional |
| `activeTab` | Required (new) | Required (new) | Not applicable | No warning. Gives the toolbar popup and context-menu clicks the current page, replacing install-time `tabs` |
| `sidePanel` | Required | Not a permission | Not applicable | No warning, and optional `sidePanel` does not register the panel until a reload |
| `tabs` | **Optional** | **Optional** | Saving the current page or asking for AI folder suggestions from a page without `activeTab` (the side panel, or a popup opened without the toolbar button) | Removes "Read your browsing history" |
| `favicon` | **Optional** | Not a permission | Turning on **Use the browser's icon cache** (new setting, off by default) | Without `tabs`, `favicon` would add its own warning |
| `contextMenus` | **Optional** | Required (cannot be optional) | Turning on **Context Menu** in Settings | No warning in either browser, but the maintainer's rule applies where the browser allows it |
| Website access `http://*/*`, `https://*/*` | Optional (unchanged) | Optional (unchanged) | Network tools, Read page content, Verify Service and Refresh Models (one provider origin) | Already requested at click time |

Install-time warnings in Chrome, before: "Read and change your bookmarks", "Read your browsing history". After: "Read and change your bookmarks".

### Firefox data collection

`required: ["none"]`, `optional: ["authenticationInfo", "bookmarksInfo", "browsingActivity", "websiteContent"]`.

| Feature | Categories asked for | When |
| --- | --- | --- |
| AI features (folder suggestions, Ask AI, Auto-Tagging, Content Summarizer, AI Folder Reorganization) | `authenticationInfo` (the user's API key, sent to that provider), `bookmarksInfo` (bookmark titles, URLs, folder paths), `browsingActivity` (the current page's URL), `websiteContent` (the current page's title, and page text with Read page content) | Turning on **Enable AI** |
| Verify Service, Refresh Models | `authenticationInfo` | The button click, in the same request as the provider origin |
| Read page content | The AI categories plus website access | Turning the setting on |
| Network tools | None (requests go only to the bookmarked site) | Not applicable |

Every provider request goes through `createLoggingFetch` (`services/ai-activity.ts`), which refuses to send when the consent for its feature is missing, so no path can bypass it.

### Behavior

- **One module.** `src/lib/permission-catalog.ts` is a data table with no runtime dependencies: per permission, required or optional per browser; per feature, the API permissions, origins, data-collection categories, and copy keys. `manifest.config.ts` builds each manifest from it, so the manifest and the runtime cannot disagree. `src/services/permissions.ts` (`hasPermission`, `requestPermission`, `watchPermissions`) and `src/hooks/use-permission.tsx` (`usePermission`, `usePermissionGate`) read it. The existing web host access gate becomes the `webAccess` feature; `web-host-access.ts` and its hooks are removed.
- **Request.** From a click only, with `request()` as the first call. Settings switches that need a feature (`requiresPermission` in the settings schema) request it when turned on and stay off when declined. Actions whose browser prompt does not explain itself (website access, tab access) show a short explanation dialog first; the request runs from its **Allow** button.
- **Denial.** The feature stays off, a toast says what was declined and how to allow it later, and nothing retries on its own.
- **Revocation and sync.** A feature works only when its setting is on **and** its permission is granted. Revoking a permission turns the feature off right away (`permissions.onRemoved` rebuilds the context menu; pages re-check), and Options shows the switch as off. Stored settings are not rewritten: settings sync across devices, and revoking on one device must not turn a feature off on another where it is still granted. Turning the switch on again asks again.
- **Defaults.** Context Menu becomes off by default in every browser, so a fresh install never shows a switch that is on while the menu is missing; the setting and the docs say how to turn it on. In Firefox the permission is granted at install anyway, but one default keeps behavior and docs the same everywhere. Use the browser's icon cache is off by default; bookmarks show icons saved by Refresh Site Icons, or a generic icon, as in Firefox today.
- **Existing users.** Chrome keeps previously granted permissions in its granted set, so turning a feature back on does not prompt. In Firefox, AI stays unusable until the user turns it on again and consents, because no consent was recorded before.

### Open bookmark manager

An icon button in the popup and side panel header opens `bookmarks.html` in a new tab (`openBookmarkManager` in `services/bookmarks.ts`). It needs no permission; reusing an open manager tab would need `tabs`, so it always opens a new one.

## Phased PRs

Each lands with auto-merge before the next opens, from a local stack.

1. **Firefox AMO manifest** (`manifest.config.ts`, `wxt.config.ts`, lint paths, Firefox fixture, this plan). Permanent add-on ID `bookmark-scout@isandrel.github.io`, `strict_min_version` 140.0 and Android 142.0, data collection declared as required for now (true while nothing asks for it at runtime), no Chromium-only permissions in Firefox, no `_favicon/*` `web_accessible_resources`, the 5 MB source icon moved to `store/assets/`. Tests: `manifest-config.test.ts`, `favicon-access.spec.ts` (fails with the old entry), Firefox smoke with the real ID. Docs: `store/permissions.md`, the AMO and Edge checklists, `privacy-disclosures.md`, README templates, docs `status.mdx`.
2. **Open bookmark manager** (`BookmarkSearch.tsx`, `PopupPage.tsx`, `services/bookmarks.ts`, locales, `DESIGN.md`). Tests: Chromium E2E from the popup and side panel pages; Firefox smoke. Docs: store surface table, AMO checklist scope blocker, listings, docs browser support and status, README templates.
3. **Dynamic permissions** (catalog, module, hook, dialog, settings schema and Options, background and context menu, popup current-page gate, AI consent guard, icon cache setting, manifest from the catalog, E2E fixture `grantPermissions`). Tests: unit tests for grant, deny, revoke, and the Firefox request shapes; E2E for context menu enable to request, current-page denial and grant, icon cache enable, and the existing network tool request and denial paths. Docs, in the same PR: every file listed in the root `AGENTS.md` privacy rule, `store/checklists/*`, `store/README.md`, the docs settings and browser support pages, README templates, `apps/extension/AGENTS.md` (shared building block), the `extension-store-release` skill.

Verification for each: `bun install --frozen-lockfile`, `extension:lint`, `extension:typecheck`, `extension:test:unit`, the three builds, the unresolved-import scan, `extension:test:e2e`, `extension:test:e2e:firefox` with `SE_OFFLINE=true`, `addons-linter` on `dist/firefox-mv2`, and `website:lint`, `website:verify`, `docs:types:check`, `docs:build` when their files change.

## Out of scope

- Store submission, release tags, and listing screenshots.
- Edge runtime checks beyond the required `Edge E2E` CI job.
- Live permission prompts and the Firefox data-collection prompt: they cannot be answered headlessly, so they are manual checks. The tests use a pre-granted copy of the build or a stubbed `permissions.request`.
- Opening the side panel from the popup: `sidePanel.open()` after an awaited request is unreliable, and the panel stays a required, warning-free permission.
