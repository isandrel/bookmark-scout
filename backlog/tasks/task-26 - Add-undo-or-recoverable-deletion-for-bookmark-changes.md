---
id: TASK-26
title: Add undo or recoverable deletion for bookmark changes
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
labels: []
dependencies: []
references:
  - apps/extension/src/services/bookmarks.ts
  - apps/extension/src/stores/bookmark-store.ts
  - apps/extension/src/services/ai-reorganization.ts
priority: high
type: feature
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Brainstorm proposal: bookmark delete, bulk cleanup, and reorganization can have irreversible effects. Design a bounded undo/recovery mechanism with clear limits and privacy-safe local storage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Users can restore a deleted bookmark or folder tree after a confirmed destructive action within the supported window.
- [ ] #2 Tests cover nested folders, repeated operations, and restore conflicts; UI states what cannot be recovered.
<!-- AC:END -->
