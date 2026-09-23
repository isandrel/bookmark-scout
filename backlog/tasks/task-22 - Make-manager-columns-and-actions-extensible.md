---
id: TASK-22
title: Make manager columns and actions extensible
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
labels: []
dependencies: []
references:
  - apps/extension/src/components/ui/table/columns.tsx
  - apps/extension/src/components/ui/table/data-table.tsx
  - apps/extension/src/services/bookmarks.ts
priority: medium
type: enhancement
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed architecture: table columns and row actions are a single hard-coded array with browser API calls inside cell rendering. Add a small typed extension point for future metadata columns/actions while preserving existing behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Column definitions and row actions can be added without editing unrelated table rendering code.
- [ ] #2 Bookmark mutations use the established service layer and current table tests remain green.
<!-- AC:END -->
