---
id: TASK-9
title: Honor group-by-folders behavior setting
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/lib/bookmark-sort.ts
  - apps/extension/src/components/page/PopupPage.tsx
priority: medium
type: bug
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed inert setting: groupByFolders is exposed in Options but never read outside settings code. Define how it differs from the existing sort-order folders-first strategy and implement or remove it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The setting has a documented, observable effect distinct from sortOrder, or is removed to avoid a false promise.
- [ ] #2 Unit and E2E tests cover interactions with date and alphabetical ordering.
<!-- AC:END -->
