---
id: TASK-23
title: Persist user tags and bookmark summaries
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-23 18:30'
labels: []
dependencies: []
references:
  - README.md
  - apps/extension/src/services/ai-bookmark-tools.ts
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
priority: high
type: feature
ordinal: 23000
modified_files:
  - apps/extension/src/lib/bookmark-metadata-storage.ts
  - apps/extension/src/components/bookmarks/BookmarkDetailsDialog.tsx
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
  - apps/extension/src/entrypoints/background.ts
  - apps/extension/src/hooks/use-bookmarks-page.tsx
  - apps/extension/public/_locales/en/messages.json
  - apps/extension/public/_locales/ja/messages.json
  - apps/extension/public/_locales/ko/messages.json
  - apps/extension/tests/unit/bookmark-metadata-storage.test.ts
  - apps/extension/tests/e2e/bookmark-metadata.spec.ts
  - README.md
  - templates/README.md
  - templates/README.ja.md
  - templates/README.ko.md
  - apps/docs/content/docs/status.mdx
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed feature and README current focus: AI-generated tags and summaries are currently displayed in dialogs only. Add extension-owned metadata keyed to bookmarks, with a review/apply flow and cleanup when bookmarks disappear.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Users can save, edit, remove, and view tags/summaries without invoking AI again.
- [x] #2 Merge and dedupe settings have defined semantics; metadata survives reload and handles removed/moved bookmarks safely.
- [x] #3 AI generation remains opt-in and tests use a deterministic provider stub.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bookmark Details now has a localized Tags and Summary editor that saves, edits, clears, and shows metadata stored locally under the existing `bookmark-scout-bookmark-metadata` key, so AI context export (TASK-12) reads the same records. Auto-Tagging and Summarizer results get an explicit review-then-save action. Tags use the Auto-Tagging merge mode (append or replace) and optional case-insensitive dedupe. Summaries use the Summarizer merge mode (append adds a paragraph, replace overwrites). Manual saves replace both fields and always dedupe. Metadata is keyed by bookmark ID, so it survives reloads and moves. The background `bookmarks.onRemoved` listener removes it for deleted bookmarks and their descendants, and the bookmarks page reconciles away stale entries without blocking the load. AI stays opt-in. Unit tests use a stubbed `generateObject` provider and a fake browser storage; isolated Chromium E2E covers save/edit/clear/move/reload and deletion cleanup. Lint, unit tests, Chromium E2E, and Chrome/Firefox/Edge builds passed.
<!-- SECTION:FINAL_SUMMARY:END -->
