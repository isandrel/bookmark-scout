# Firefox Add-ons (AMO) Submission Checklist

> **Submission is manual and requires explicit approval.** No agent or workflow uploads to addons.mozilla.org. Do not start this checklist until the maintainer has approved both the release and the AMO submission for this version in writing.

## Blockers found on 2026-10-01

These must be resolved, by a code change and a new release, before a first AMO listing:

- [x] **Add-on ID.** `bookmark-scout@isandrel.github.io` in `browser_specific_settings.gecko.id` (`apps/extension/manifest.config.ts`). It cannot change after the first upload. The Firefox smoke suite installs the build with this ID.
- [x] **Data collection declaration.** `browser_specific_settings.gecko.data_collection_permissions` declares `required: ["none"]` and the AI categories as `optional`, which the extension requests when the user turns on AI (see [`../privacy-disclosures.md`](../privacy-disclosures.md#firefox-add-ons-data-collection-declaration)), with `strict_min_version` 140.0 for desktop and 142.0 for Android, the first versions that support it. The linter reports no manifest warnings.
- [x] **Scope decision.** The popup and side panel have an **Open bookmark manager** button, so the manager and Tools sidebar are reachable in Firefox. The Firefox description in [`../listings/en.md`](../listings/en.md) stays short until the manual checks below cover the manager tools.
- [x] The Chromium-only `favicon` and `sidePanel` permissions are left out of the Firefox manifest, and the broad `_favicon/*` `web_accessible_resources` entry is gone.

## 0. Approval

- [ ] Maintainer approval for release `vX.Y.Z` recorded (link):
- [ ] Maintainer approval for AMO submission of `vX.Y.Z` recorded (link):

## 1. Version and release package

Follow the release runbook in the root `AGENTS.md`.

- [ ] `apps/extension/package.json` `version` is `X.Y.Z` and higher than any version already on AMO.
- [ ] The `Release Extension` workflow for `vX.Y.Z` finished green.
- [ ] Download both release assets:
  - `bookmark-scout-vX.Y.Z-firefox.zip` (the add-on)
  - `bookmark-scout-vX.Y.Z-sources.zip` (source code for review)
- [ ] Unzip the add-on and confirm `manifest.json` has `"version": "X.Y.Z"`, the expected permissions, and the `gecko` block.
- [ ] `bunx addons-linter bookmark-scout-vX.Y.Z-firefox.zip` reports 0 errors. Known warnings and their explanations are in [`../permissions.md`](../permissions.md#linter-results).
- [ ] Reproduce the build from the sources ZIP in an empty folder with [`apps/extension/SOURCE_CODE_REVIEW.md`](../../apps/extension/SOURCE_CODE_REVIEW.md) (`bun install --frozen-lockfile`, then `bun run build:firefox` in `apps/extension`), and compare `dist/firefox-mv2` with the add-on ZIP from the CI release, not with a local developer build: clean rebuilds from the sources ZIP match each other byte for byte, but a build in a developer checkout differs in minified identifier names. AMO reviewers will do the same.

## 2. Manual smoke test in Firefox

The required `Firefox E2E smoke` CI check covers popup search and folder creation, saved site icons, the side panel page, opening the manager from the popup and side panel, manager loading, a settings save, JSON export and import, and the statistics and privacy reports. It also covers the manager's right-click menu, drag and drop, undo, and folder tree keys, separators, search operators, recording quick save keys in Options, AI data collection consent, a tool run's request for only its bookmarks' sites, Check Dead Links, Metadata Fetcher, Index Page Text, and AI Folder Reorganization as background tasks (against local stub sites and a stub provider), Fetch Covers, Use this view as the cover, Capture Covers While Browsing, the bookmark preview, and a Smart Rule from Settings to the Tools sidebar. It does not cover the link right-click menu, pressing the quick save shortcuts, AI folder suggestions, Ask AI, a real AI provider, or the real sidebar, so every other claim in the Firefox description needs a manual check in a fresh Firefox profile with synthetic bookmarks (`about:debugging` → Load Temporary Add-on):

- [ ] Popup: instant search with match case, whole word, and regex.
- [ ] Folder tree: drag and drop, expand and collapse all, new folder.
- [ ] Save the current page to a folder; saving it again into the same folder does nothing.
- [ ] Install shows "Read and modify bookmarks" and that the extension doesn't require data collection.
- [ ] Right-click a link: no save menu until Right-Click Menu is turned on in Settings; then save a link into a recent folder.
- [ ] Turning on AI asks Firefox's data collection consent; declining leaves AI off. Withdrawing it in `about:addons` → Permissions turns AI off.
- [ ] Saving the current page from the sidebar asks for tab access ("Access browser tabs"); the popup saves without asking.
- [ ] Keyboard shortcuts in the popup.
- [ ] Quick save: ⌥⇧S on Mac (Alt+Shift+S on Windows and Linux) on a web page saves it and shows the in-page notification; Undo and Move work. With AI on and a test provider, ⌥⇧D on Mac (Alt+Shift+D on Windows and Linux) saves to the first suggestion.
- [ ] Back up settings saves a backup of the chosen parts, and Restore settings shows the review and restores it.
- [ ] Turning on Capture Covers While Browsing (Settings > Page Details, with Fetch Covers on) asks for access to all websites ("Access your data for all websites"); declining leaves it off.
- [ ] **Open bookmark manager** in the popup opens the manager in a new tab. Before the description claims the manager tools, run Duplicate Cleaner, Check Dead Links (allow website access when asked), and an import there.
- [ ] Delete with confirmation and Undo.
- [ ] Options: themes, language, AI off by default.
- [ ] AI folder suggestions with a test provider (for example local Ollama), if the description keeps them.
- [ ] Settings sync behavior (with Firefox Sync, if available).
- [ ] How bookmark icons render (the `favicon` API does not exist in Firefox).
- [x] The declared sidebar (`sidebar_action`) works: Bookmark Scout appears in the Firefox sidebar (checked by hand in Firefox 157 on 2026-10-09). The docs, README, website, and Firefox listing now say so.
- [ ] The screenshots were captured in Chromium; confirm the Firefox popup and options look the same, or capture Firefox versions.

## 3. Listing

- [ ] Name: from the package.
- [ ] Summary (250 characters maximum) and description: "Firefox Add-ons" sections of the 12 listings: [`en`](../listings/en.md), [`zh_CN`](../listings/zh_CN.md), [`es`](../listings/es.md), [`fr`](../listings/fr.md), [`pt_BR`](../listings/pt_BR.md), [`ru`](../listings/ru.md), [`id`](../listings/id.md), [`de`](../listings/de.md), [`ja`](../listings/ja.md), [`ko`](../listings/ko.md), [`it`](../listings/it.md), [`zh_TW`](../listings/zh_TW.md) (the order of `[locales] extension` in `config/project.toml`). AMO stores a separate listing per locale.
- [ ] Category: Bookmarks.
- [ ] Platform: Firefox desktop only. Do not enable Firefox for Android; it does not provide the `bookmarks` API the extension needs.
- [ ] Screenshots: `01-popup-light.png`, `02-quick-save-light.png`, `05-settings-light.png`, `06-options-ai-light.png`, and the dark versions if wanted. Not the manager or Tools screenshots.
- [ ] Homepage `https://bookmark-scout.com`, support site `https://bookmark-scout.com/support/`, support email `support@bookmark-scout.com` (confirm the alias reaches a monitored inbox).
- [ ] License: GNU Affero General Public License v3.0.
- [ ] Privacy policy: `https://bookmark-scout.com/privacy/`; AMO also accepts the policy text, which is in [`../privacy-policy.md`](../privacy-policy.md). Confirm the page is live after the website deploys from `main`.
- [ ] "Requires payment, non-free services or software": unchecked (see [`../privacy-disclosures.md`](../privacy-disclosures.md)).

## 4. Notes to reviewer

No test account is needed. Paste:

```text
No account or login is required. Build instructions for the attached sources are in apps/extension/SOURCE_CODE_REVIEW.md (Bun 1.3+, `bun install --frozen-lockfile`, then `bun run build:firefox` in apps/extension; output in apps/extension/dist/firefox-mv2).

The bundle is built with WXT and Vite from TypeScript and React sources; nothing is minified by hand and no code is loaded remotely.

Linter notes:
- DANGEROUS_EVAL: Zod 4 probes `Function('')` inside try/catch to detect JIT support. The extension CSP blocks it and Zod uses its non-JIT path.
- UNSAFE_VAR_ASSIGNMENT: React DOM's dangerouslySetInnerHTML support code. The extension source never uses dangerouslySetInnerHTML or innerHTML. The "document().write" call is the Markdown parser (mdast-util-from-markdown) writing to its own tokenizer, not to a DOM document, and the same parser decodes named character references through a detached element. The two innerHTML assignments in the page reader are Mozilla Readability working on its own copy of a downloaded page, parsed with DOMParser, which runs no scripts and is never shown.

AI features are off by default and need the user's own provider key (Settings > AI); a local Ollama server works without a key. The data collection categories are optional: Firefox asks for them when the user turns on AI (or clicks Verify Service, for authenticationInfo only), and the extension sends nothing to a provider without that consent. Nothing is ever sent to the developer. Check Dead Links, Metadata Fetcher, Refresh Site Icons, Index Page Text, and Fetch Covers declare no data collection: each request goes only to the bookmarked site itself (for Fetch Covers, also the preview image the page names), without cookies, and what they read stays on the device. So does Capture Covers While Browsing, which keeps pictures of bookmarked pages on the device.

At install the extension asks only for bookmarks; storage, activeTab, scripting (the quick save notification in the tab a shortcut was pressed in), alarms (picking up background tasks), and contextMenus show no prompt (Firefox does not allow contextMenus as optional; the menu appears only after the user turns on Right-Click Menu). Everything else is optional and requested only when the user runs or turns on the feature that needs it: tabs when saving the current page from the sidebar; website access (http/https) for the sites of one run of Check Dead Links, Metadata Fetcher, Refresh Site Icons, Index Page Text, or Fetch Covers, or for all websites with Read page content; <all_urls> only for Capture Covers While Browsing (off by default), because taking a picture of a tab without a click needs it.

nativeMessaging is optional too, requested with the bookmarksInfo and browsingActivity categories (page text reaches agents only while Read page content, which asks for websiteContent itself, is on) when the user turns on "Allow local AI agents" (Settings > For developers, off by default). It lets AI agents the user runs on the same computer look up bookmarks through the open-source bookmark-scout-mcp program the user installs separately (packages/mcp-bridge in the sources; its manifest allows only this add-on's id). The program talks to agents only over a per-user socket, never a network port, and nothing is sent to the developer. Every change an agent asks for waits for the user's approval in an extension window.
```

## 5. Submit and follow up

- [ ] Choose "On this site" (listed) distribution.
- [ ] Upload the add-on ZIP, then the sources ZIP when asked whether source code is needed (answer yes: the code is bundled).
- [ ] Submit (manual, by the maintainer or with their explicit go-ahead for this step).
- [ ] Record the review outcome and the listing URL, then add it to `README.md`, the docs installation page, and the website.
