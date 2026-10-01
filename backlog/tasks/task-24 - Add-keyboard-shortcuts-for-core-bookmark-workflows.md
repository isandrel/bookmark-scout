---
id: TASK-24
title: Add keyboard shortcuts for core bookmark workflows
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-30 21:00'
labels: []
dependencies: []
references:
  - README.md
  - apps/extension/src/components/page/PopupPage.tsx
  - apps/extension/src/components/page/BookmarksPage.tsx
priority: medium
type: feature
ordinal: 24000
modified_files:
  - apps/extension/src/lib/keyboard-shortcuts.ts
  - apps/extension/src/hooks/use-popup-shortcuts.ts
  - apps/extension/src/hooks/use-manager-shortcuts.ts
  - apps/extension/src/components/bookmarks/ManagerShortcutsHelp.tsx
  - apps/extension/src/components/page/PopupPage.tsx
  - apps/extension/src/components/page/BookmarksPage.tsx
  - apps/extension/src/components/bookmark/FolderItem.tsx
  - apps/extension/src/components/bookmark/BookmarkItem.tsx
  - apps/extension/src/components/bookmark/BookmarkSearch.tsx
  - apps/extension/public/_locales/en/messages.json
  - apps/extension/public/_locales/ja/messages.json
  - apps/extension/public/_locales/ko/messages.json
  - apps/extension/tests/unit/keyboard-shortcuts.test.ts
  - apps/extension/tests/e2e/keyboard-shortcuts.spec.ts
  - apps/docs/content/docs/features.mdx
  - apps/docs/content/docs/status.mdx
  - README.md
  - templates/README.md
  - templates/README.ja.md
  - templates/README.ko.md
  - translations/README.ja.md
  - translations/README.ko.md
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed feature from the README current-focus list: keyboard-driven search, navigation, and common non-destructive actions in popup and manager.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shortcuts are discoverable, accessible, and do not override browser-reserved or text-entry keys.
- [x] #2 Automated tests cover focus, navigation, and disabled/invalid contexts in popup and manager.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Popup and side panel: `/` focuses search; Escape in search clears it, then leaves the box; ArrowDown from search enters the tree and ArrowUp on the first row returns. In the tree, ArrowUp/ArrowDown/Home/End move between visible folders and bookmarks (bookmarks were previously unreachable by arrows), ArrowRight opens a folder or moves to its first item, ArrowLeft closes it or moves to the parent, and Enter on a folder saves the current page there through the existing duplicate-safe add flow (Space still toggles; folders that cannot hold bookmarks keep Enter's native toggle; Enter on a bookmark opens it natively). The tree handler is passed to the Radix accordion root, so it replaces Radix's trigger-only arrow navigation instead of duplicating it. The search box carries `aria-keyshortcuts="/"` and a tooltip listing the keys.

Manager (`useManagerShortcuts`, one call in `BookmarksPage`): `/` focuses the title filter, `?` opens a localized shortcuts help dialog (also reachable from a header button with `aria-keyshortcuts="?"`), Backspace or Alt+ArrowUp goes to the parent folder and then the root view, and `j`/`k` move focus between table rows (folder rows, or a bookmark row's actions menu); Enter on a folder row still opens it.

A shared guard (`lib/keyboard-shortcuts.ts`) never matches Ctrl or Cmd, so browser-reserved combos always pass through, and ignores keys from text inputs, textareas, selects, contenteditable and textbox/combobox roles, during IME composition (`isComposing` or keyCode 229), after another handler called preventDefault, and while a dialog, alertdialog, menu, or listbox is open. Escape in the popup search is the only key handled while typing. No settings were added.

Tests: 28 unit tests for typing contexts, modifiers, Shift handling, IME, overlays, and action lookup; 8 Chromium E2E tests for popup focus and Escape, tree navigation, Enter saving verified through `chrome.bookmarks` (no duplicate on a second Enter), shortcuts inert in the new-folder input and the delete dialog, Ctrl/Cmd combos ignored, manager filter focus with typed `/?` and Backspace staying text, help dialog pausing other shortcuts, parent navigation to the root, and j/k row focus with Enter opening a folder. The new spec passed 3 consecutive runs. Lint, unit tests, Chrome/Firefox/Edge builds, the full Chromium E2E suite, and the docs build passed. IME behavior is covered by unit tests only, and Firefox/Edge runtime behavior is not E2E tested.
<!-- SECTION:FINAL_SUMMARY:END -->
