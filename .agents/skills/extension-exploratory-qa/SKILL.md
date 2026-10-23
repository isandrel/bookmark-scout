---
name: extension-exploratory-qa
description: Hands-on checks of the Bookmark Scout extension in a real browser - exploratory QA of the built extension in a disposable Playwright Chromium profile (driving the popup, side panel, bookmarks manager, Tools sidebar, and options pages and reviewing screenshots to find bugs), and read-only looks at the extension installed in the user's own browser when they ask for one. Use when asked to "really try" or "test more" the extension, to find what is broken, to look at it in the user's browser, when the user says their browser still shows the old UI or a shortcut does nothing, or when Computer Use and browser-extension tools cannot interact with extension pages. Finds and reports bugs; it does not fix them.
---

# Extension exploratory QA

Drive the real built extension like a user, in a throwaway profile, and report confirmed bugs. Then turn findings into regression tests under `apps/extension/tests/` (unit with Vitest, E2E with the Playwright fixtures in `apps/extension/tests/e2e/fixtures.ts`; the `extension-feature-test` skill).

## Which browser

- **A disposable profile (default).** "Setup" and "Rules" below use one. It is the only route that can click, type, and change data.
- **The user's installed browser, read-only, only on request** (see "The user's own browser"). Computer Use grants browsers a read tier (screenshots only, no clicks or typing), and browser-extension automation (Claude in Chrome and similar) cannot open `chrome://` or `chrome-extension://` pages, the toolbar popup, or the side panel. Do not work around either limit.
- **Never load a dev build into the user's real profile**; the extension edits bookmarks and settings.

## Setup

1. Build the commit under test in its own detached worktree, never in the main checkout: the maintainer's browser loads the main checkout's `apps/extension/dist/chrome-mv3` unpacked, and parallel testers rebuilding one `dist` test each other's code.
   ```bash
   git worktree add --detach ~/.cache/bookmark-scout-qa/wt-<area> origin/main
   cd ~/.cache/bookmark-scout-qa/wt-<area> && bun install --frozen-lockfile && bunx nx run extension:build:chrome
   ```
   Point `EXT` at that worktree's `apps/extension/dist/chrome-mv3` and run the runner from that worktree (its `node_modules` provide Playwright). Keep step files and helpers outside it, in your QA folder, so they survive `git worktree remove --force` at the end.
2. Run steps with the bundled runner from the repository root. Keep QA output outside the repository in a durable folder such as `~/.cache/bookmark-scout-qa/`. Session scratch folders can be wiped mid-run and take the reports with them:
   ```bash
   QA_DIR=~/.cache/bookmark-scout-qa RUN=qa-popup \
     bun .agents/skills/extension-exploratory-qa/scripts/explore-run.ts ~/.cache/bookmark-scout-qa/qa-popup/s01-seed.ts
   ```
   The runner launches headless Chromium with the unpacked build and a persistent profile at `$QA_DIR/$RUN/profile`, exposes the extension service worker, saves screenshots to `$QA_DIR/$RUN/shots/`, and prints console errors, page errors, and your log lines. `HEADED=1` shows the browser. Delete the profile folder to reset.
3. Write one step file per scenario. Start from `scripts/example-seed-step.ts`: seed synthetic data through `sw.evaluate` and `chrome.bookmarks`, open pages with `open('popup.html', 420, 600)`, act through the UI, verify through the APIs, and call `shot(page, name)`.

Extension pages: `popup.html` (420×600), `sidepanel.html` (400×900), `bookmarks.html` (manager, 1400×900 and a narrow width; Tools sidebar toggle at the top right), `options.html`. Stored items are listed in `src/lib/storage/registry.ts` and stored as `{ v, data }` (settings in `chrome.storage.sync` under `settings`, tags and summaries in `chrome.storage.local` under `bookmarks.metadata`); seed and read them with the helpers in `apps/extension/tests/e2e/storage.ts` (`setSettings`, `writeStored`, `readStored`) instead of spelling keys.

## Rules

