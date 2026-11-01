---
name: clean-up-library
description: Find duplicate bookmarks, broken links, and empty folders, and offer one plan to clean them up. Use when the user asks to clean up, declutter, remove duplicates, or fix dead or broken links.
allowed-tools: findDuplicates checkLinks listFolders getBookmarks proposeChanges applyChanges
---

# Clean up the library

1. Ask which folder to clean up when the user did not say, or use the whole library if they want that.
2. Find duplicates with `findDuplicates`. In each group, keep the copy in the most specific folder, or the one with the better title, and plan to delete the others.
3. Check links with `checkLinks`, a folder or a batch of refs at a time, and call it again while some are left unchecked. Treat a link as broken only when its `problem` is `notFound`, `unreachable`, or `redirectLoop`; list every other failure (a timeout, a login page, a server error) separately and do not plan to delete it, since it may work later.
4. Find empty folders with `listFolders` and its counts.
5. Put every deletion in one `proposeChanges` plan, and say before it how many duplicates, broken links, and empty folders it removes. Apply it only after the user approves, and remind them that the change can be undone.
