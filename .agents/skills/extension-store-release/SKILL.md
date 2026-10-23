---
name: extension-store-release
description: Prepare and ship Bookmark Scout to the Chrome Web Store, Firefox Add-ons (AMO), and Microsoft Edge Add-ons - manifests, default keyboard shortcuts (why Ctrl+D cannot be one), per-browser build warnings, addons-linter, data-collection declarations, the sources ZIP for reviewers, release tags and assets, listing copy, store screenshots and promo art, and the Chrome Web Store dashboard (filling its tabs, uploading, submitting, fixing rejections). Use whenever the user mentions a store, marketplace, listing, AMO, add-on ID, release tag, release ZIP, reviewer notes, store screenshots, the Developer Dashboard, "ready to publish", "update the store", or "publish 0.x.y to Chrome", or pastes a store rejection, even if they only ask what is missing.
---

# Extension store release

Start from `store/README.md` (surface table per browser, asset list, how screenshots were made) and the checklist for each store in `store/checklists/`. Every outward step needs the maintainer's explicit approval: tagging, saving dashboard drafts, uploading, submitting, removing images, and opting into Verified CRX. The only automated path is the gated `submit-chrome` job (`wxt submit`, Chrome Web Store API v2, service account key as an environment secret, off unless `CWS_SUBMIT` is `true`); see "Automated submission" in `store/checklists/chrome-web-store.md`. No other store credentials in CI, and no automated Firefox or Edge submission.

## Manifest and build

- **Treat per-browser build warnings as blockers.** WXT warns when the Firefox build lacks `browser_specific_settings.gecko.id` or `data_collection_permissions`, and silently drops `chrome_url_overrides.bookmarks` for Firefox ("Bookmarks are not supported by Firefox"). That is why the popup and side panel have an **Open bookmark manager** button: it is the only way into the manager in Firefox.
- **Generate the manifest from a pure exported function** per browser and unit-test its output: Firefox has the `gecko` block, Chrome and Edge have no `browser_specific_settings`. The Firefox E2E fixture should assert the real ID, so tests install what the store receives.
- **The Firefox add-on ID is permanent** after the first AMO upload. Use the `name@domain-you-control` form and get the maintainer's approval before adding it, to the Firefox manifest only.
- **`data_collection_permissions`** is mandatory for new AMO submissions (since 2025-11-03). `required: ["none"]` alone is only true if no data leaves the browser; sending data to a third party the user configures (an AI provider) counts. The maintainer chose `required: ["none"]` with the AI categories `optional`, requested from the user's click: each feature's categories are in `src/lib/permission-catalog.ts`, which also generates the manifest key, and `createLoggingFetch` refuses provider calls without the consent. Recheck the categories whenever a feature changes what leaves the device.
- **Permissions are asked for at first use** (maintainer decision): only what the extension cannot work without is required. Firefox cannot make `contextMenus` or `storage` optional, and an optional `sidePanel` is not registered in Chrome until a reload, so those stay required where needed; `tabs` gives way to `activeTab` plus an optional `tabs` for the side panel, and `favicon` is optional (without `tabs`, it would add its own install warning). Add or change a permission in the catalog, then update `store/permissions.md` (install warnings and the request table) and the privacy files in the same change (`privacy-disclosure-sync`).
- Set `gecko.strict_min_version` to the oldest Firefox that supports every API the build uses, and also set `gecko_android.strict_min_version`, even without Android support; without it addons-linter warns `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`.
- Leave Chromium-only permissions (`favicon`, `sidePanel`) out of the Firefox manifest (the catalog lists the browsers per permission), or addons-linter reports `MANIFEST_PERMISSIONS`. WXT drops `optional_host_permissions` from MV2 builds, so `adaptManifestV2` moves the origins into `optional_permissions`.
- Reviewers flag broad `web_accessible_resources`. An entry such as `_favicon/*` for `<all_urls>` is only needed by content scripts; scope or remove it, with a favicon test.
- Keep unused large files out of every package (an unreferenced 5 MB source icon in `public/` was the biggest file in each ZIP).
- A new TypeScript file at the root of `apps/extension` must be added to the lint paths in `package.json`, `project.json`, and `biome.json`, or it is silently not linted.

## Keyboard shortcuts (`commands`)

