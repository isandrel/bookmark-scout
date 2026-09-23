---
id: TASK-2
title: Complete AI-recommended new-folder quick add
status: To Do
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
- [ ] #1 A reviewed new-folder recommendation creates the intended folder path and bookmark, with duplicate/path conflict handling.
- [ ] #2 Isolated E2E tests cover success, cancellation, and failure without calling a live AI provider.
<!-- AC:END -->
