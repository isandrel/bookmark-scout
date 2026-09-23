---
id: TASK-11
title: Honor tool enabled and default-scope settings
status: Done
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-23 18:00'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
  - apps/extension/src/components/bookmarks/ToolCards.tsx
modified_files:
  - apps/extension/src/components/bookmarks/ToolCards.tsx
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/tests/e2e/tool-settings.spec.ts
priority: high
type: bug
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed cross-cutting gap: per-tool Enabled and Default Scope settings are exposed for AI, maintenance, metadata, privacy, and statistics tools, but ToolsSidebar/ToolCard hard-code visibility and initial scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every tool card obeys its enabled setting and allowed default scope; invalid scopes fall back safely.
- [x] #2 Settings changes are reflected without a stale card state, with automated coverage for representative tools.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tool visibility and default scopes now follow saved settings; unsupported scopes normalize to a safe supported scope. Automated Chromium E2E verifies live settings updates, all tool enabled flags, scoped results, malformed values, and Options scope choices. Lint, unit tests, Chromium E2E, and Chrome/Firefox/Edge builds passed.
<!-- SECTION:FINAL_SUMMARY:END -->
