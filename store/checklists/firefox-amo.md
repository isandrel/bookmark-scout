# Firefox Add-ons (AMO) Submission Checklist

> **Submission is manual and requires explicit approval.** No agent or workflow uploads to addons.mozilla.org. Do not start this checklist until the maintainer has approved both the release and the AMO submission for this version in writing.

## Blockers found on 2026-10-01

These must be resolved, by a code change and a new release, before a first AMO listing:

- [ ] **Add-on ID.** `browser_specific_settings.gecko.id` is missing (`MISSING_ADDON_ID`). Pick a permanent ID; it cannot change after the first upload.
- [ ] **Data collection declaration.** `browser_specific_settings.gecko.data_collection_permissions` is missing (`MISSING_DATA_COLLECTION_PERMISSIONS`); it is required for new Firefox extensions. Choose an option in [`../privacy-disclosures.md`](../privacy-disclosures.md#firefox-add-ons-data-collection-declaration). After adding it, re-run the linter and check its minimum Firefox version (`strict_min_version`) warning, if any.
- [ ] **Scope decision.** The bookmarks manager and Tools sidebar are not reachable in the Firefox build (no override, no link). Either ship with the reduced Firefox description in [`../listings/en.md`](../listings/en.md), or add an entry point first.
- [ ] Optional: drop the Chromium-only `favicon` and `sidePanel` permissions from the Firefox manifest in the `build:manifestGenerated` hook to clear the `MANIFEST_PERMISSIONS` warnings.

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

The required `Firefox E2E smoke` CI check covers popup search and folder creation, saved site icons, the side panel page, manager loading, a settings save, JSON export and import, and the statistics and privacy reports. It does not cover context menus, drag and drop, network and AI tools, or the real sidebar, so every other claim in the Firefox description needs a manual check in a fresh Firefox profile with synthetic bookmarks (`about:debugging` → Load Temporary Add-on):

- [ ] Popup: instant search with match case, whole word, and regex.
- [ ] Folder tree: drag and drop, expand and collapse all, new folder.
- [ ] Save the current page to a folder; saving it again into the same folder does nothing.
- [ ] Right-click a link: save it into a recent folder.
- [ ] Keyboard shortcuts in the popup.
- [ ] Delete with confirmation and Undo.
- [ ] Options: themes, language, AI off by default.
- [ ] AI folder suggestions with a test provider (for example local Ollama), if the description keeps them.
- [ ] Settings sync behavior (with Firefox Sync, if available).
- [ ] How bookmark icons render (the `favicon` API does not exist in Firefox).
- [ ] Whether the declared sidebar (`sidebar_action`) works. The docs currently say Firefox has no side panel; reconcile the docs or keep the listing silent about it.
- [ ] The screenshots were captured in Chromium; confirm the Firefox popup and options look the same, or capture Firefox versions.

## 3. Listing

- [ ] Name: from the package.
- [ ] Summary (250 characters maximum) and description: "Firefox Add-ons" sections of [`en.md`](../listings/en.md), [`ja.md`](../listings/ja.md), [`ko.md`](../listings/ko.md). AMO stores a separate listing per locale.
- [ ] Category: Bookmarks.
- [ ] Platform: Firefox desktop only. Do not enable Firefox for Android; it does not provide the `bookmarks` API the extension needs.
- [ ] Screenshots: `01-popup-light.png`, `04-options-ai-light.png`, `05-popup-dark.png`, `08-options-ai-dark.png`. Not the manager or Tools screenshots.
- [ ] Homepage `https://bookmark-scout.com`, support site `https://bookmark-scout.com/en/support/`, support email `support@bookmark-scout.com` (confirm the alias reaches a monitored inbox).
- [ ] License: GNU Affero General Public License v3.0.
- [ ] Privacy policy: `https://bookmark-scout.com/en/privacy/`; AMO also accepts the policy text, which is in [`../privacy-policy.md`](../privacy-policy.md). Confirm the page is live after the website deploys from `main`.
- [ ] "Requires payment, non-free services or software": unchecked (see [`../privacy-disclosures.md`](../privacy-disclosures.md)).

## 4. Notes to reviewer

No test account is needed. Paste:

```text
No account or login is required. Build instructions for the attached sources are in apps/extension/SOURCE_CODE_REVIEW.md (Bun 1.3+, `bun install --frozen-lockfile`, then `bun run build:firefox` in apps/extension; output in apps/extension/dist/firefox-mv2).

The bundle is built with WXT and Vite from TypeScript and React sources; nothing is minified by hand and no code is loaded remotely.

Linter notes:
- DANGEROUS_EVAL: Zod 4 probes `Function('')` inside try/catch to detect JIT support. The extension CSP blocks it and Zod uses its non-JIT path.
- UNSAFE_VAR_ASSIGNMENT: React DOM's dangerouslySetInnerHTML support code. The extension source never uses dangerouslySetInnerHTML or innerHTML.

AI features are off by default and need the user's own provider key (Settings > AI); a local Ollama server works without a key. Website access (http/https) is an optional permission requested only when the user runs a feature that needs it.
```

## 5. Submit and follow up

- [ ] Choose "On this site" (listed) distribution.
- [ ] Upload the add-on ZIP, then the sources ZIP when asked whether source code is needed (answer yes: the code is bundled).
- [ ] Submit (manual, by the maintainer or with their explicit go-ahead for this step).
- [ ] Record the review outcome and the listing URL, then add it to `README.md`, the docs installation page, and the website.
