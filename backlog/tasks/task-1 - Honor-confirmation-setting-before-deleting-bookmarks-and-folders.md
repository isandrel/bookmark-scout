---
id: TASK-1
title: Honor confirmation setting before deleting bookmarks and folders
status: Done
assignee: []
created_date: '2026-09-23 16:28'
updated_date: '2026-09-23 17:55'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/components/page/PopupPage.tsx
  - apps/extension/src/stores/bookmark-store.ts
  - apps/extension/tests/e2e/bookmark-workflows.spec.ts
modified_files:
  - apps/extension/src/components/page/PopupPage.tsx
  - apps/extension/src/components/bookmark/BookmarkItem.tsx
  - apps/extension/src/components/bookmark/FolderItem.tsx
  - apps/extension/tests/e2e/bookmark-workflows.spec.ts
  - apps/extension/public/_locales/en/messages.json
  - apps/extension/public/_locales/ja/messages.json
  - apps/extension/public/_locales/ko/messages.json
priority: high
type: bug
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed gap: confirmBeforeDelete is exposed in settings, but popup deletion calls removeBookmark/removeFolder directly and the store immediately deletes. Preserve explicit confirmation for folders and bookmarks when enabled, and immediate behavior only when disabled.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deleting a bookmark or folder prompts only when confirmBeforeDelete is enabled; cancelling leaves the tree unchanged.
- [x] #2 Automated tests cover enabled, disabled, and cancel paths in an isolated browser profile.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Popup and side-panel deletion now reads the current confirmation setting before deleting. Enabled mode shows a localized, item-specific dialog; cancel preserves bookmark data; disabled mode deletes immediately. Isolated Chromium E2E covers both item types and both settings, with Japanese and Korean dialog assertions. Lint, unit tests, Chromium E2E, and Chrome/Firefox/Edge builds passed.
<!-- SECTION:FINAL_SUMMARY:END -->
