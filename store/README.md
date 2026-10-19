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
| [`privacy-policy.md`](privacy-policy.md) | Privacy policy text, published at <https://bookmark-scout.com/privacy/> (other languages at `/<locale>/privacy/`) |
| [`checklists/chrome-web-store.md`](checklists/chrome-web-store.md) | Chrome Web Store submission gates |
| [`checklists/firefox-amo.md`](checklists/firefox-amo.md) | Firefox Add-ons submission gates |
| [`checklists/edge-addons.md`](checklists/edge-addons.md) | Edge Add-ons submission gates |
| [`screenshots/`](screenshots/) | Curated 1280x800 screenshots and a 440x280 promo tile |

## Hosted pages

The stores link to two pages on the website, each published in every website language (`[locales] supported` in `config/project.toml`): English without a language prefix, the others under `/<locale>/`. The old `/en/...` URLs redirect permanently to the unprefixed ones.

| Page | English URL | Other locales | Source |
| --- | --- | --- | --- |
| Privacy policy | <https://bookmark-scout.com/privacy/> | `/<locale>/privacy/`, such as `/ja/privacy/` | [`privacy-policy.md`](privacy-policy.md) and `apps/website/messages/privacy/` |
| Support | <https://bookmark-scout.com/support/> | `/<locale>/support/`, such as `/ja/support/` | `apps/website/messages/support/` |

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
| Side panel | `side_panel` | `side_panel` | `sidebar_action`: the same page in the Firefox sidebar. Checked by hand in Firefox 157 on 2026-10-09; the smoke suite loads the page in a tab, not the sidebar itself. |
| Bookmarks manager and Tools sidebar | Replaces `chrome://bookmarks` (`chrome_url_overrides.bookmarks`), and opens in a new tab from **Open bookmark manager** in the popup and side panel | Same manifest key and button. Whether Edge applies the override to its Favorites page has not been checked. | Opens in a new tab from **Open bookmark manager** in the popup. Firefox has no bookmarks-page override, so the key is absent. |
| Settings page | Yes | Yes | Yes |
| Quick save shortcuts | `quick-save` (Alt+Shift+S) and `ai-quick-save` (Alt+Shift+D); the user can give quick save Ctrl+D at `chrome://extensions/shortcuts`, where it replaces the browser's bookmark dialog | Same, at Edge's shortcut page | Same defaults, rebound in Settings > Saving & Search > Keyboard shortcuts; Firefox keeps Ctrl+D and Ctrl+Shift+D, so those fields refuse them |
| Context menu save | After the user turns on Right-Click Menu (off by default; asks for the optional `contextMenus`) | Same | After the user turns on Right-Click Menu (`contextMenus` is granted at install; Firefox cannot make it optional) |
| Site icons (favicons) | Icons saved by Refresh Site Icons, and the `_favicon` cache once the user turns on Use the browser's icon cache (optional `favicon`) | Same | Only icons saved by Refresh Site Icons, which runs in the manager. The `favicon` permission is Chromium-only. |
| Optional website access | `optional_host_permissions` | `optional_host_permissions` | `optional_permissions` (added by the WXT hook) |
| Other optional permissions | `tabs` (side panel saves), `favicon`, `contextMenus` | Same | `tabs`; AI data collection consent (`data_collection_permissions`, optional) |

The Firefox listing still describes a smaller feature set: it covers the manager's editing features (right-click menus, cut, copy, and paste, drag and drop, undo), which the Firefox smoke suite tests, but not its maintenance, network, and AI tools, Ask AI, or local AI agents, which have not been checked by hand in Firefox (see the AMO checklist).

## Test coverage behind the claims

