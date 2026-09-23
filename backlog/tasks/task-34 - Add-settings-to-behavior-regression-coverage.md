---
id: TASK-34
title: Add settings-to-behavior regression coverage
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-23 17:15'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/tests/e2e
  - apps/extension/tests/e2e/additional-workflows.spec.ts
priority: medium
type: task
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The static audit found many Options fields with no runtime references. Add representative contract tests that change settings and assert the claimed UI or service behavior, so green builds cannot mask inert controls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A maintained matrix maps each user-visible setting to its runtime consumer and an observable test or an explicit unsupported status.
- [ ] #2 CI fails when a supported setting's representative behavior regresses.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-23 17:15
---
2026-09-23: Added a passing Chromium E2E check that changes URL-cleaner preserve/remove/hash settings and verifies the resulting bookmark URL. The full settings-to-behavior matrix remains open.
---
<!-- COMMENTS:END -->
