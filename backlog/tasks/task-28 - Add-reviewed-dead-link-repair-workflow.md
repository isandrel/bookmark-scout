---
id: TASK-28
title: Add reviewed dead-link repair workflow
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-10-01 13:30'
labels: []
dependencies: []
references:
  - apps/extension/src/services/bookmark-network-tools.ts
  - apps/extension/src/components/bookmarks/ToolResultViews.tsx
modified_files:
  - README.md
  - apps/docs/content/docs/features.mdx
  - apps/extension/public/_locales/en/messages.json
  - apps/extension/public/_locales/ja/messages.json
  - apps/extension/public/_locales/ko/messages.json
  - apps/extension/src/components/bookmarks/DeadLinkRepairDialog.tsx
  - apps/extension/src/components/bookmarks/ToolResultViews.tsx
  - apps/extension/src/components/bookmarks/ToolsSidebar.tsx
  - apps/extension/src/services/bookmark-network-tools.ts
  - apps/extension/src/services/dead-link-repair.ts
  - apps/extension/tests/e2e/tool-dead-link-repair.spec.ts
  - apps/extension/tests/unit/dead-link-repair.test.ts
  - apps/extension/tests/unit/network-tools.test.ts
  - templates/README.md
  - templates/README.ja.md
  - templates/README.ko.md
  - translations/README.ja.md
  - translations/README.ko.md
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
- [x] #1 HTTP/auth/rate-limit/HEAD-unsupported results are classified separately from confirmed dead links.
- [x] #2 No bookmark is changed without a review step; network tests use deterministic local fixtures.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Earlier progress: HEAD 405/501 falls back to a bounded GET (body discarded), redirects report their destination, and non-web URLs are skipped; network behavior is tested against a real local HTTP server.

Completed: each failed result now carries a category. Only `notFound` (404/410), `unreachable` (refused or DNS), and `redirectLoop` count as confirmed dead; `auth` (401/403/407), `rateLimited` (429), `methodRejected` (405/501 for both HEAD and GET), `serverError` (5xx), `httpError`, and `timeout` are shown as "Check manually". The results dialog summarizes the groups and offers Review repairs.

The review (`DeadLinkRepairDialog`) lists failed, timed-out, and redirected links, confirmed dead first, each defaulting to Keep. Choices: delete, use redirect target (only when a redirect was seen), use a Wayback Machine link (`https://web.archive.org/web/<url>`, built locally with no extra request), or edit the URL (http/https only, must differ). Nothing changes until Apply; the dialog shows delete/replace/keep counts. `applyDeadLinkRepairs` re-reads each bookmark and skips any that were deleted or changed URL since the scan, reports skipped and failed items, and `undoDeadLinkRepairs` restores deletions (10-second window) and replaced URLs unless they were edited again.

No settings were added. Partial apply failures are covered by unit tests only; the E2E suite covers each choice, cancel, stale scans, and undo against a real local HTTP server (404, redirect, 401, refused port). Live sites and the Wayback Machine itself are not exercised.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dead-link results now separate confirmed dead links from auth, rate-limit, HEAD-unsupported, server-error, and timeout results, and a reviewed repair dialog lets the user keep, delete, follow the redirect, use an archived copy, or edit each link. Changes apply only on explicit Apply, skip bookmarks changed since the scan, report partial results, and can be undone. Covered by unit tests for classification and plan/apply/undo and by Chromium E2E tests against a real local HTTP server.
<!-- SECTION:FINAL_SUMMARY:END -->
