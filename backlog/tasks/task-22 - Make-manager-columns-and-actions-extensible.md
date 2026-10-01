---
id: TASK-22
title: Make manager columns and actions extensible
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-30 21:10'
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
- [x] #1 Column definitions and row actions can be added without editing unrelated table rendering code.
- [x] #2 Bookmark mutations use the established service layer and current table tests remain green.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-30: `components/ui/table/columns.tsx` is now a typed column registry (`BOOKMARK_COLUMNS`: id, labelKey, accessor, header, cell, filterFn/sortFn, size, defaultVisible, hideBelowWidth, internal) turned into TanStack definitions by `createColumns(context, columns)`. The saved view's column ids/default visibility (`lib/bookmark-table-view-storage.ts`, key and version unchanged), column sizing (`lib/bookmark-table-column-sizes.ts`), narrow-width hiding (`getSpaceHiddenColumnIds`), and labels derive from it. Row-menu items come from `components/ui/table/bookmark-row-actions.ts` (`BOOKMARK_ROW_ACTIONS`: id, labelKey, icon, isAvailable, isDestructive, run(row, context)); the page supplies the context (details, edit, requestDeletion via useBookmarkDeletion, reportError). In-folder reordering moved from cell rendering to `moveBookmarkWithinFolder` in `services/bookmarks.ts`. `tests/unit/bookmark-table-registry.test.ts` registers a column and an action outside the table and renders them; existing table unit and E2E tests pass unchanged.
<!-- SECTION:NOTES:END -->
