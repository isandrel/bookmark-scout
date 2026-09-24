---
id: TASK-2
title: Complete AI-recommended new-folder quick add
status: Done
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/components/page/PopupPage.tsx
  - apps/extension/src/services/ai-recommendation.ts
priority: medium
type: bug
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed placeholder: choosing an AI recommendation for a new folder only shows a coming-soon toast; it never creates the folder or saves the current tab.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reviewed new-folder recommendation creates the intended folder path and bookmark, with duplicate/path conflict handling.
- [x] #2 Isolated E2E tests cover success, cancellation, and failure without calling a live AI provider.
<!-- AC:END -->

## Implementation Notes

2026-09-23: New-folder recommendations now open a confirmation dialog that shows the proposed
path and current tab. Approval reuses matching folders, creates missing nested folders, avoids
duplicate URLs, rejects bookmark-vs-folder path conflicts, and rolls back folders created by a
failed transaction. Chromium E2E tests use an intercepted custom-provider endpoint with synthetic
responses; no live provider or credentials are used.

Verified after rebase onto main (32194f1): extension lint, unit tests (28), Firefox/Edge
builds, and Chromium E2E (27, including 3 AI folder quick-add specs) pass.
