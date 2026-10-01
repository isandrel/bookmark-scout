---
id: TASK-6
title: Give table row selection a useful bulk workflow
status: In Progress
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-24 20:53'
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
- [x] #1 Selected rows expose at least one coherent bulk action with a preview and explicit confirmation for destructive effects.
- [ ] #2 Selection clears or remains predictably after navigation and data refresh; E2E tests cover the chosen behavior.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Progress 2026-09-24 (#450): bulk toolbar with Move to folder (preview dialog) and Delete (honors confirmBeforeDelete, single undo); selection is keyed by bookmark id and survives refreshes (e2e 'selection supports bulk delete with undo and bulk move, keyed by bookmark'). Selection is cleared on folder navigation in data-table.tsx, but no E2E asserts that yet, so AC #2 stays open.
<!-- SECTION:NOTES:END -->
