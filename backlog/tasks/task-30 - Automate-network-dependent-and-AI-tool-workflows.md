---
id: TASK-30
title: Automate network-dependent and AI tool workflows
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-23 18:40'
labels: []
dependencies: []
references:
  - apps/extension/tests/e2e
  - apps/extension/src/services/bookmark-network-tools.ts
  - apps/extension/src/services/ai-bookmark-tools.ts
  - apps/extension/tests/e2e/additional-workflows.spec.ts
priority: high
type: task
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Current 17-case Chromium E2E suite covers dead-link and metadata fetchers with deterministic route mocks, but provider-backed AI tools, opt-in/error paths, and live-network compatibility remain unverified. Extend isolated tests with provider stubs and guarded-apply assertions without real credentials or external site dependencies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CI runs reliable network/AI-path tests without real credentials, live provider calls, or external site dependencies.
- [x] #2 The test report distinguishes mocked provider contracts from actual provider compatibility.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added `[mocked provider contract]` Vitest coverage (`tests/unit/ai-bookmark-workflows.test.ts`, `ai` SDK stubbed) and Chromium E2E coverage (Playwright-routed OpenAI-compatible endpoint on `provider.invalid`, synthetic key) for auto-tagging/summarizer opt-in gating, success preview, provider errors, and route-mocked network transport failures. Tests exposed two fixes: AI tool results now keep only requested bookmark IDs (deduplicated, local title/URL), and the bookmarks page now mounts `<Toaster />` so tool errors are visible. CI runs these via `bun run test`. CONTRIBUTING, docs, and AGENTS files state that these verify mocked contracts, not live provider or website compatibility, which remains manual.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-23 17:12
---
2026-09-23: Added passing Chromium E2E tests with intercepted fixture responses for dead-link and metadata fetchers, plus offline AI context export. Provider-backed AI generation and live-network compatibility remain untested.
---
<!-- COMMENTS:END -->
