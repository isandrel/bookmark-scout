---
id: TASK-34
title: Add settings-to-behavior regression coverage
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-30 10:00'
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
- [x] #1 A maintained matrix maps each user-visible setting to its runtime consumer and an observable test or an explicit unsupported status.
- [x] #2 CI fails when a supported setting's representative behavior regresses.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- `apps/extension/tests/settings-matrix.ts` maps all 109 schema settings to a runtime consumer and tests, or to `unsupported` with a reason; `tests/settings-matrix.md` explains how to maintain it.
- `tests/unit/settings-matrix.test.ts` fails when a schema setting is missing from the matrix, a consumer file never mentions its setting, or a referenced test file or exact title does not exist. The referenced unit and Chromium E2E tests run in CI, so behavior regressions fail there.
- New coverage: `tests/e2e/settings-behavior.spec.ts` (toast duration, search delay, popup AI model/auto-trigger/count/truncation, statistics top-N, privacy title scanning, context pack limits, duplicate matching and group limit, reorganization scope) and `tests/unit/settings-behavior.test.ts` (privacy toggles, network concurrency/timeout/success statuses, duplicate group limit, statistics top-N, context pack limits, context menu naming).
- Inert settings fixed: `aiMaxCategories`, `aiMinItemsPerFolder`, `aiMaxItemsPerFolder` (read from defaults instead of saved settings); `autoTaggingMinTags`, `autoTaggingMaxTags`, `autoTaggingTagStyle`, `summarizerSummaryLength` (prompt templates hardcoded their values); `aiMaxRecommendations` now also caps the returned list.
- Unsupported (fixed scope): `autoTaggingDefaultScope`, `summarizerDefaultScope`, `duplicatesDefaultScope`, `privacyScannerDefaultScope`.
- Remaining gaps: AI limits are prompt-level only (provider compliance unverified) and `-1` (no limit) is sent to the reorganization prompt as-is; recent-folder settings are asserted for the context menu, not the popup panel; `truncateLength` only affects the popup AI suggestions header.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-23 17:15
---
2026-09-23: Added a passing Chromium E2E check that changes URL-cleaner preserve/remove/hash settings and verifies the resulting bookmark URL. The full settings-to-behavior matrix remains open.
---
<!-- COMMENTS:END -->
