---
id: TASK-17
title: Align duplicate-cleaner preview with the selected keep rule
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/components/bookmarks/ToolResultViews.tsx
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
priority: medium
type: bug
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed misleading preview: the results view labels the first duplicate as Keep, but removal sorts by newest, oldest, or first before deciding what to keep.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The preview identifies exactly the item the selected rule will retain for every group.
- [ ] #2 Tests cover all keep rules and verify that apply deletes only previewed extras.
<!-- AC:END -->
