---
id: TASK-23
title: Persist user tags and bookmark summaries
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
labels: []
dependencies: []
references:
  - README.md
  - apps/extension/src/services/ai-bookmark-tools.ts
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
priority: high
type: feature
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed feature and README current focus: AI-generated tags and summaries are currently displayed in dialogs only. Add extension-owned metadata keyed to bookmarks, with a review/apply flow and cleanup when bookmarks disappear.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Users can save, edit, remove, and view tags/summaries without invoking AI again.
- [ ] #2 Merge and dedupe settings have defined semantics; metadata survives reload and handles removed/moved bookmarks safely.
- [ ] #3 AI generation remains opt-in and tests use a deterministic provider stub.
<!-- AC:END -->
