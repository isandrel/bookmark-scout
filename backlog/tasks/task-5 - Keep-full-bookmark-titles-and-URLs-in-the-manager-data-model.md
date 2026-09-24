---
id: TASK-5
title: Keep full bookmark titles and URLs in the manager data model
status: Done
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-23 17:54'
labels: []
dependencies: []
references:
  - apps/extension/src/hooks/use-bookmarks-page.tsx
  - apps/extension/src/components/ui/table/columns.tsx
modified_files:
  - apps/extension/src/hooks/use-bookmarks-page.tsx
  - apps/extension/src/components/ui/table/columns.tsx
  - apps/extension/tests/e2e/bookmark-workflows.spec.ts
priority: high
type: bug
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed data-model loss: processNode truncates titles to 30 characters and URLs to 50 before sorting, filtering, and rendering. Truncate only at presentation boundaries so long values remain searchable and accurate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Long titles and URLs remain full in the manager model for filtering, sorting, selection/copy, and hover details; visible cells truncate only with CSS. The separate View Details action remains TASK-3.
- [x] #2 An isolated browser E2E test finds title and URL matches beyond the former 30/50-character limits and confirms sort does not mutate stored order.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-23 17:50
---
Implementation is scoped to preserving full bookmark title/URL values in the manager data model and accessible cell content. The separate View Details control is tracked by TASK-3.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed title/URL truncation from the manager data model, added CSS-only visual truncation with full-value hover text, and verified long-value filtering/sorting in the disposable Chromium profile. Lint, Chrome/Firefox/Edge builds, six unit tests, and the full 18-case Chromium E2E suite passed.
<!-- SECTION:FINAL_SUMMARY:END -->
