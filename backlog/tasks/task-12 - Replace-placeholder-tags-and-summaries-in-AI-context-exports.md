---
id: TASK-12
title: Replace placeholder tags and summaries in AI context exports
status: Done
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
- [x] #1 Exports never label an empty tag list or truncated title as generated metadata.
- [x] #2 Tests cover both formats with and without stored tags/summaries, including escaping and privacy review.
<!-- AC:END -->

## Implementation Notes

2026-09-23: AI context exports now read extension-owned bookmark metadata, include only
non-empty saved tags and summaries, and omit missing metadata fields in Markdown and XML.
Deterministic unit coverage verifies both formats, stored and missing metadata, and XML escaping;
Chromium E2E coverage verifies the downloaded Markdown content from local extension storage.
Saving, editing, and applying metadata remains TASK-23. Acceptance criterion 2 remains open because
export privacy review and redaction is intentionally tracked in TASK-29.

2026-09-25: Acceptance criterion 2 is complete with TASK-29: unit tests cover Markdown and XML
context packs with and without stored tags and summaries, escaping, and privacy review
redaction, and Chromium E2E covers a redacted Markdown context pack download.
