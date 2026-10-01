---
id: TASK-4
title: Make manager all-bookmarks filtering actually global
status: Done
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-24 20:53'
labels: []
dependencies: []
references:
  - apps/extension/src/hooks/use-bookmarks-page.tsx
  - apps/extension/src/components/ui/table/data-table-toolbar.tsx
priority: high
type: bug
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed mismatch: the toolbar says unchecked filters apply to all bookmarks, but the navigation hook loads only the current folder and the toolbar adds filters for non-column IDs. Define and implement real current-folder versus global search scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A global filter finds matching bookmarks across nested folders and shows their actual folder path.
- [x] #2 Current-folder mode stays scoped to the selected folder; tests prove both modes.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-09-24: shipped in #432; covered by e2e 'manager filters globally across nested folders or only the selected folder' (bookmark-workflows.spec.ts) and bookmark-manager-qa.spec.ts.
<!-- SECTION:NOTES:END -->
