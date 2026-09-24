---
id: TASK-7
title: 'Wire search result limit, expansion, and history preferences'
status: Done
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-23 18:56'
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
- [x] #1 Each setting changes observable popup/side-panel search behavior as labeled, or is removed from Options.
- [x] #2 Isolated tests cover limits, matching-folder expansion, and history retention/clear behavior.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Popup/side-panel search now honors maxSearchResults (first N matches in display order, with a localized notice), expandFoldersOnSearch (matching folders and ancestors open only when enabled; otherwise the pre-search expansion is kept), and searchHistory (up to 10 recent queries in local storage, recorded on Enter/blur, shown when the empty search box is focused, clearable; disabling the setting clears stored history). Clearing search restores the pre-search expansion. Unit tests cover filtering, expansion, limits, and history storage; Chromium E2E covers each setting.
<!-- SECTION:FINAL_SUMMARY:END -->
