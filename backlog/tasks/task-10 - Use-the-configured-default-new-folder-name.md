---
id: TASK-10
title: Use the configured default new-folder name
status: Done
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-24 20:53'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/components/page/PopupPage.tsx
priority: low
type: bug
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed inert setting: defaultNewFolderName is exposed in Options, while popup folder creation initializes the name to an empty string.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Starting folder creation pre-fills the configured name without saving until the user confirms.
- [x] #2 The value is editable and an E2E test verifies the configured default.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-09-24: shipped in #452; the new-folder input is prefilled and selected with the configured name (e2e in popup-tree-actions.spec.ts) and the setting persists (options-settings.spec.ts).
<!-- SECTION:NOTES:END -->
