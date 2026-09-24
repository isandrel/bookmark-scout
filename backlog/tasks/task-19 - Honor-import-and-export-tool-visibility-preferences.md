---
id: TASK-19
title: Honor import and export tool visibility preferences
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
priority: low
type: bug
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed inert settings: dataShowExport and dataShowImport appear in Options but the Tools sidebar renders both controls unconditionally.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each control follows its saved visibility preference after opening or updating Options.
- [ ] #2 An E2E test verifies both switches without changing bookmark data.
<!-- AC:END -->
