---
id: TASK-31
title: Automate context-menu and drag-and-drop browser flows
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-09-30 12:00'
labels: []
dependencies: []
references:
  - apps/extension/tests/e2e
  - apps/extension/src/services/context-menu.ts
  - apps/extension/src/components/bookmark/FolderItem.tsx
  - apps/extension/tests/e2e/additional-workflows.spec.ts
  - apps/extension/tests/e2e/context-menu-save.spec.ts
  - apps/extension/tests/e2e/tree-drag-drop.spec.ts
priority: medium
type: task
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Coverage gap: current E2E tests exercise popup and manager controls but not right-click context-menu save or drag-and-drop moves in a disposable extension profile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tests verify created bookmark destination and title for context-menu flows.
- [x] #2 Tests verify folder/bookmark drag-drop ordering and move results using synthetic bookmarks only.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-30: Added Chromium E2E coverage; no product bug found.

- `context-menu-save.spec.ts`: Playwright cannot open the native menu, so tests call `chrome.contextMenus.onClicked.dispatch(info, tab)` in the service worker, which runs the real background listener and `contextMenuManager.handleClick`. A test-only spy on `contextMenus.create`/`removeAll` records the built menu (Chrome has no API to list items); `contextMenus.update(id, {})` confirms each item is really registered. Covers the Bookmarks Bar default item and recent-folder items saving into the exact folder with the exact title, URL, and index; recent-folder reordering after a save; link text (Firefox `linkText`, Chrome selection, page-title fallback), page title, and link URL naming; page, selection-only, and foreign-id clicks saving nothing; disabling the menu removing it and ignoring stale clicks; and menu rebuilds on folder rename, ancestor deletion, `recentFoldersMax`, and `recentFoldersEnabled`.
- `tree-drag-drop.spec.ts`: real pointer drags (`page.mouse` down, stepped moves, up) in both the popup and the side panel, verified with `chrome.bookmarks`: bookmark into folder, folder into folder with contents intact, bookmark reorder before and after (up, down, to index 0), folder reorder via top and bottom edge zones, and folder drops into a nested descendant or beside a bookmark inside it leaving the whole subtree unchanged.
- The manager table has no drag-to-move (only column resizing), so manager DnD is not applicable.
- The earlier note about drags not registering no longer applies: pragmatic-drag-and-drop v4 drops are delivered by Playwright's Chromium drag interception.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-23 17:12
---
2026-09-23: Attempted popup drag-and-drop in the disposable Chromium profile with Playwright dragTo and pointer movement. No drop indicator or move handler was observed; bookmark order remained unchanged. Harness versus product cause is unresolved, so no failing drag test was added to CI. Context-menu behavior remains untested.
---
<!-- COMMENTS:END -->
