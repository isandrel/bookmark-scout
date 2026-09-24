---
id: TASK-27
title: 'Add import preview, conflict handling, and dry run'
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
labels: []
dependencies: []
references:
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
  - apps/extension/src/services/bookmark-import.ts
priority: medium
type: feature
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Brainstorm proposal: import currently writes parsed bookmarks directly into the current/default folder. Add a preflight view with target selection, duplicate/conflict strategy, counts, and explicit apply.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Preview does not mutate bookmarks and reports the exact target and planned changes.
- [ ] #2 Apply handles partial failures clearly and E2E tests use a disposable browser profile and fixture files.
<!-- AC:END -->
