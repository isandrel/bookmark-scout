---
name: extension-store-release
description: Get the Bookmark Scout extension ready for the Chrome Web Store, Firefox Add-ons (AMO), and Microsoft Edge Add-ons - manifests, per-browser build warnings, addons-linter, data-collection declarations, the sources ZIP for reviewers, release tags and assets, listing copy, and store screenshots - without submitting anything. Use whenever the user mentions a store, marketplace, listing, AMO, add-on ID, release tag, release ZIP, reviewer notes, or "ready to publish", even if they only ask what is missing.
---

# Extension store release

Start from `store/README.md` (surface table per browser, asset list, how screenshots were made) and the checklist for each store in `store/checklists/`. Submission itself is manual and needs the maintainer's explicit approval: no `wxt submit` and no store credentials in CI.

## Manifest and build

- **Treat per-browser build warnings as blockers.** WXT warns when the Firefox build lacks `browser_specific_settings.gecko.id` or `data_collection_permissions`, and silently drops `chrome_url_overrides.bookmarks` for Firefox ("Bookmarks are not supported by Firefox"). That is why the popup and side panel have an **Open bookmark manager** button: it is the only way into the manager in Firefox.
- **Generate the manifest from a pure exported function** per browser and unit-test its output: Firefox has the `gecko` block, Chrome and Edge have no `browser_specific_settings`. The Firefox E2E fixture should assert the real ID, so tests install what the store receives.
- **The Firefox add-on ID is permanent** after the first AMO upload. Use the `name@domain-you-control` form and get the maintainer's approval before adding it, to the Firefox manifest only.
- **`data_collection_permissions`** is mandatory for new AMO submissions (since 2025-11-03). `required: ["none"]` alone is only true if no data leaves the browser; sending data to a third party the user configures (an AI provider) counts. The maintainer chose `required: ["none"]` with the AI categories `optional`, requested from the user's click: each feature's categories are in `src/lib/permission-catalog.ts`, which also generates the manifest key, and `createLoggingFetch` refuses provider calls without the consent. Recheck the categories whenever a feature changes what leaves the device.
- **Permissions are asked for at first use** (maintainer decision): only what the extension cannot work without is required. Firefox cannot make `contextMenus` or `storage` optional, and an optional `sidePanel` is not registered in Chrome until a reload, so those stay required where needed; `tabs` gives way to `activeTab` plus an optional `tabs` for the side panel, and `favicon` is optional (without `tabs`, it would add its own install warning). Add or change a permission in the catalog, then update `store/permissions.md` (install warnings and the request table) and the privacy files in the same change.
- Set `gecko.strict_min_version` to the oldest Firefox that supports every API the build uses, and also set `gecko_android.strict_min_version`, even without Android support; without it addons-linter warns `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`.
- Leave Chromium-only permissions (`favicon`, `sidePanel`) out of the Firefox manifest (the catalog lists the browsers per permission), or addons-linter reports `MANIFEST_PERMISSIONS`. WXT drops `optional_host_permissions` from MV2 builds, so `adaptManifestV2` moves the origins into `optional_permissions`.
- Reviewers flag broad `web_accessible_resources`. An entry such as `_favicon/*` for `<all_urls>` is only needed by content scripts; scope or remove it, with a favicon test.
- Keep unused large files out of every package (an unreferenced 5 MB source icon in `public/` was the biggest file in each ZIP).
- A new TypeScript file at the root of `apps/extension` must be added to the lint paths in `package.json`, `project.json`, and `biome.json`, or it is silently not linted.

## Lint the Firefox package

```bash
bunx nx run extension:build:firefox
bunx addons-linter@latest --output json apps/extension/dist/firefox-mv2 > ~/.cache/bookmark-scout-amo/lint.json
```

