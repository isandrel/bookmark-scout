---
id: TASK-11
title: Honor tool enabled and default-scope settings
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/lib/settings-schema.ts
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
  - apps/extension/src/components/bookmarks/ToolCards.tsx
priority: high
type: bug
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed cross-cutting gap: per-tool Enabled and Default Scope settings are exposed for AI, maintenance, metadata, privacy, and statistics tools, but ToolsSidebar/ToolCard hard-code visibility and initial scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every tool card obeys its enabled setting and allowed default scope; invalid scopes fall back safely.
- [ ] #2 Settings changes are reflected without a stale card state, with automated coverage for representative tools.
<!-- AC:END -->
