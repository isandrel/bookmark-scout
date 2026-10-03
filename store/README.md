# Store Listing Material

Listing copy, permission justifications, privacy disclosures, the privacy policy text, screenshots, and submission checklists for the Chrome Web Store, Firefox Add-ons (AMO), and Microsoft Edge Add-ons.

> **Nothing here has been submitted to any store.** Submission is a manual step that requires explicit release approval from the maintainer. See the checklists.

Prepared on 2026-10-01 against extension version `0.2.0` (`apps/extension/package.json`). Re-check every claim against the code and docs when the version changes.

## Contents

| File | Purpose |
| --- | --- |
| [`listings/en.md`](listings/en.md) | English name, summaries, full descriptions, categories, and search terms for each store |
| [`listings/ja.md`](listings/ja.md) | Japanese listing copy |
| [`listings/ko.md`](listings/ko.md) | Korean listing copy |
| [`permissions.md`](permissions.md) | Permission-by-permission justification from the built manifests, the Chrome single-purpose statement, and linter results |
| [`privacy-disclosures.md`](privacy-disclosures.md) | Data inventory and the answers for each store's privacy questions |
| [`privacy-policy.md`](privacy-policy.md) | Privacy policy text, published at <https://bookmark-scout.com/en/privacy/> (also `/ja/privacy/` and `/ko/privacy/`) |
| [`checklists/chrome-web-store.md`](checklists/chrome-web-store.md) | Chrome Web Store submission gates |
| [`checklists/firefox-amo.md`](checklists/firefox-amo.md) | Firefox Add-ons submission gates |
| [`checklists/edge-addons.md`](checklists/edge-addons.md) | Edge Add-ons submission gates |
| [`screenshots/`](screenshots/) | Curated 1280x800 screenshots and a 440x280 promo tile |

## Hosted pages

The stores link to two pages on the website, each published in English, Japanese, and Korean once the website deploys from `main`:

| Page | English URL | Other locales | Source |
| --- | --- | --- | --- |
| Privacy policy | <https://bookmark-scout.com/en/privacy/> | `/ja/privacy/`, `/ko/privacy/` | [`privacy-policy.md`](privacy-policy.md) and `apps/website/messages/privacy/` |
| Support | <https://bookmark-scout.com/en/support/> | `/ja/support/`, `/ko/support/` | `apps/website/messages/support/` |

Contact addresses come from `config/project.toml` (`[contact]`): `support@bookmark-scout.com` for help, `privacy@bookmark-scout.com` for privacy requests, and `security@bookmark-scout.com` for vulnerability reports.

## Why a root `store/` folder

The material lives at the repository root, not under `apps/extension/`:

- `wxt.config.ts` zips `apps/extension/**` into the Firefox review sources archive. Screenshots and listing copy under `apps/extension/` would inflate that archive and the files AMO reviewers must read.
- Nx treats files under `apps/extension/` as extension inputs, so editing listing copy there would invalidate extension build and test caches.
- The material covers three stores and the release process, not extension source code.

## What each browser build actually contains

Derived from `apps/extension/dist/*/manifest.json` after `bunx nx run extension:build:chrome|firefox|edge` on 2026-10-01.

| Surface | Chrome (MV3) | Edge (MV3) | Firefox (MV2) |
| --- | --- | --- | --- |
| Toolbar popup | Yes | Yes | Yes |
| Side panel | `side_panel` | `side_panel` | `sidebar_action` is declared, but the docs say Firefox has no side panel and nothing tests it. Do not claim it. |
| Bookmarks manager and Tools sidebar | Replaces `chrome://bookmarks` (`chrome_url_overrides.bookmarks`) | Same manifest key. Whether Edge applies it to its Favorites page has not been checked. | **Not reachable.** Firefox has no bookmarks-page override, the key is absent, and no UI links to `bookmarks.html`. |
| Options page | Yes | Yes | Yes |
| Context menu save | Yes | Yes | Yes |
| Site icons (favicons) | `_favicon` API, or icons saved by Refresh Site Icons | Same | Only icons saved by Refresh Site Icons, which runs in the manager. The `favicon` permission is Chromium-only. |
| Optional website access | `optional_host_permissions` | `optional_host_permissions` | `optional_permissions` (added by the WXT hook) |

As a result, the Firefox listing describes a smaller feature set: maintenance tools, import/export, saved searches, statistics, and the manager-only AI tools are not reachable in Firefox today.

