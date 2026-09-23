---
id: TASK-16
title: Make context-menu enablement and naming settings effective
status: Done
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-23 17:57'
labels: []
dependencies: []
references:
  - apps/extension/src/services/context-menu.ts
  - apps/extension/src/lib/settings-storage.ts
  - apps/extension/src/entrypoints/background.ts
modified_files:
  - apps/extension/src/entrypoints/background.ts
  - apps/extension/src/services/context-menu.ts
  - apps/extension/tests/unit/context-menu.test.ts
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
- [x] #1 Disabling the feature removes its menu and prevents its handler from saving links; re-enabling restores it.
- [x] #2 Naming modes read the saved sync preference and are covered by isolated background/context-menu tests.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Context menu enablement now controls menu creation and blocks stale clicks. Naming reads synced settings. Mocked Chrome API integration tests cover startup disabled, disable/re-enable, all naming modes, rapid toggles, and disabling during provider loading; 13 unit and 17 disposable Chromium E2E tests passed. Chrome, Firefox, and Edge builds passed; Firefox and Edge runtime behavior remains untested.
<!-- SECTION:FINAL_SUMMARY:END -->
