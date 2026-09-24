---
name: extension-live-smoke
description: Inspect an installed browser extension with Computer Use when explicitly requested. Use for visual, read-only checks of its popup or pages, or an explicitly requested rebuild-and-reload smoke check. Use isolated automated tests for reproducible, data-mutating regression coverage.
---

# Browser-extension live smoke check

1. Read the current Computer Use tool documentation and a fresh UI state before interacting. Confirm the browser window and extension identity rather than relying on saved element indices or an old extension ID.
2. If the user expects the latest local code, inspect the installed extension's details and verify its unpacked source path against this checkout's current build output. Rebuild or reload only when authorized by the request. Confirm the reload and then inspect the visible extension UI; do not infer that a build alone updated the installed copy.
3. Keep checks read-only by default: open views, inspect visible controls, search, or change a temporary UI-only filter. Do not create, edit, delete, import, export, reorganize, scan, or send user data to an external service in the live profile without explicit, scoped authorization. Use isolated automated tests for those flows.
4. After each meaningful action, obtain fresh accessibility state or a screenshot and verify the resulting UI. Do not assume a click reached a transient toolbar popup when the tool remains bound to the main browser window.
5. If Computer Use or Browser Use rejects access to a `chrome-extension://` page and forbids workarounds, stop that route immediately. Do not reach the same page through another browser surface, native UI, raw CDP, terminal automation, or an indirect URL. Report the restriction and the checks that remain unverified.
6. Summarize exactly what was visibly observed, which build and profile were involved, and what was not tested. Avoid reproducing private user data or settings values in the report unless essential and explicitly requested.

## Known tool limits

- **Computer Use grants browsers read-only access.** Browsers (Chrome, Chrome for Testing, Safari, Firefox) are granted at a read tier: screenshots only, no clicks or typing. Do not work around it.
- **Browser-extension automation (Claude in Chrome and similar) cannot open extension pages.** `chrome://` and `chrome-extension://` URLs are rewritten or blocked, and toolbar popups and side panels are outside tab content.
- **Never load a dev build into the user's real profile** to make a live check possible; extensions that edit bookmarks or settings can damage real data.
- When the user wants hands-on interaction and these limits apply, offer the `extension-exploratory-qa` skill instead: it drives the built extension in a disposable Playwright profile and reviews screenshots.
