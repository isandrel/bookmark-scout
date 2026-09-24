---
id: TASK-20
title: Localize hard-coded manager and tool-card labels
status: In Progress
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Tool-card part done on `fix/tools-i18n`: Tools sidebar headings, tool cards, scope selector, export/import cards, all tool result dialogs, and the AI reorganization dialog now use en/ja/ko messages; ja/ko now have the same key set as en. Covered by `tests/unit/locale-messages.test.ts` (key parity, placeholder definitions, `t()` keys exist in en) and the tool-settings E2E locale test (Japanese/Korean headings, cards, scope choices, and dialogs).

Manager table/toolbar/pagination part is handled separately; leave both acceptance criteria unchecked until that work also merges.
<!-- SECTION:NOTES:END -->
