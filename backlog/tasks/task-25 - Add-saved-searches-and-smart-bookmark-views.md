---
id: TASK-25
title: Add saved searches and smart bookmark views
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
labels: []
dependencies: []
references:
  - apps/extension/src/components/ui/table/data-table-toolbar.tsx
  - apps/extension/src/hooks/use-bookmarks-page.tsx
priority: low
type: feature
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Brainstorm proposal: let users save frequently used cross-folder filters such as domain, title, date, or folder and reopen them without duplicating bookmarks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Saved views persist filter definitions only, not copied bookmarks; results update when the bookmark tree changes.
- [ ] #2 Users can create, rename, delete, and open views, with tests for stale folder IDs.
<!-- AC:END -->
