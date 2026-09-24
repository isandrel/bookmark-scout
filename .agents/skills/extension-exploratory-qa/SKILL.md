---
name: extension-exploratory-qa
description: Hands-on exploratory QA of the built Bookmark Scout extension in a disposable Playwright Chromium profile, driving the popup, side panel, bookmarks manager, Tools sidebar, and options pages and reviewing screenshots to find bugs. Use when asked to "really try" or "test more" the extension, to find what is broken, or when Computer Use and browser-extension tools cannot interact with extension pages. Finds and reports bugs; it does not fix them.
---

# Extension exploratory QA

Drive the real built extension like a user, in a throwaway profile, and report confirmed bugs. Then turn findings into regression tests under `apps/extension/tests/` (unit with Vitest, E2E with the Playwright fixtures in `apps/extension/tests/e2e/fixtures.ts`).

## Why this route

- Computer Use grants browsers read-only access (screenshots only).
- Browser-extension automation (Claude in Chrome and similar) cannot open `chrome://` or `chrome-extension://` pages, the toolbar popup, or the side panel.
- A dev build must never be loaded into the user's real profile; the extension edits bookmarks and settings.

## Setup

1. Build Chromium output for the commit under test from the repository root:
   ```bash
   bunx nx run extension:build:chrome
   ```
   Output: `apps/extension/dist/chrome-mv3`. To test another commit without touching the current checkout, build in a detached worktree and point `EXT` at its `dist/chrome-mv3`.
2. Run steps with the bundled runner from the repository root. Keep QA output outside the repository (a scratch or temp directory):
   ```bash
   QA_DIR=/tmp/bookmark-scout-qa RUN=qa-popup \
     bun .agents/skills/extension-exploratory-qa/scripts/explore-run.ts /tmp/bookmark-scout-qa/qa-popup/s01-seed.ts
   ```
   The runner launches headless Chromium with the unpacked build and a persistent profile at `$QA_DIR/$RUN/profile`, exposes the extension service worker, saves screenshots to `$QA_DIR/$RUN/shots/`, and prints console errors, page errors, and your log lines. `HEADED=1` shows the browser. Delete the profile folder to reset.
3. Write one step file per scenario. Start from `scripts/example-seed-step.ts`: seed synthetic data through `sw.evaluate` and `chrome.bookmarks`, open pages with `open('popup.html', 420, 600)`, act through the UI, verify through the APIs, and call `shot(page, name)`.

Extension pages: `popup.html` (420×600), `sidepanel.html` (400×900), `bookmarks.html` (manager, 1400×900 and a narrow width; Tools sidebar toggle at the top right), `options.html`. Settings live in `chrome.storage.sync` under `bookmark-scout-settings`; bookmark metadata in `chrome.storage.local` under `bookmark-scout-bookmark-metadata`.

## Rules

- **Disposable data only.** Seed synthetic bookmarks, including awkward cases: long titles, CJK text, duplicates, HTML-like titles, empty folders, a few hundred items.
- **Harness artifact:** pages open as tabs, so the popup's "current tab" is the extension page itself. Do not report that.
- **Confirm every bug** through ground truth (`chrome.bookmarks`, `chrome.storage`, downloaded files) or a screenshot you have read.
- **Read the screenshots.** Layout, clipping, raw message keys, missing numbers in templated text, and untranslated strings only show visually.
- **Network:** route mocks bypass CORS. For Dead Links and Metadata Fetcher also test against a local HTTP server without CORS headers. Website access is an optional host permission requested on click; headless runs cannot answer the prompt.
- **Languages and themes:** repeat key screens in `ja` and `ko` and in dark mode.
- **Accessibility:** tab through each screen; check focus visibility, labels, and nested buttons.

## Scaling out

For a full pass, run one tester per surface in parallel, each with its own `RUN`: popup and side panel, manager, Tools, options and background. Subagents may be unable to write report files; have each return findings as text and save them to `$QA_DIR/$RUN/FINDINGS.md` from the orchestrating session. See the `parallel-agent-delivery` skill for turning findings into fixes.

## Report format

Use `assets/findings-template.md`. One entry per bug: severity (High, Medium, Low), area, exact repro, expected vs actual, evidence. Tag bugs already tracked in `backlog/tasks/`. List what works and what was not covered. Report security issues (for example user data rendered as HTML) and data loss first.
