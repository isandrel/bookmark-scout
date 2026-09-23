---
id: TASK-12
title: Replace placeholder tags and summaries in AI context exports
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/services/ai-bookmark-tools.ts
  - apps/extension/src/lib/settings-schema.ts
priority: high
type: bug
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Confirmed placeholder output: includeTags writes an empty list and includeSummaries copies the title into the summary field in both Markdown and XML exports. Integrate real persisted metadata, or clearly disable these options until it exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Exports never label an empty tag list or truncated title as generated metadata.
- [ ] #2 Tests cover both formats with and without stored tags/summaries, including escaping and privacy review.
<!-- AC:END -->
