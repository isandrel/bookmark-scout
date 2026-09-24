---
id: TASK-9
title: Honor group-by-folders behavior setting
status: Done
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-23 18:56'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/lib/bookmark-sort.ts
  - apps/extension/src/components/page/PopupPage.tsx
priority: medium
type: bug
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed inert setting: groupByFolders is exposed in Options but never read outside settings code. Define how it differs from the existing sort-order folders-first strategy and implement or remove it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The setting has a documented, observable effect distinct from sortOrder, or is removed to avoid a false promise.
- [x] #2 Unit and E2E tests cover interactions with date and alphabetical ordering.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Group by Folders now lists subfolders before bookmarks at each popup/side-panel tree level, then applies sortOrder (date or alphabetical) inside each group; turning it off interleaves folders and bookmarks. The Options description and docs state this. Unit tests cover date and alphabetical ordering with grouping on and off; Chromium E2E toggles both settings live. The bookmarks manager table is unchanged and still follows sortOrder only.
<!-- SECTION:FINAL_SUMMARY:END -->
