---
id: TASK-25
title: Add saved searches and smart bookmark views
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-10-01 14:00'
labels: []
dependencies: []
references:
  - apps/extension/src/components/ui/table/data-table-toolbar.tsx
  - apps/extension/src/hooks/use-bookmarks-page.tsx
modified_files:
  - apps/extension/src/lib/saved-search-query.ts
  - apps/extension/src/lib/saved-searches-storage.ts
  - apps/extension/src/hooks/use-saved-searches.ts
  - apps/extension/src/components/ui/table/data-table-saved-searches.tsx
  - apps/extension/src/components/ui/table/data-table-toolbar.tsx
  - apps/extension/src/components/ui/table/data-table.tsx
  - apps/extension/src/components/page/BookmarksPage.tsx
  - apps/extension/src/hooks/use-manager-shortcuts.ts
  - apps/extension/src/components/bookmarks/ManagerShortcutsHelp.tsx
  - apps/extension/public/_locales/en/messages.json
  - apps/extension/public/_locales/ja/messages.json
  - apps/extension/public/_locales/ko/messages.json
  - apps/extension/tests/unit/saved-searches.test.ts
  - apps/extension/tests/unit/storage-items.test.ts
  - apps/extension/tests/e2e/saved-searches.spec.ts
priority: low
type: feature
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Brainstorm proposal: let users save frequently used cross-folder filters such as domain, title, date, or folder and reopen them without duplicating bookmarks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Saved views persist filter definitions only, not copied bookmarks; results update when the bookmark tree changes.
- [x] #2 Users can create, rename, delete, and open views, with tests for stale folder IDs.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- A saved search stores the manager query only: title and URL filters, type, parent folder, domain, and date-added facets, the column sort, and the folder when "Current folder only" is on (null for the top level). Opening one sets the table state, so the table filters the live bookmark tree and follows later bookmark events.
- Storage: `local:bookmark-scout-saved-searches`, payload `{ version: 1, searches }` with no WXT `$` metadata. Local rather than sync because the filters can reveal bookmark contents (same reasoning as the popup search history) and bookmark folder IDs differ per profile, so synced folder references would be wrong on other devices. Limits: 50 searches, 80-character names, 500-character text filters.
- Reads are validated per entry with zod: a malformed payload or unsupported version reads as empty, malformed entries and repeated IDs are dropped individually, unknown sort columns are dropped, and a payload without `version` is read as version 1. The next save rewrites the payload in the valid shape.
- Stale folder IDs (deleted folders, in the folder filter or the scope) are skipped rather than matching nothing; the other filters still apply and a toast reports how many were skipped.
- UI: "Saved searches" popover in the manager toolbar with save (needs at least one filter), open, inline rename (Enter saves, Escape cancels), and delete with an Undo toast; names are unique ignoring case. The active saved search is checked. `s` opens the menu and is listed in the `?` help.
- The table view key `sync:bookmark-scout-table-view` (version 1) is unchanged; opening a saved search sets the sort, which the table view persists as before.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Saved searches (smart views) ship in the bookmark manager. Unit tests cover capture, canonical serialization, applying to table state, stale folder IDs, validation, migration, limits, and local-only storage. Chromium E2E covers save, reopening after reload, live updates when bookmarks are added and deleted, rename, delete with undo, the `s` shortcut, folder-scoped searches, stale folder IDs, and malformed stored data.
<!-- SECTION:FINAL_SUMMARY:END -->
