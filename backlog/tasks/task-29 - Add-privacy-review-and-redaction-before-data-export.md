---
id: TASK-29
title: Add privacy review and redaction before data export
status: Done
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
- [x] #1 Users can preview sensitive fields and choose original, redacted, or cancel without silently changing stored bookmarks.
- [x] #2 Tests cover query parameters, fragments, email-like values, and both export and AI-context formats.
<!-- AC:END -->

## Implementation Notes

2026-09-25: Bookmark exports and AI context packs now run a privacy review before download.
`services/export-privacy.ts` reuses the Privacy Scanner rules (sensitive parameter list, OAuth
fragment parameters, token and email patterns from `bookmark-network-tools.ts`) to list sensitive
query parameters, fragment values, email-like and token-like values, and URL credentials, and to
redact them in a copy of the exported tree. `ExportPrivacyReviewDialog` offers Export original,
Export redacted, or Cancel; exports with nothing sensitive download directly. Redaction replaces
values with `REDACTED` in the file only and never changes stored bookmarks. Markdown and CSV
exports without URLs review titles only; AI context packs review only the bookmarks within their
depth and item limits. Plain in-page anchors are not flagged.
Unit tests cover query parameters, fragments, email-like values, credentials, titles, every
bookmark export format, and AI context Markdown and XML with and without stored metadata,
including escaping. Chromium E2E tests verify the dialog, downloaded Original and Redacted file
content, Cancel, the direct path, and that `chrome.bookmarks` is unchanged.
Not covered: review before sending bookmarks to an AI provider (auto-tagging, summarization);
this change covers file downloads only.
