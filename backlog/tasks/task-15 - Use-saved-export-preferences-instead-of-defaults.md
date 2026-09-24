---
id: TASK-15
title: Use saved export preferences instead of defaults
status: Done
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/services/bookmark-export.ts
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
  - apps/extension/src/lib/settings-schema.ts
priority: medium
type: bug
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed settings mismatch: export serializers and filename generation read defaultSettings, and ToolsSidebar forces includeDates=true. User-saved filename, indent, date, and URL preferences are not passed into export.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All documented export preferences affect the relevant formats and filename while preserving valid imports.
- [x] #2 E2E tests save non-default settings and inspect the downloaded content and filename.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Export now passes saved format, filename prefix/max length, include dates/URLs, and JSON/HTML/Markdown indentation. Unit tests cover serializers; E2E saves non-default settings and inspects the downloaded CSV/JSON content and filename.
<!-- SECTION:NOTES:END -->
