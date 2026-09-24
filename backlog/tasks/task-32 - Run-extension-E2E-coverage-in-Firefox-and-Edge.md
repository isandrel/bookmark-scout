---
id: TASK-32
title: Run extension E2E coverage in Firefox and Edge
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
labels: []
dependencies: []
references:
  - apps/extension/project.json
  - apps/extension/tests/e2e
  - README.md
priority: medium
type: task
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Coverage gap: Firefox and Edge have build targets but the current runtime E2E suite runs Chromium only. Add a practical browser matrix and document unsupported APIs, including Firefox sidebar differences.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CI runs a clearly scoped runtime smoke suite in each supported browser target or records a reproducible platform limitation.
- [ ] #2 The report separates build success from runtime behavior and avoids claiming identical support where APIs differ.
<!-- AC:END -->
