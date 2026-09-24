---
id: TASK-21
title: Persist customizable bookmark-table views
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-23 20:15'
labels: []
dependencies: []
references:
  - apps/extension/src/components/ui/table/data-table.tsx
  - apps/extension/src/components/ui/table/data-table-view-options.tsx
  - apps/extension/src/lib/settings-storage.ts
  - apps/extension/src/lib/bookmark-table-view-storage.ts
  - apps/extension/tests/e2e/sorting.spec.ts
modified_files:
  - apps/extension/src/lib/bookmark-table-view-storage.ts
  - apps/extension/src/lib/index.ts
  - apps/extension/src/components/ui/table/table-features.ts
  - apps/extension/src/components/ui/table/data-table.tsx
  - apps/extension/src/components/ui/table/data-table-toolbar.tsx
  - apps/extension/src/components/ui/table/data-table-view-options.tsx
  - apps/extension/public/_locales/en/messages.json
  - apps/extension/public/_locales/ja/messages.json
  - apps/extension/public/_locales/ko/messages.json
  - apps/extension/tests/unit/bookmark-table-view-storage.test.ts
  - apps/extension/tests/e2e/sorting.spec.ts
priority: high
type: feature
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed feature: the manager can currently toggle some columns only in component-local state. Save configurable column visibility/order, page size, and sort preferences across manager reopen, with a sensible reset-to-defaults path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A user can configure a table view and see it restored after reopening without changing underlying browser bookmark order.
- [x] #2 State is validated/migratable and E2E tests cover save, restore, and reset.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bookmark table column visibility and order, page size, and table sorting now persist in a versioned, validated sync-storage record. The view menu supports localized column ordering and reset controls. Unit coverage verifies migration, validation, and forward-compatible column handling; isolated Chromium E2E verifies user-driven save, reload restoration, reset, and unchanged browser bookmark order. Lint, unit tests, full Chromium E2E, and Chrome, Firefox, and Edge builds passed.
<!-- SECTION:FINAL_SUMMARY:END -->
