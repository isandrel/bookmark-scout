---
id: TASK-32
title: Run extension E2E coverage in Firefox and Edge
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-10-02 06:00'
labels: []
dependencies: []
references:
  - apps/extension/project.json
  - apps/extension/playwright.config.ts
  - apps/extension/tests/e2e
  - apps/extension/tests/e2e-firefox
  - .github/workflows/ci.yml
  - apps/docs/content/docs/status.mdx
  - README.md
priority: medium
type: task
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Coverage gap: Firefox and Edge have build targets but the current runtime E2E suite runs Chromium only. Add a practical browser matrix and document unsupported APIs, including Firefox sidebar differences.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CI runs a clearly scoped runtime smoke suite in each supported browser target or records a reproducible platform limitation.
- [x] #2 The report separates build success from runtime behavior and avoids claiming identical support where APIs differ.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Edge: Playwright project `edge` runs the full Chromium suite in the installed Microsoft Edge (`msedge` channel) against `dist/edge-mv3`; `--load-extension` still works there (Edge 154 on ubuntu-latest). Target `nx run extension:test:e2e:edge`, CI job `Edge E2E`. The first run failed only where tests hard-coded Chrome's "Other bookmarks" (Edge: "Other favorites"); tests now read the title from `chrome.bookmarks`.
- Firefox: Playwright's Firefox never commits a `moz-extension://` navigation, and its WebDriver BiDi mode (`channel: 'moz-firefox'`) rejects it, so `tests/e2e-firefox/` drives stock Firefox through geckodriver (`selenium-webdriver`, `--allow-system-access`), installs a copy of `dist/firefox-mv2` as a temporary add-on with a test-only gecko ID and fixed UUID, and keeps Playwright Test as the runner. Seven smoke tests: popup search, popup folder creation, side panel page, manager load and filter, settings save, JSON export/import round trip, statistics and privacy scanner. Target `nx run extension:test:e2e:firefox`, CI job `Firefox E2E smoke`.
- Not covered in Firefox: context-menu saves, drag and drop, keyboard shortcuts, network and AI tools, locales, and the real sidebar (the panel page is tested in a tab). Firefox API differences are listed in `apps/docs/content/docs/status.mdx`.
- Both CI jobs are non-required; whether to require them is a ruleset decision.
<!-- SECTION:NOTES:END -->
