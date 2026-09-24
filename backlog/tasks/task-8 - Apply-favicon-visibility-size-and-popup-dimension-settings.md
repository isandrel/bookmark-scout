---
id: TASK-8
title: 'Apply favicon visibility, size, and popup dimension settings'
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/components/bookmark/BookmarkItem.tsx
  - apps/extension/src/components/page/PopupPage.tsx
priority: medium
type: bug
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed inert appearance settings: showFavicons, faviconSize, popupWidth, and popupHeight appear in Options but are not read by runtime UI components.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Saved appearance choices visibly affect the popup without layout overflow or broken fallback icons.
- [ ] #2 Tests verify values persist and apply after reopening the extension.
<!-- AC:END -->
