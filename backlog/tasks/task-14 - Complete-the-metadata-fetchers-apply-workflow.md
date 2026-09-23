---
id: TASK-14
title: Complete the metadata fetcher's apply workflow
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/services/bookmark-network-tools.ts
  - apps/extension/src/components/bookmarks/ToolResultViews.tsx
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
priority: medium
type: enhancement
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Metadata Fetcher fetches titles, descriptions, and favicons and shows suggestions, while the tool card promises to fix titles and icons. The results view has no apply action or durable metadata path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Users can review and selectively apply supported title changes; descriptions/icons are stored and displayed only if supported, otherwise wording is narrowed.
- [ ] #2 Network behavior is tested with fixtures, and applying changes requires explicit user review.
<!-- AC:END -->