- Chromium: unit tests and Playwright E2E tests cover popup, manager, settings, maintenance, reports, import/export, network tools (route-mocked and a real local server), and AI tools against mocked providers.
- Edge: the same Playwright E2E suite runs against the Edge build (`nx run extension:test:e2e:edge`).
- Firefox: a smoke suite runs against the Firefox build (`nx run extension:test:e2e:firefox`): popup search and folder creation, saved site icons in the popup, the side panel page, opening the manager from the popup and side panel, manager loading, the search in the manager's address, Delete and undo, the folder tree keys, the manager's right-click menu (copy and paste), drag and drop in the manager, recording quick save keys in Settings, a settings save, AI data collection consent, a tool run's request for only its bookmarks' sites, a JSON export and import round trip, and the statistics and privacy reports. The link context menu, the quick save shortcut itself, and network and AI tools are not covered there.
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
| `01-popup-{light,dark}.png` | The two ways to pick a folder, side by side with no added text: "fin" typed with the nested AI / LLMs / Fine-tuning folder selected under Save to folder and the **Page to save** line, and AI folder suggestions for another page (a new AI/LLMs/Inference folder and the existing AI/LLMs) |
| `02-quick-save-{light,dark}.png` | A developer guide (Toolcall Journal, a fictional publication) after quick save: the in-page notification says Saved to Agents, Bookmarks Bar / AI / Agents, with Undo and Papers under Move to |
| `03-manager-{light,dark}.png` | Bookmarks manager on AI / LLMs / Fine-tuning, each bookmark with its real site icon, including the page saved from the popup |
| `04-tools-duplicates-{light,dark}.png` | Tools sidebar with a Duplicate Cleaner review of two bookmarks saved twice (MDN Web Docs, Hacker News) |
| `05-settings-{light,dark}.png` | Settings, Essentials tab |
| `06-options-ai-{light,dark}.png` | Settings, AI tab with AI on and two services the user brought, under Add service: a cloud provider with its key (masked) and a model on the computer |
| `promo-small-440x280.png` | Small promo tile (Chrome, Edge) |

Suggested order for the Chrome Web Store (5 maximum): `01-popup-light.png`, `02-quick-save-light.png`, `03-manager-light.png`, `04-tools-duplicates-light.png`, `05-settings-light.png`. Firefox: 01, 02, 05, and 06 (the popup, quick save, and settings, which the Firefox description covers). Edge: all twelve, after the Edge manager check in the Edge checklist.

### How they were made

To recapture, run the scripts in `.agents/skills/extension-cws-submission/` (see that skill).