- **Ctrl+D (⌘D) cannot be a default in any browser** (researched for PR #646, when the maintainer asked for it). Chrome and Edge never assign a suggested key that is one of the browser's own shortcuts, and say nothing (`CommandService::CanAutoAssign`); the old `chrome_ui_overrides.bookmarks_ui` exception was removed in Chrome 83 and the key is now ignored silently. Firefox accepts and reports Ctrl+D but handles it itself first, and its shortcut page refuses it. What does work: a key the user records at `chrome://extensions/shortcuts` (or Edge's) overrides the browser's own, so the extension offers a button and steps for that. The data is in `BOOKMARK_SHORTCUT_TAKEOVER` and `BROWSER_KEPT_SHORTCUTS` (`src/lib/command-catalog.ts`). Do not add `chrome_ui_overrides` to the manifest.
- **Choosing default keys:** Chrome allows at most four suggested keys. Avoid keys the browsers use (Ctrl+Shift+D bookmarks all tabs in Chrome and Firefox; Chrome uses Alt+Shift+A, I, N, and T; Edge Alt+Shift+B, I, and T; ChromeOS Alt+Shift+S, so Chrome leaves that key unset there). Suggested keys apply only at the first install of an extension id, so a profile that removed and re-added the same unpacked build shows "Not set" ("The shortcut does nothing" in `extension-exploratory-qa`).

## Lint the Firefox package

```bash
bunx nx run extension:build:firefox
bunx addons-linter@latest --output json apps/extension/dist/firefox-mv2 > ~/.cache/bookmark-scout-amo/lint.json
```

Summarize the JSON with a short script; the table output truncates columns. Target zero errors. Expected warnings that need reviewer notes rather than fixes: `DANGEROUS_EVAL` (Zod's JIT capability probe) and `UNSAFE_VAR_ASSIGNMENT` (React DOM, Mozilla Readability on its own parsed copy of a page, and the Markdown parser behind Ask AI); `store/permissions.md` (Linter results) lists each with its chunk, so a new warning or chunk stands out. Chunk names follow the modules Rolldown groups, so they change between releases.

## Sources ZIP and reproducible builds

- The sources ZIP (`wxt zip` with `sourcesRoot` at the workspace root) must include `.gitignore`, `bun.lock`, `bunfig.toml`, `tsconfig.base.json`, every workspace `package.json`, and every workspace export the build imports. Tailwind v4's source detection honors `.gitignore`; without it the rebuilt CSS differs.
- Tailwind scans only `apps/extension/src/` (`@import 'tailwindcss' source('../')` in `src/styles/theme.css`). Scanning the whole app once put `.bg-black` and `.transition` from `tests/` into the release CSS; the sources ZIP leaves `tests/` out, so the reviewer rebuild differed. Never widen the scan to files the ZIP excludes. If shipped classes ever live outside `src/`, add an `@source` for that folder and keep it in the ZIP.
- Verify by rebuilding from the sources ZIP in an empty folder and comparing every file hash with the release package: the commands are in `references/reproducible-build.md`.

## Release

- Prepare a release only when the maintainer explicitly asks for one: no version bump, no release section in `CHANGELOG.md`, no release PR, and no tag otherwise. "Continue" or "finish the tasks" is not a release request; an agent that read it as one had to back out a version bump. Changes go under Unreleased until then.
- A release bumps `version` in the root `package.json` and `apps/extension/package.json` and moves the Unreleased entries into a version section of `CHANGELOG.md`, landed as a normal PR.
- Tag `vX.Y.Z` only when the maintainer explicitly asks for a release. Before pushing the tag, confirm:
  - `main` is clean and synced: `git status --short --branch`
  - no PRs are open: `gh pr list --state open`
  - the latest relevant Actions for the current `main` SHA are green
  - the remote tag does not exist yet: `git ls-remote --tags origin vX.Y.Z`
  - `apps/extension/package.json` `version` equals `X.Y.Z`; WXT writes it into the manifest and the release workflow rejects a mismatched tag
- If a local tag points to an older commit, move it to the current passing `main` first: `git tag -f vX.Y.Z HEAD`.
- Push the tag to trigger `Release Extension` (`git push origin vX.Y.Z`), then watch it with `gh run watch <run-id> --exit-status`.
- Check all five assets with `gh release view vX.Y.Z`: Chrome `.crx` and `.zip`, Firefox `.zip`, Edge `.zip`, and the Firefox sources `.zip`. Treat the first tag after any release-workflow change as its first real test.

## Chrome Web Store dashboard

Read `references/chrome-web-store.md` before touching the dashboard: where each field comes from, the upload and submit steps for a new version, Verified CRX, and what the first review rejected. Extract field text from the repository with a script rather than retyping it, and after any dashboard edit update the repository copy in the same session.

## Listings

- Copy and limits are in `store/listings/`. Chrome and Edge show the locale `extDescription` (at most 132 characters); the AMO summary allows 250. Count Unicode characters with a script for CJK languages. Copy rules are in `website-docs-delivery/references/marketing-review.md`. Name kinds of AI provider, never brands (the first Chrome review rejected a list of provider names as keyword spam).
- Describe each browser's real feature set (the surface table in `store/README.md`). When a surface changes, update together: the listings, that table, the docs `status.mdx`, the README templates, and the screenshot picks.
- Re-sync listing and privacy copy after merging `main` mid-PR; a feature that landed meanwhile may need disclosing (privacy files are listed in the root `AGENTS.md`).

## Screenshots and promo art

Recapture whenever the popup, manager, Tools, or Options UI changes. Run from the repository root:

```bash
bunx nx run extension:build:chrome
Q=~/.cache/bookmark-scout-qa
S=.agents/skills/extension-store-release/scripts
bun $S/prepare-granted-build.ts apps/extension/dist/chrome-mv3 $Q/store-ext
rm -rf $Q/store-shots
EXT=$Q/store-ext QA_DIR=$Q RUN=store-shots bun .agents/skills/extension-exploratory-qa/scripts/explore-run.ts $S/capture-store-screenshots.ts
bun $S/compose-store-screenshots.ts $Q/store-shots/shots $Q/store-shots/final
```

Look at every image, then copy `final/*.png` to `store/screenshots/`, `apps/website/public/screenshots/`, and `apps/docs/public/screenshots/` under the same names. Update "How they were made" in `store/README.md`, run `nx run website:verify` and the docs verify, and open a PR. What the capture does, the maintainer's rules for frames, and the traps when capturing by hand are in `references/screenshots.md`.

## Report

List per store: blockers fixed, blockers left (with the decision each needs), linter result, reproducibility result, assets checked, and the manual checks that remain (live permission prompts, real providers, the parts of each browser the automated suites do not cover).
