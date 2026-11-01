---
name: organize-folder
description: Sort the bookmarks in one folder into a few topic subfolders, as one plan the user reviews. Use when the user asks to organize, tidy, sort, group, or restructure a folder.
allowed-tools: listFolders searchBookmarks getBookmarks suggestFolders proposeChanges applyChanges
---

# Organize a folder

1. Find the folder with `listFolders`. If the name matches more than one folder, ask which one.
2. Read what is in it with `searchBookmarks` or `getBookmarks`, page by page until you have seen every bookmark.
3. Group the bookmarks by topic. Prefer folders that already exist (check with `listFolders` and `suggestFolders`) over new ones. Keep the number of new folders small, and leave a bookmark where it is when no group fits it.
4. Put every move and every new folder in one `proposeChanges` plan. Never move bookmarks one call at a time.
5. Before the plan, say in a few lines which groups you made and how many bookmarks go in each. The user reviews the plan and decides; apply it only after they approve.
6. If the folder is large, offer to work through it in parts instead of one very large plan.
