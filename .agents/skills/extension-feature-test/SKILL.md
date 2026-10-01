---
name: extension-feature-test
description: Verify browser-extension features with automated tests. Use when implementing a feature, adding regression coverage, or auditing what a repository's unit and end-to-end suites actually prove. Do not use this skill to inspect the user's installed browser profile.
---

# Browser-extension feature testing

1. Confirm the checkout and read its applicable `AGENTS.md` files, feature code, test scripts, and browser-extension build configuration. Preserve unrelated working-tree changes.
2. Turn each requested behavior into observable acceptance criteria. Use focused unit tests for pure logic and the repository's browser end-to-end harness for UI-to-extension-API behavior. Assert the resulting state, not merely that a control was clicked.
3. Run mutating tests in a disposable browser profile with synthetic data. Never point automated tests at the user's installed profile, bookmarks, or settings. Make external network or AI behavior deterministic when it is in scope.
4. During development, rerun the narrowest relevant test. Before handing off a substantive change, run the applicable repository-required lint, build, unit, and end-to-end checks. Discover exact commands from the current project rather than assuming a particular package manager, runner, or output path.
5. On an end-to-end failure, inspect available traces, screenshots, logs, and the built extension, then fix and rerun the relevant check. A passing suite in one browser does not establish runtime behavior in another; a successful build is not an end-to-end test.
6. Report exact commands and results, behaviors asserted, browser/runtime coverage, and untested or blocked cases. Do not call a feature implemented solely because a placeholder control exists or an unrelated test passes. Check that user-facing settings actually affect the behavior they claim to configure.

For WXT projects, consult the current [WXT end-to-end testing guide](https://wxt.dev/guide/essentials/e2e-testing.html) when changing test setup; adapt it to existing fixtures rather than replacing them by default.

## Lessons from past runs

- **Ground truth over UI.** Verify outcomes through the extension APIs (`chrome.bookmarks`, `chrome.storage`) from the service worker (`serviceWorker.evaluate`) or from files on disk (downloads, exports), not only through what the page renders.
- **Settings must change behavior.** For every setting a feature claims to honor, flip it in storage and assert the behavior changes. Several settings in past audits were saved correctly but never read.
- **Network features need a real server.** Playwright route mocks bypass CORS, so they hide "blocked by CORS policy" failures. Run dead-link or metadata-style features against a local HTTP server that sends no CORS headers.
- **Permission prompts cannot be answered headless.** Pre-grant optional host permissions in a copy of the build, or stub `permissions.request` for the denied path, and report the live prompt as a manual check.
- **Assert exact templated text.** Match full user-facing strings such as `Deleted "News". Undo within 10 seconds.` so missing placeholder substitutions fail tests. Use `exact: true`; toast libraries render screen-reader copies that make loose text matches ambiguous.
- **Locale parity.** Keep a unit test that every locale has identical keys and placeholders and that every literal `t('key')` exists. New strings go into every locale in the same change.
- **Untrusted text is data.** Include a test that a title such as `<img src=x onerror=alert(1)><style>*{display:none}</style>` renders literally. Never render user data through `dangerouslySetInnerHTML`.
- **Avoid timing-coupled assertions.** Do not assert exact call counts that depend on async scheduling; wait for the queue to settle, then assert the final state.
- **Flakiness check.** Run each new end-to-end test at least three times before handing off.
- **Destructive paths.** For delete, dedupe, import, and cleanup flows, assert exactly which items were removed or kept, and test undo, partial failure, and stale previews (the item changed after the preview opened).
- **Storage migrations.** When moving storage to a new wrapper, keep keys and areas identical and let existing end-to-end specs seed the raw keys; that proves old user data still loads. Keep secrets such as API keys out of sync storage.
