---
id: TASK-13
title: Enforce AI reorganization safety settings
status: Done
assignee: []
created_date: '2026-09-23 16:30'
updated_date: '2026-09-23 13:30'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/services/ai-reorganization.ts
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
modified_files:
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
  - apps/extension/src/services/ai-reorganization.ts
  - apps/extension/tests/e2e/tool-settings.spec.ts
  - apps/extension/tests/unit/ai-reorganization.test.ts
priority: high
type: bug
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed inert settings: reorganizationDryRunFirst, reorganizationMinConfidence, and reorganizationBatchSize are exposed in Options but not consumed by the reorganization flow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The apply flow respects dry-run, confidence, and batching semantics or removes unsupported controls.
- [x] #2 Isolated tests cover low-confidence plans, partial failure, and no mutation during preview.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
AI reorganization now reads the saved dry-run, minimum-confidence, and batch-size settings. Provider requests are split into configured batches, low-confidence or out-of-batch suggestions are excluded, and apply revalidates confidence while requiring explicit preview confirmation when configured; disabling dry-run changes the explicit tool action to Apply Changes and applies the generated plan directly. Synthetic provider and bookmark API tests cover opt-in enforcement, batching, low confidence, preview-only behavior, disabled dry-run gating, and partial mutation failures. Lint, 18 unit tests, Chrome/Firefox/Edge builds, and all 23 disposable-profile Chromium E2E tests passed; live provider compatibility remains untested.
<!-- SECTION:FINAL_SUMMARY:END -->
