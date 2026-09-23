---
id: TASK-3
title: Implement the manager's View Details action
status: Done
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-23 19:59'
labels: []
dependencies: []
references:
  - apps/extension/src/components/ui/table/columns.tsx
modified_files:
  - apps/extension/public/_locales/en/messages.json
  - apps/extension/public/_locales/ja/messages.json
  - apps/extension/public/_locales/ko/messages.json
  - apps/extension/src/components/bookmarks/BookmarkDetailsDialog.tsx
  - apps/extension/src/components/page/BookmarksPage.tsx
  - apps/extension/src/components/ui/table/columns.tsx
  - apps/extension/src/services/bookmarks.ts
  - apps/extension/tests/e2e/bookmark-workflows.spec.ts
priority: medium
type: bug
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed placeholder: the bookmarks table renders a View Details menu item with no action. Provide a useful details view, or remove the affordance until it exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 View Details opens the selected item's full title, URL, path, dates, and available actions without mutating data.
- [x] #2 An automated browser test verifies the action opens the correct item.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented a localized read-only details dialog with full bookmark metadata, folder-path resolution, and copy/open actions. A disposable-profile Chromium test verifies the selected bookmark, its available actions, and that opening the dialog does not mutate browser bookmark data. Extension lint, all three browser builds, 13 unit tests, and the full 19-case Chromium E2E suite passed.
<!-- SECTION:FINAL_SUMMARY:END -->
