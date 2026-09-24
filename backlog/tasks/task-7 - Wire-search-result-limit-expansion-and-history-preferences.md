---
id: TASK-7
title: 'Wire search result limit, expansion, and history preferences'
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/stores/bookmark-store.ts
  - apps/extension/src/components/bookmark/BookmarkSearch.tsx
priority: medium
type: bug
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed inert settings: maxSearchResults, expandFoldersOnSearch, and searchHistory appear in Options but have no runtime consumer outside the schema/options page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each setting changes observable popup/side-panel search behavior as labeled, or is removed from Options.
- [ ] #2 Isolated tests cover limits, matching-folder expansion, and history retention/clear behavior.
<!-- AC:END -->
