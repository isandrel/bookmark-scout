---
id: TASK-10
title: Use the configured default new-folder name
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
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
- [ ] #1 Starting folder creation pre-fills the configured name without saving until the user confirms.
- [ ] #2 The value is editable and an E2E test verifies the configured default.
<!-- AC:END -->
