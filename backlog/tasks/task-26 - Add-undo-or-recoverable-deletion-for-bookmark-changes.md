---
id: TASK-26
title: Add undo or recoverable deletion for bookmark changes
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-24 01:15'
labels: []
dependencies: []
references:
  - apps/extension/src/services/bookmarks.ts
  - apps/extension/src/stores/bookmark-store.ts
  - apps/extension/src/services/ai-reorganization.ts
  - apps/extension/src/components/page/PopupPage.tsx
  - apps/extension/tests/e2e/bookmark-workflows.spec.ts
modified_files:
  - apps/extension/src/services/bookmarks.ts
  - apps/extension/src/components/page/PopupPage.tsx
  - apps/extension/public/_locales/en/messages.json
  - apps/extension/public/_locales/ja/messages.json
  - apps/extension/public/_locales/ko/messages.json
  - apps/extension/tests/e2e/bookmark-workflows.spec.ts
  - apps/extension/tests/unit/bookmark-deletion-recovery.test.ts
priority: high
type: feature
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Brainstorm proposal: bookmark delete, bulk cleanup, and reorganization can have irreversible effects. Design a bounded undo/recovery mechanism with clear limits and privacy-safe local storage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Users can restore a deleted bookmark or folder tree after a confirmed destructive action within the supported window.
- [x] #2 Tests cover nested folders, repeated operations, and restore conflicts; UI states what cannot be recovered.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Popup and side-panel bookmark deletion now captures an in-memory snapshot (titles, URLs, folder structure, sibling order, Firefox separators; no IDs or dates) before removal and offers Undo for 10 seconds (`BOOKMARK_DELETION_UNDO_WINDOW_MS`). The snapshot carries an explicit expiry enforced by the service, restores at most once, and coexists with the TASK-1 confirm-before-delete setting (confirmed or unconfirmed deletes both offer Undo). Undo recreates the bookmark or nested folder tree under its original parent, clamps the original position if siblings changed, rolls back partial restores, and fails safely with a localized message if the parent folder no longer exists or the window expired. Recovery is bounded to the latest deletion toast in the open window; browser IDs/dates, recovery after closing, bulk cleanup, and AI-reorganization changes are not recoverable, and en/ja/ko UI states these limits. Unit tests cover nested restore fidelity, expiry, index clamping, missing-parent conflicts, rollback, and repeated deletions; isolated Chromium E2E covers bookmark and nested-folder undo, repeated deletion replacement, and missing-parent conflicts. Lint, unit tests, Chromium E2E, and Firefox/Edge builds passed.
<!-- SECTION:FINAL_SUMMARY:END -->
