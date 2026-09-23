---
id: TASK-5
title: Keep full bookmark titles and URLs in the manager data model
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/hooks/use-bookmarks-page.tsx
  - apps/extension/src/components/ui/table/columns.tsx
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
- [ ] #1 Long titles and URLs retain full values for filtering, sorting, copying, and details while display remains readable.
- [ ] #2 An E2E test finds a match beyond the old truncation boundary.
<!-- AC:END -->
