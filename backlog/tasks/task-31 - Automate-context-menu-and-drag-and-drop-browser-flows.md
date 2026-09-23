---
id: TASK-31
title: Automate context-menu and drag-and-drop browser flows
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-23 17:12'
labels: []
dependencies: []
references:
  - apps/extension/tests/e2e
  - apps/extension/src/services/context-menu.ts
  - apps/extension/src/components/bookmark/FolderItem.tsx
  - apps/extension/tests/e2e/additional-workflows.spec.ts
priority: medium
type: task
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Coverage gap: current E2E tests exercise popup and manager controls but not right-click context-menu save or drag-and-drop moves in a disposable extension profile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tests verify created bookmark destination and title for context-menu flows.
- [ ] #2 Tests verify folder/bookmark drag-drop ordering and move results using synthetic bookmarks only.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-23 17:12
---
2026-09-23: Attempted popup drag-and-drop in the disposable Chromium profile with Playwright dragTo and pointer movement. No drop indicator or move handler was observed; bookmark order remained unchanged. Harness versus product cause is unresolved, so no failing drag test was added to CI. Context-menu behavior remains untested.
---
<!-- COMMENTS:END -->
