---
id: TASK-29
title: Add privacy review and redaction before data export
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
labels: []
dependencies: []
references:
  - apps/extension/src/services/bookmark-network-tools.ts
  - apps/extension/src/services/bookmark-export.ts
  - apps/extension/src/services/ai-bookmark-tools.ts
priority: medium
type: feature
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Brainstorm proposal: exports and AI context packs can include full bookmark URLs containing tokens or private query values. Reuse privacy-scanner findings to offer a review/redaction option before download or provider submission.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Users can preview sensitive fields and choose original, redacted, or cancel without silently changing stored bookmarks.
- [ ] #2 Tests cover query parameters, fragments, email-like values, and both export and AI-context formats.
<!-- AC:END -->
