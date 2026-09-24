---
id: TASK-14
title: Complete the metadata fetcher's apply workflow
status: Done
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
- [x] #1 Users can review and selectively apply supported title changes; descriptions/icons are stored and displayed only if supported, otherwise wording is narrowed.
- [x] #2 Network behavior is tested with fixtures, and applying changes requires explicit user review.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Title suggestions are reviewed with per-item checkboxes and applied only for selected items; bookmarks renamed after the scan are skipped. Descriptions are shown as information only; favicons are not stored (the browser API cannot set them), so the favicon option was removed from Options and the card wording narrowed. Covered by unit tests and a real local HTTP server E2E.
<!-- SECTION:NOTES:END -->
