---
id: TASK-16
title: Make context-menu enablement and naming settings effective
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/services/context-menu.ts
  - apps/extension/src/lib/settings-storage.ts
  - apps/extension/src/entrypoints/background.ts
priority: high
type: bug
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed settings mismatch: contextMenuEnabled has no runtime consumer. Context-menu naming reads chrome.storage.local while settings are saved to chrome.storage.sync, so the selected naming preference is ignored.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Disabling the feature removes its menu and prevents its handler from saving links; re-enabling restores it.
- [ ] #2 Naming modes read the saved sync preference and are covered by isolated background/context-menu tests.
<!-- AC:END -->
