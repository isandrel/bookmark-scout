---
id: TASK-21
title: Persist customizable bookmark-table views
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
labels: []
dependencies: []
references:
  - apps/extension/src/components/ui/table/data-table.tsx
  - apps/extension/src/components/ui/table/data-table-view-options.tsx
  - apps/extension/src/lib/settings-storage.ts
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
- [ ] #1 A user can configure a table view and see it restored after reopening without changing underlying browser bookmark order.
- [ ] #2 State is validated/migratable and E2E tests cover save, restore, and reset.
<!-- AC:END -->
