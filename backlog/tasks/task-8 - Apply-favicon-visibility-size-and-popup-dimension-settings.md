---
id: TASK-8
title: 'Apply favicon visibility, size, and popup dimension settings'
status: Done
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-24 20:53'
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
- [x] #1 Saved appearance choices visibly affect the popup without layout overflow or broken fallback icons.
- [x] #2 Tests verify values persist and apply after reopening the extension.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-09-24: shipped in #452 (popup) and #449 (options clamps); covered by e2e 'popup applies favicon, new folder name, and popup size settings' (popup-tree-actions.spec.ts) and options-settings.spec.ts.
<!-- SECTION:NOTES:END -->
