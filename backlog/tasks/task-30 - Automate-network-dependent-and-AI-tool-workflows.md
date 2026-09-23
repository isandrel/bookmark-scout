---
id: TASK-30
title: Automate network-dependent and AI tool workflows
status: To Do
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-23 17:15'
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
- [ ] #1 CI runs reliable network/AI-path tests without real credentials, live provider calls, or external site dependencies.
- [ ] #2 The test report distinguishes mocked provider contracts from actual provider compatibility.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-23 17:12
---
2026-09-23: Added passing Chromium E2E tests with intercepted fixture responses for dead-link and metadata fetchers, plus offline AI context export. Provider-backed AI generation and live-network compatibility remain untested.
---
<!-- COMMENTS:END -->
