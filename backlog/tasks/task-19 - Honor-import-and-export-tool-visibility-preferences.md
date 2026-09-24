---
id: TASK-19
title: Honor import and export tool visibility preferences
status: Done
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
- [x] #1 Each control follows its saved visibility preference after opening or updating Options.
- [x] #2 An E2E test verifies both switches without changing bookmark data.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Export and import cards follow dataShowExport/dataShowImport live; the Data section hides when both are off. E2E toggles both without changing bookmarks.
<!-- SECTION:NOTES:END -->
