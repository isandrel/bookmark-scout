---
id: TASK-6
title: Give table row selection a useful bulk workflow
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/components/ui/table/columns.tsx
  - apps/extension/src/components/ui/table/data-table.tsx
priority: medium
type: enhancement
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed incomplete UI: the table displays row selection checkboxes and tracks selection state, but no visible action consumes selected rows. Add safe bulk actions or remove selection until they are ready.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Selected rows expose at least one coherent bulk action with a preview and explicit confirmation for destructive effects.
- [ ] #2 Selection clears or remains predictably after navigation and data refresh; E2E tests cover the chosen behavior.
<!-- AC:END -->
