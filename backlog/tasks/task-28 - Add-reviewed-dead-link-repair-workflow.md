---
id: TASK-28
title: Add reviewed dead-link repair workflow
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
labels: []
dependencies: []
references:
  - apps/extension/src/services/bookmark-network-tools.ts
  - apps/extension/src/components/bookmarks/ToolResultViews.tsx
priority: low
type: feature
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Brainstorm proposal: the dead-link tool reports results only and uses HEAD requests, which some sites reject. Add an optional bounded GET fallback and reviewed actions to edit, archive, or remove genuinely broken bookmarks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 HTTP/auth/rate-limit/HEAD-unsupported results are classified separately from confirmed dead links.
- [ ] #2 No bookmark is changed without a review step; network tests use deterministic local fixtures.
<!-- AC:END -->