## Test coverage behind the claims

- Chromium: unit tests and Playwright E2E tests cover popup, manager, settings, maintenance, reports, import/export, network tools (route-mocked and a real local server), and AI tools against mocked providers.
- Edge: the same Playwright E2E suite runs against the Edge build (`nx run extension:test:e2e:edge`).
- Firefox: an eight-test smoke suite runs against the Firefox build (`nx run extension:test:e2e:firefox`): popup search and folder creation, saved site icons in the popup, the side panel page, manager loading, a settings save, a JSON export and import round trip, and the statistics and privacy reports. Context menus, drag and drop, and network and AI tools are not covered there.
- The Edge and Firefox CI jobs are required checks for merging into `main`.
- Real AI providers and live network behavior are checked by hand, not by automated tests.

The listings avoid claims that only Chromium testing supports when they are written for Firefox or Edge.

## Store image sizes

| Asset | Chrome Web Store | Firefox Add-ons | Edge Add-ons |
| --- | --- | --- | --- |
| Screenshots | 1280x800 or 640x400, up to 5, JPEG or 24-bit PNG without alpha | 1280x800 recommended (assumed; AMO accepts other sizes and scales them) | 1280x800 or 640x480, up to 10 (assumed) |
| Small promo tile | 440x280 | Not used | 440x280, optional (assumed) |
| Store icon or logo | 128x128 from the package | From the package | 300x300 logo for the listing (assumed; not prepared) |

The limits marked "assumed" are from memory of each store's documentation as of this date and were not checked against the live dashboards. Confirm them during submission.

All curated screenshots are 1280x800 24-bit RGB PNGs without alpha, so one set works in all three stores.

## Screenshots

| File | Shows |
| --- | --- |
| `01-popup-light.png` | Popup folder tree and search, light theme (composed on a 1280x800 frame with a caption) |
| `02-manager-light.png` | Bookmarks manager in a folder, light theme |
| `03-tools-duplicates-light.png` | Tools sidebar with a Duplicate Cleaner review, light theme |
| `04-options-ai-light.png` | Options, AI tab with AI off (the default), light theme |
| `05-popup-dark.png` | Popup, dark theme |
| `06-manager-dark.png` | Bookmarks manager, dark theme |
| `07-tools-duplicates-dark.png` | Duplicate Cleaner review, dark theme |
| `08-options-ai-dark.png` | Options, AI tab, dark theme |
| `promo-small-440x280.png` | Small promo tile (Chrome, Edge) |

Suggested order for the Chrome Web Store (5 maximum): 01, 02, 03, 04, 06. Firefox: 01, 04, 05, 08 (the popup and options only; the manager is not reachable there). Edge: all eight, after the Edge manager check in the Edge checklist.

### How they were made

- Chrome build of this commit, loaded into a disposable headless Chromium profile with the `extension-exploratory-qa` runner (`.agents/skills/extension-exploratory-qa/`). No real profile and no personal data.
- Synthetic bookmarks only: public documentation sites, `example.com` and `example.org` placeholder URLs, and two deliberate duplicates for the Duplicate Cleaner.
- Theme left at the default `system`; light and dark come from the emulated OS color scheme, so Options shows no "Modified" badges.
- The runner opens the popup as a tab, so its "current tab" would be the popup itself. The capture script stubbed `tabs.query` for the active tab to return a public MDN page instead. No other behavior was changed.
- Site icons are real: before capturing, the script ran **Refresh Site Icons** over all bookmarks and saved the results, in a copy of the build whose manifest grants the optional website access (as the E2E `grantWebHostAccess` fixture does, because the permission prompt cannot be answered headlessly). Icons came only from the bookmarked sites. Sites without a usable same-site icon (`developer.chrome.com`, `example.com`, `example.org`) keep the generic globe, as they would for a user.
- Recaptured on 2026-10-02 from `main` after the Refresh Site Icons tool landed (#501). The same eight files are copied to `apps/website/public/screenshots/` and `apps/docs/public/screenshots/`; the website generates its AVIF and WebP variants from them at build time.
- Raw captures stay in `~/.cache/bookmark-scout-qa/store-icons/` (not committed). Curated files were re-encoded with ImageMagick (reduced palette, saved as 24-bit RGB without alpha) to keep each file around 75 to 130 KB.

Screenshots show the English UI. Localized screenshots for `ja` and `ko` were not produced; the stores accept the English set for every locale.
