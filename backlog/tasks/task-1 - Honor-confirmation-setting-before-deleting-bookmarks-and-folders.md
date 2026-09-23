---
id: TASK-1
title: Honor confirmation setting before deleting bookmarks and folders
status: To Do
assignee: []
created_date: '2026-09-23 16:28'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/components/page/PopupPage.tsx
  - apps/extension/src/stores/bookmark-store.ts
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
- [ ] #1 Deleting a bookmark or folder prompts only when confirmBeforeDelete is enabled; cancelling leaves the tree unchanged.
- [ ] #2 Automated tests cover enabled, disabled, and cancel paths in an isolated browser profile.
<!-- AC:END -->
