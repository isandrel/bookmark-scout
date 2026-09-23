---
id: TASK-20
title: Localize hard-coded manager and tool-card labels
status: To Do
assignee: []
created_date: '2026-09-23 16:30'
labels: []
dependencies: []
references:
  - apps/extension/src/components/ui/table/columns.tsx
  - apps/extension/src/components/ui/table/data-table-toolbar.tsx
  - apps/extension/src/components/bookmarks/ToolCards.tsx
  - apps/extension/public/_locales/en/messages.json
priority: medium
type: bug
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The extension advertises English, Japanese, and Korean, but the manager table, toolbar, actions, and ToolCard scope controls contain hard-coded English strings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Visible manager and tool-card labels have en/ja/ko messages and follow the selected language.
- [ ] #2 Automated locale checks cover representative manager controls and tool scope choices.
<!-- AC:END -->