- **Disposable data only.** Seed synthetic bookmarks, including awkward cases: long titles, CJK text, duplicates, HTML-like titles, empty folders, a few hundred items.
- **Harness artifact:** pages open as tabs, so the popup's "current tab" is the extension page itself. Do not report that.
- **Confirm every bug** through ground truth (`chrome.bookmarks`, `chrome.storage`, downloaded files) or a screenshot you have read.
- **Read the screenshots.** Layout, clipping, raw message keys, missing numbers in templated text, and untranslated strings only show visually.
- **Network:** route mocks bypass CORS. For Dead Links and Metadata Fetcher also test against a local HTTP server without CORS headers. Website access is an optional host permission requested on click; headless runs cannot answer the prompt.
- **Languages and themes:** repeat key screens in `ja` and `ko` and in dark mode.
- **Accessibility:** tab through each screen; check focus visibility, labels, and nested buttons.
- **Downloads:** use a fresh `RUN` (fresh profile) for each download test. Reusing a profile across download steps has crashed Chromium on the download click.
- **Theme versus OS:** set the app theme opposite to the emulated `prefers-color-scheme` (`page.emulateMedia({ colorScheme })`). Tailwind `dark:` styles that follow the OS instead of the app setting only show this way.
- **Settings must change behavior:** for each toggle, check the screen it controls. A turned-off section showing zeros, or a removed setting still shown in Options, is a bug.
- **Stale scan results:** change bookmarks after a scan (move, delete, re-URL) and then run the destructive action. Cleaners must re-check current state before deleting.
- **Network edge cases:** on the local server, add a stalled body, a never-ending non-HTML response, HEAD answered with 403 or 405, a redirect loop, and a refused port.
- **User-reported UI bugs:** reproduce on current `main` before fixing. A user's screenshot once came from an installed build a version behind. Save before and after screenshots (popup and side panel, light and dark) under `~/.cache/bookmark-scout-qa/<topic>/`. For visual reviews of a UI change, see the `extension-ui-change` skill.
- **Combined main:** after a batch of fix PRs lands, re-run the affected surfaces on the combined `main`. PRs that each pass CI can regress together (for example an empty templated toast).
- **Permissions:** the runner cannot answer permission prompts. Make a copy of the build per grant set, with the optional permissions moved into `permissions` in the copy's `manifest.json`, the way the `grantedBuild` fixture in `tests/e2e/fixtures.ts` does (quick save needed three: `tabs`, `tabs` plus website access, and none for the fallback). Fire keyboard commands the way `pressShortcut` in `tests/e2e/quick-save-helpers.ts` does.
- **Go past configured limits.** Read the bounds in `apps/extension/config/**/*.toml` and exceed each one. One deletion larger than the undo history's byte limit silently dropped that entry and every earlier one (PR #647).
- **Leftover overlays.** After closing each menu, dialog, or select, count `[role=dialog]`, `[role=menu]`, and `[role=listbox]` that are still visible, then press a shortcut. That is how dead manager shortcuts after a Select were pinned down (PR #641).
- **Edges of the page.** Click controls a few pixels above their bottom edge at the narrowest width; an empty toast area once covered the bottom 24 px of every page and swallowed clicks (PR #643).
- **Update cleanup:** to see what an update does to stored data, copy the build, seed keys in a persistent profile, raise `version` in the copy's `manifest.json`, and relaunch the same `RUN`.
- **Firefox:** Playwright cannot open `moz-extension://` pages. Put a temporary `tests/e2e-firefox/zz-qa-*.spec.ts` in your QA worktree and use its Selenium fixtures; delete it with the worktree.

Store and marketing screenshots use this runner with their own capture script: "Screenshots and promo art" in `extension-store-release`.

## The user's own browser

Only when the user asks, and read-only by default:

1. Read the current Computer Use tool documentation and take a fresh screenshot before interacting. Confirm the browser window and extension identity rather than relying on saved element indices or an old extension id.
2. If the user expects the latest code, check that the installed extension's unpacked source path is this checkout's current build output. Rebuild or reload only when the request authorizes it, and confirm the reload in the visible UI; a build alone does not update the installed copy.
3. Look only: open views, inspect controls, search, or change a temporary UI-only filter. Never create, edit, delete, import, export, reorganize, scan, or send user data to an external service in the live profile without explicit, scoped authorization; use a disposable profile for those flows.
4. If a tool refuses a `chrome-extension://` page and forbids workarounds, stop that route. Do not reach the same page through another browser surface, native UI, raw CDP, terminal automation, or an indirect URL. Report the restriction and what stays unverified.
5. Report what was visibly observed, which build and profile were involved, and what was not tested, without reproducing private bookmarks or settings values.

**"My browser still shows the old UI."** Usually the build is stale, not the code. The browser loads the main checkout's `apps/extension/dist/chrome-mv3` exactly as last built, and `dist/chrome-mv3-dev` only updates while `bun run dev` runs. Also check which branch the main checkout is on: another agent session once switched it to a docs branch, so a rebuild there would show the wrong code. Fix, with the user's go-ahead: in the main checkout, `git branch --show-current` (switch to `main` if needed), `git pull --ff-only`, `bun install --frozen-lockfile && bunx nx run extension:build:chrome`, reload the extension in `chrome://extensions`, then reopen the popup and any open extension pages.

**"The shortcut does nothing."** Check `chrome://extensions/shortcuts` first: the command most likely shows "Not set". Chrome assigns an extension's suggested keys only at the first install of that extension id, and skips any key the browser or another extension already uses, so a profile that removed and re-added the same unpacked build gets none. Fresh profiles and upgrades from a build without commands both got the defaults. The fix is to set the key on that page; it is not a code bug.

## Scaling out

For a full pass, run one tester per surface in parallel: popup, side panel, and quick save; manager; Tools; options, storage, and the MCP bridge. Give each its own build worktree and its own subfolder, `$QA_DIR/<area>/`, for step files, helper scripts, and runs; never write to the `QA_DIR` root. A separate `RUN` keeps only profiles and screenshots apart, and one tester overwrote another's shared `run.sh` mid-run. Subagents may be unable to write report files; have each return findings as text and save them to `$QA_DIR/<area>/FINDINGS.md` from the orchestrating session. One such pass found 3 Medium and 11 Low bugs the suites missed, including a prompt-injection save path; see the `parallel-agent-delivery` skill for turning findings into fixes.

## Report format

Use `assets/findings-template.md`. One entry per bug: severity (High, Medium, Low), area, exact repro, expected vs actual, evidence. Tag bugs already tracked in the local, git-ignored `backlog/tasks/`. List what works and what was not covered. Report security issues (for example user data rendered as HTML) and data loss first.
