---
id: TASK-18
title: Implement or remove statistics depth-breakdown control
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/services/bookmark-tooling.ts
  - apps/extension/src/components/bookmarks/ToolResultViews.tsx
priority: low
type: bug
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed inert setting: statisticsIncludeDepthBreakdown is exposed in Options but has no runtime consumer; statistics currently show deepest level only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 If enabled, a depth distribution is calculated and displayed; if disabled it is omitted, or the unsupported control is removed.
- [ ] #2 Unit and E2E tests cover nested folders and the setting.
<!-- AC:END -->
