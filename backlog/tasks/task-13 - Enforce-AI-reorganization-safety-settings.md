---
id: TASK-13
title: Enforce AI reorganization safety settings
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/services/ai-reorganization.ts
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
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
- [ ] #1 The apply flow respects dry-run, confidence, and batching semantics or removes unsupported controls.
- [ ] #2 Isolated tests cover low-confidence plans, partial failure, and no mutation during preview.
<!-- AC:END -->
