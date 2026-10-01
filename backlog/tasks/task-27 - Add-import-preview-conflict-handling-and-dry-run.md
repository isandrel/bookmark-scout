---
id: TASK-27
title: 'Add import preview, conflict handling, and dry run'
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-25 19:00'
labels: []
dependencies: []
references:
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
  - apps/extension/src/services/bookmark-import.ts
modified_files:
  - apps/extension/src/services/bookmark-import.ts
  - apps/extension/src/services/bookmarks.ts
  - apps/extension/src/components/bookmarks/ImportPreviewDialog.tsx
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
  - apps/extension/public/_locales/en/messages.json
  - apps/extension/public/_locales/ja/messages.json
  - apps/extension/public/_locales/ko/messages.json
  - apps/extension/tests/unit/bookmark-import.test.ts
  - apps/extension/tests/e2e/tool-import-preview.spec.ts
  - apps/extension/tests/e2e/import-fixtures/conflicts.html
  - apps/extension/tests/e2e/import-fixtures/conflicts.json
  - apps/extension/tests/e2e/tool-data-io.spec.ts
  - apps/extension/tests/e2e/bookmark-workflows.spec.ts
  - apps/docs/content/docs/features.mdx
priority: medium
type: feature
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Brainstorm proposal: import currently writes parsed bookmarks directly into the current/default folder. Add a preflight view with target selection, duplicate/conflict strategy, counts, and explicit apply.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Preview does not mutate bookmarks and reports the exact target and planned changes.
- [x] #2 Apply handles partial failures clearly and E2E tests use a disposable browser profile and fixture files.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `services/bookmark-import.ts` adds pure planning: `listImportTargets(tree)` (writable folders with full paths; root and managed folders excluded), `planImport(parsed, tree, targetId, strategy)` and `isSameImportPlan`. Duplicates are exact URL matches classified as in the target (including subfolders), elsewhere, or repeated earlier in the file. Strategies: `skip-anywhere` (default), `skip-in-target` (also skips in-file repeats, since they would land in the target), `import-all`. Folders whose every item is skipped are pruned; folders empty in the file are still created.
- `applyImportPlan(plan)` replaces `importBookmarks`: it attempts every planned item and returns created / skipped (plan skips plus invalid entries) / failed counts, error messages, and created IDs. `undoImport` removes created top-level items only while their subtree contains nothing but imported items, so bookmarks the user added into an imported folder are never deleted.
- `ImportPreviewDialog.tsx` reads the live tree, preselects the current folder, and lets the user change target and strategy. Apply re-plans against a fresh tree; if the plan changed (stale preview) or the target disappeared, it shows the refreshed plan instead of applying. Results appear in a toast with Undo (10 s, the existing undo window); on partial failure the dialog stays open with the counts, the error messages, and Undo.
- `ToolsSidebar.tsx` only parses the file and opens the dialog; empty or unreadable files still fail with the existing toast. `getBookmarkSubTree` in `services/bookmarks.ts` is now exported for the undo check.
- Tests: unit coverage for targets, duplicate classification per strategy, nested folders, empty file, malformed input, stale-plan detection, no browser calls during planning, apply with a simulated partial failure, and undo. Chromium E2E (`tool-import-preview.spec.ts`) uses HTML and JSON fixture files in a disposable profile and verifies via `chrome.bookmarks`: preview counts and target, cancel leaves the whole tree unchanged, the exact tree for each strategy, choosing another target plus undo, stale preview refresh, partial failure reporting with undo, and literal rendering of markup in titles.
- Not covered: Firefox and Edge runtime (build validation only); URL matching is exact, not normalized like the duplicate finder.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Import now opens a dry-run preview with the exact target folder (selectable), counts of bookmarks and folders to create or skip, detected duplicates, and a duplicate strategy. Nothing is written until the user applies; apply rechecks for stale previews, reports created/skipped/failed counts, keeps failures visible, and supports undo. Unit and Chromium E2E tests with fixture files cover planning, each strategy's resulting tree, cancel, stale preview, partial failure, and undo.
<!-- SECTION:FINAL_SUMMARY:END -->
