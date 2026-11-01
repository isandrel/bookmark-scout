---
name: extension-firefox
description: Build and check the Firefox side of the Bookmark Scout extension the way Mozilla's Extension Workshop asks - where Firefox differences live (browser profiles, build targets, permission and command catalogs), the Manifest V3 event page and what suspends it, data collection consent, private windows, accessibility shortcuts, why there is no Android build, and how to test Firefox. Use whenever something works in Chrome but not Firefox, a change touches Firefox-specific code or the Firefox manifest, the user asks about Firefox, Firefox for Android, about:addons, about:debugging, the sidebar, or Mozilla's develop guidance, or asks to make Firefox code configurable or easier to manage. Publishing to AMO is extension-store-release; the Firefox test suite details are extension-feature-test.
---

# Firefox

Firefox is a supported browser with its own build (`dist/firefox-mv3`). Most code is shared; the differences live in tables, so supporting a difference is a table entry, not a browser-name check. Mozilla's guidance: [Extension Workshop, Develop](https://extensionworkshop.com/documentation/develop/) (reviewed 2026-10-31). Publishing: `extension-store-release`.

## Where the differences live

- **Runtime capabilities:** `apps/extension/config/browsers/profiles.toml`, read by `src/lib/browser-profiles.ts`; code asks `browserProfile()` (separators, private window wording, data collection consent, bookmark manager URL, shortcut settings page, address bar markup). Never compare browser names; `tests/unit/browser-profiles.test.ts` fails on it.
- **Build time:** `apps/extension/build/browser-targets.toml` sets the Manifest version of every build (WXT would build Firefox as V2), and `buildFolder(browser)` gives a build's folder. `manifest.config.ts` adds the `gecko` block (add-on ID, `strict_min_version` 140, `data_collection_permissions`).
- **Permissions and commands:** per-browser tables in `src/lib/permission-catalog.ts` (required or optional, origins, data collection categories) and `src/lib/command-catalog.ts`. Chromium-only permissions (`favicon`, `sidePanel`) stay out of Firefox's list.

## Runtime rules Firefox enforces

- **Event page.** The Manifest V3 background is `background.scripts`, a page Firefox suspends after about 30 seconds idle. Register listeners at the top level, keep state in storage, use `alarms` instead of timers, and let long work resume as background jobs do (`extension-background-jobs`). Firefox's page can hold a frame (the AI host runs there), unlike Chrome's service worker, which uses an offscreen document.
- **Promises only.** Use WXT's `browser.*`; Firefox's `browser` has no callbacks.
- **Permission requests first.** Firefox rejects `permissions.request` after any `await` in the click handler: call `requestPermission(feature)` first. Optional data collection categories are requested with the permission that sends the data, and Firefox shows them in its own prompt (`dataCollectionNoteKey` in the catalog).
- **No `browser_style`.** Manifest V3 has none; the MV2 build used to default it on for the options page and sidebar, which restyled them.
- **Private windows.** Mozilla's policies forbid storing data from private browsing: check `inPrivateWindow()` before keeping anything a page collects from its own use (`apps/extension/AGENTS.md`).
- **No markup in address bar suggestions.** Firefox shows Chrome's `<match>` markup as text (`omnibox_markup` in the profiles).

## Mozilla's develop guidance, as applied

- **Onboarding:** the welcome page opens on a first install only, and not for an `about:debugging` temporary install (`open_on_temporary_install` in `config/ui/welcome.toml`). The maintainer declined an uninstall feedback page and an update page for now (2026-10-31); do not add them unasked.
- **Accessibility:** give the toolbar button and the sidebar commands users can assign keys to (`_execute_action`, `_execute_sidebar_action`, declared without keys), and when a badge shows a result, put its meaning in the button title.
- **Permissions:** ask at the moment of use, explain each in the AMO listing (`store/listings/`), and keep install to the bookmarks prompt.
- **Security:** no remote code, no relaxed CSP, nothing injected into pages except the quick save notification in a closed shadow root that sets text only, never `moz-extension://` URLs.

## No Android

Firefox for Android has no `bookmarks` API (MDN compatibility data), nor sidebar, commands, menus, or omnibox, so the add-on cannot work there. The manifest has no `gecko_android`, which would make AMO list it for Android and lock that setting; addons-linter's resulting `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` warning is expected and explained in `store/permissions.md`. Re-evaluate only if Mozilla adds `bookmarks` on Android.

## Testing

- `nx run extension:test:e2e:firefox` runs the smoke suite through geckodriver (`tests/e2e-firefox/`; Playwright cannot open `moz-extension://` pages). It sets a 2-second background idle time, so every test crosses event page suspensions. Run it locally for any Firefox-facing change (`SE_OFFLINE=true` when Selenium Manager hangs).
- Lint the package: `bunx addons-linter@latest --output json apps/extension/dist/firefox-mv3`; the known warnings and their reasons are in `store/permissions.md`.
- By hand: `about:debugging` > This Firefox > Load Temporary Add-on (pick `dist/firefox-mv3/manifest.json`); install prompts and permission warnings appear only for a packaged install ([Test permission requests](https://extensionworkshop.com/documentation/develop/test-permission-requests/)).