Summarize the JSON with a short script; the table output truncates columns. Target zero errors. Expected warnings that need reviewer notes rather than fixes: `DANGEROUS_EVAL` (Zod's JIT capability probe) and `UNSAFE_VAR_ASSIGNMENT` (React DOM).

## Sources ZIP and reproducible builds

- The sources ZIP (`wxt zip` with `sourcesRoot` at the workspace root) must include `.gitignore`, `bun.lock`, `tsconfig.base.json`, and every workspace `package.json`. Tailwind v4's source detection honors `.gitignore`; without it the rebuilt CSS differs.
- Tailwind scans only `apps/extension/src/` (`@import 'tailwindcss' source('../')` in `src/styles/theme.css`). Scanning the whole app once put `.bg-black` and `.transition` from `tests/` into the release CSS; the sources ZIP leaves `tests/` out, so the reviewer rebuild differed. Never widen the scan to files the ZIP excludes. If shipped classes ever live outside `src/`, add an `@source` for that folder and keep it in the ZIP.
- Verify by unzipping into an empty folder, running `bun install --frozen-lockfile` and the Firefox build, and comparing file hashes. A CSS change also renames every chunk that imports it, so one extra rule shows up as a dozen differing files; diff the CSS first.
- Clean rebuilds match each other byte for byte, even at different paths, but differ from a developer-checkout build in minified names. Compare the reviewer rebuild with the CI release asset, never a local build. Before a release exists, a release-style build from a clean export stands in for it:

  ```bash
  mkdir -p ~/.cache/bookmark-scout-repro/{export,review,release}
  git archive HEAD | tar -x -C ~/.cache/bookmark-scout-repro/export
  (cd ~/.cache/bookmark-scout-repro/export && bun install --frozen-lockfile && cd apps/extension && bun run zip)
  unzip -q ~/.cache/bookmark-scout-repro/export/apps/extension/dist/*-sources.zip -d ~/.cache/bookmark-scout-repro/review
  unzip -q ~/.cache/bookmark-scout-repro/export/apps/extension/dist/*-firefox.zip -d ~/.cache/bookmark-scout-repro/release
  (cd ~/.cache/bookmark-scout-repro/review && bun install --frozen-lockfile && cd apps/extension && bun run build:firefox)
  diff <(cd ~/.cache/bookmark-scout-repro/release && find . -type f | sort | xargs shasum -a 256) \
       <(cd ~/.cache/bookmark-scout-repro/review/apps/extension/dist/firefox-mv2 && find . -type f | sort | xargs shasum -a 256)
  ```

## Release

- Tag `vX.Y.Z` only when the maintainer explicitly asks for a release. Before pushing the tag, confirm:
  - `main` is clean and synced: `git status --short --branch`
  - no PRs are open: `gh pr list --state open`
  - the latest relevant Actions for the current `main` SHA are green
  - the remote tag does not exist yet: `git ls-remote --tags origin vX.Y.Z`
  - `apps/extension/package.json` `version` equals `X.Y.Z`; WXT writes it into the manifest and the release workflow rejects a mismatched tag
- If a local tag points to an older commit, move it to the current passing `main` first: `git tag -f vX.Y.Z HEAD`.
- Push the tag to trigger `Release Extension` (`git push origin vX.Y.Z`), then watch it with `gh run watch <run-id> --exit-status`.
- Check all five assets with `gh release view vX.Y.Z`: Chrome `.crx` and `.zip`, Firefox `.zip`, Edge `.zip`, and the Firefox sources `.zip`. Treat the first tag after any release-workflow change as its first real test.

## Listings and screenshots

- Copy and limits are in `store/listings/`. Chrome and Edge show the locale `extDescription` (at most 132 characters); the AMO summary allows 250. Count Unicode characters with a script for `ja` and `ko`. Copy rules are in `website-docs-delivery/references/marketing-review.md`.
- Describe each browser's real feature set (the surface table in `store/README.md`). When a surface changes, update together: the listings, that table, the docs `status.mdx`, the README templates, and the screenshot picks.
- Re-sync listing and privacy copy after merging `main` mid-PR; a feature that landed meanwhile may need disclosing (privacy files are listed in the root `AGENTS.md`).
- Chrome Web Store dashboard work (filling tabs, uploading the release ZIP, submitting, rejections) and the scripted screenshot recapture live in the `extension-cws-submission` skill.
- Screenshots: follow "Store and marketing screenshots" in the `extension-exploratory-qa` skill. Compose frames and the 440×280 promo tile by rendering HTML in the same runner. Export 24-bit RGB PNGs without alpha.

## Report

List per store: blockers fixed, blockers left (with the decision each needs), linter result, reproducibility result, assets checked, and the manual checks that remain (live permission prompts, real providers, the parts of each browser the automated suites do not cover).
