---
id: TASK-35
title: Reconcile documentation with implemented feature status
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-10-01 00:20'
labels: []
dependencies: []
references:
  - README.md
  - apps/docs/content/docs
  - apps/extension/src/components/page/PopupPage.tsx
priority: medium
type: docs
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The README marks broad capabilities as implemented even where code contains coming-soon UI or preview-only tools. After triage, label supported, partial, and planned behavior accurately across README and docs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Claims about deletion confirmation, AI new-folder saving, metadata application, and AI context metadata match shipped behavior.
- [x] #2 English/Japanese/Korean documentation stays aligned where those claims are translated.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Verified against code: deletion confirmation is the `confirmBeforeDelete` setting (default on) in the popup, side panel, and manager, with a 10-second Undo that restores saved tags and summaries; a suggested new AI folder opens a review dialog and `createRecommendedFolderBookmark` creates missing folders and saves the page (no duplicate save, path conflicts reported); the Metadata Fetcher applies only reviewed titles (`applyMetadataTitles`), shows descriptions for review only, and fetches no favicons; AI context exports include locally saved tags and summaries when enabled.
- README.md and `translations/README.{ja,ko}.md`: corrected delete, metadata, AI recommendation, AI tools, and import/export lines; added a Partial section (local-only tags and summaries, prompt-level AI limits, Firefox/Edge build-only); replaced stale roadmap items (persistent tags shipped, network/AI coverage shipped) with backlog-backed ones.
- `apps/docs/content/docs/features.mdx` and `status.mdx` (English only; no localized docs exist): same corrections plus Partial and Planned sections.
- `apps/website/messages/{en,ja,ko}.json`: delete-items copy and roadmap items; the roadmap key `persistentTags` became `savedSearches`.
- Export privacy review (TASK-29) was on main and is documented as shipped. Import preview (TASK-27, PR #473) was not on main when this was written, so it is listed as planned and imports are described as written directly.
<!-- SECTION:NOTES:END -->