- Chrome build of this commit, loaded into a disposable headless Chromium profile with the `extension-exploratory-qa` runner (`.agents/skills/extension-exploratory-qa/`). No real profile and no personal data.
- Synthetic bookmarks only, on real public sites, so their real icons show, with two deliberate duplicates for the Duplicate Cleaner. Since 2026-10-18 they are the tech and AI tree of the promo video (see the last entry below); before that they were everyday, non-developer bookmarks.
- Theme left at the default `system`; light and dark come from the emulated OS color scheme, so Essentials shows no "Modified" badges (the AI frame shows one on AI Features, which it turns on).
- The pages being saved are answered locally by Playwright routes on the reserved example domains (no real site's content); since 2026-10-18 they are the three original articles in `.agents/skills/extension-cws-submission/assets/pages/`. Quick save is fired through the background's real command listener, as the E2E tests do. The runner opens the popup as a tab, so its "current tab" would be the popup itself; the capture script stubs `tabs.query` for the active tab to return the same page. No other behavior was changed.
- Site icons are real: before capturing, the script ran **Refresh Site Icons** over all bookmarks and saved the results, in a copy of the build whose manifest grants the optional website access (as the E2E `grantWebHostAccess` fixture does, because the permission prompt cannot be answered headlessly). Icons came only from the bookmarked sites. A site without a usable same-site icon keeps the generic globe, as it would for a user; the bookmarks were chosen so every site has one (the sample page on `example.com` is not bookmarked).
- Recaptured on 2026-10-02 from `main` after the Refresh Site Icons tool landed (#501). All eight were recaptured on 2026-10-08 for the redesigned UI: the popup pair (`01`, `05`) is composed from two 400×500 popup captures on the brand paper color with the Bricolage Grotesque heading, and the other six are plain 1280×800 page captures. The store icon (`store/assets/store-icon-128.png`, artwork 96 px tall on a 128 px canvas), the small promo tile, and the marquee tile (`store/assets/marquee-1400x560.png`) were made from `store/ai-asset-prompts.md`: AI-generated backgrounds and a cleaned logo master (`store/assets/logo-master-2048.png`), with the real logo and title composited afterwards. They are used for the store listing only; the packaged toolbar icons are unchanged.
- Recaptured on 2026-10-10 for the save-first listing: the popup pair (`01`, `05`) now shows the two ways to pick a folder: typing `pas` with ↓ selecting Recipes / Italian / Pasta, and AI folder suggestions for the page (an existing folder and a new one). The suggestions come from a stubbed provider (`ai.example.invalid`, answered by a Playwright route, so no request leaves the machine); AI is turned off again before the next capture, so the Options screenshots still show the default. The other six were recaptured unchanged.
- Raw captures stay in `~/.cache/bookmark-scout-qa/store-icons/` (not committed). Curated files were re-encoded with ImageMagick (reduced palette, saved as 24-bit RGB without alpha) to keep each file around 75 to 130 KB.

- Recaptured on 2026-10-15 for newcomers, after the Essentials settings, manager defaults, and AI onboarding landed (#675, #676, #677): everyday bookmarks, a new quick save frame (`02`) and Essentials frame (`05`), the manager on the Bookmarks Bar, the AI tab's "AI is optional" box, and no headline baked into the popup pair. Files are numbered by frame, with `-light` and `-dark` versions of each (twelve in all).
- Recaptured on 2026-10-18 for 0.3.4, after the manager rows and columns (#691), provider icons (#694), and built-in AI (#696) landed. Headless Chromium cannot run Chrome's built-in model, so for the AI frame (`06`) the capture script installs a stand-in `LanguageModel` that reports the model as downloadable, which is what a computer that can run it shows ("Free on this computer" with **Use built-in AI**). Nothing is downloaded or run.
- Recaptured on 2026-10-18 to match the new promo video, at the maintainer's request for a tech and AI example everywhere. This supersedes the earlier choice of everyday, non-developer bookmarks. The folders are the video's: AI / LLMs / Fine-tuning, AI / Agents, AI / Papers, Dev / TypeScript, Rust, and Python, Design / UI, Tools, and Reading list, with a few more bookmarks in Fine-tuning and Papers, all on real public sites that serve their own icons (the run stops if any site is left without one). A paper about agents in Papers gives quick save a second folder to offer under Move to. The pages being saved are three original articles under fictional publications, each with its own text, code block, diagram, geometric avatar, and neutral icon: Tensor Gazette (`www.example.com/blog/fine-tuning-small-llms-with-lora`), Toolcall Journal (`www.example.org/guides/building-agents-with-mcp`), and Prefix Weekly (`www.example.net/issues/prompt-caching-explained`), answered locally. The frames: `fin` typed with AI / LLMs / Fine-tuning selected, beside stubbed AI suggestions (a new AI/LLMs/Inference folder and AI/LLMs, from `ai.example.invalid`, answered by a route); quick save of the Toolcall Journal page into AI / Agents; the manager on Fine-tuning after the popup saved the Tensor Gazette page there; Duplicate Cleaner; Essentials; and Settings > AI with two services the user brought, a cloud provider whose key is the dummy `sk-demo-not-a-real-key-000000` (masked on screen; every web request from that page was aborted) and a model on the computer. The built-in `LanguageModel` is stubbed as before. Pages are captured at 2x and composed in the video's look: brand paper (`#f4f7fb`, dark `#0d1b2a`) with faint static contour lines, and the UI flat and upright at 7/8 size (the popups at 1.2x) in a window with a 1px line border and one soft shadow; no tilt, glow, gradient, grain, or added text. The small promo tile is unchanged.

Screenshots show the English UI. Localized screenshots were not produced; the stores accept the English set for every locale, and no frame carries added English text.
