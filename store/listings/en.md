# English Listing Copy

Character counts count Unicode characters, as measured on the date each section gives (2026-10-12 unless it says otherwise). Store limits are listed in each section; confirm them in the dashboard during submission.

## Name

```text
Bookmark Scout
```

All three stores read the name from the packaged manifest (`extName` in `apps/extension/public/_locales/en/messages.json`).

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

The Chrome Web Store shows the manifest description as the summary, and Edge uses it as the short description. It is `extDescription` in `apps/extension/public/_locales/en/messages.json`; changing it needs a new version. Ships with 0.3.3 (126 characters):

```text
Save pages to the right folder fast: type part of a folder name or let AI suggest one. Plus bookmark search and cleanup tools.
```

### Firefox Add-ons summary (250 characters maximum, 223 characters)

```text
Save pages to the right bookmark folder fast: type part of any folder's name, press Alt+Shift+S to save to the best match, or let opt-in AI suggest a folder. Plus instant search, a folder tree, and a full bookmarks manager.
```

## Category

| Store | Suggested category | Notes |
| --- | --- | --- |
| Chrome Web Store | Productivity → Tools | Decision for the maintainer. "Workflow & Planning" is the other plausible choice. |
| Firefox Add-ons | Bookmarks | AMO allows a second category; "Tabs" does not fit, so one is enough. |
| Edge Add-ons | Productivity | Decision for the maintainer. |

## Search terms (Edge Add-ons)

Edge allows up to 7 terms (assumed limits: 30 characters per term, 21 words in total).

```text
save to folder
bookmark manager
bookmark search
duplicate bookmarks
dead links
bookmark folders
AI bookmarks
```

## Full description: Chrome Web Store and Edge Add-ons

Plain text, 8,156 characters (2026-10-14); the Chrome Web Store allows 16,000. Name AI providers in general terms, not as a list of brands: the Chrome Web Store rejected 0.3.1 for "excessive keywords" (Yellow Argon) when this paragraph listed nine providers. Before using it for Edge, complete the Edge bookmarks-page check in `../checklists/edge-addons.md`; if the override does not apply in Edge, remove the "Bookmarks manager" and "Maintenance tools" sections and the manager-only AI tools.

```text
Bookmark Scout saves every page to the right folder in seconds, from the toolbar or with one keyboard shortcut, then helps you find and organize your bookmarks without leaving the browser.

SAVE TO THE RIGHT FOLDER IN SECONDS
• Type part of any folder's name, even one nested deep in the tree, and save the current page there without leaving the keyboard
• Type a path such as work/react; a small typo still finds the folder, and folders you used recently come first
• A page already in that folder is not saved twice
• Optional AI suggests the best folder for the page, or a new folder path that you review before it is created
• Optional right-click menu (turn on Context Menu in Settings) to save links into recent folders

QUICK SAVE SHORTCUTS
• Press Alt+Shift+S on any page to save it without opening Bookmark Scout: by default to the folder that best matches the page (ranked on your device), or to the folder you used last or one you choose
• A small notification in the page says where it went, with Undo and other folders to move it to
• With AI turned on, Alt+Shift+D saves the page to the first AI folder suggestion
• Change the keys on the browser's shortcut page. You can also give quick save Ctrl+D (⌘D on a Mac) there, so it replaces the browser's bookmark dialog; Settings shows how

SEARCH FROM THE TOOLBAR
• Instant search across all bookmarks, with match case, whole word, and regular expression options
• Folder tree with drag and drop, expand and collapse all, and new folders
• Side panel with the same tree, search, and folder matches
• Delete with a confirmation dialog (on by default) and a 10-second Undo

BOOKMARKS MANAGER
Bookmark Scout replaces the browser's Bookmarks page with a manager that works like the browser's own, plus breadcrumbs, a sortable and filterable table, resizable columns, and saved searches (smart views that store only your filters and always show current results).
• Right-click menus on bookmarks, folders, and empty space: edit, rename, cut, copy, paste, open in new tabs or windows, show in folder, and delete
• Drag and drop to move bookmarks into folders or reorder them; links dropped from other pages become bookmarks
• Select several rows with Ctrl+click and Shift+click, and use the keyboard shortcuts of the browser's own manager (Cmd on a Mac): Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z to undo, and Ctrl+Shift+Z to redo
• Undo and redo cover edits, moves, sorting, and deletions, including changes made by Ask AI
• The address keeps the search and the folder, so a link can open the manager already searching (?q=react) or in a folder, and Back and Forward restore both
• Choose which commands the right-click and ⋯ menus show, and in what order (Settings > Behavior)

MAINTENANCE TOOLS
• Duplicate Cleaner: review duplicate groups before removing extra copies
• URL Cleaner: preview and remove tracking parameters
• Dead Link Checker: find unreachable links, then review repairs (delete, use the redirect target, point to an archived copy, or edit the URL) with Undo
• Metadata Fetcher: suggest page titles and apply only the ones you select
• Privacy Scanner: find sensitive query parameters, URL fragments, email addresses, and UUIDs in bookmarks
• Statistics: domains, folders, depth, and duplicates
• Refresh Site Icons: fetch each site's own icon, with no third-party icon service
• Import from HTML or JSON with a preview, duplicate handling, and Undo
• Export to HTML, JSON, Markdown, or CSV, with an optional privacy review that can redact sensitive values

WHAT YOUR BROWSER WILL ASK, AND WHY
At install, the browser asks for one thing: "Read and change your bookmarks", so Bookmark Scout can save, search, and organize them. Anything else is asked for only when you use the feature that needs it, after a short explanation. If you say no, only that feature stays off.
• "Read the icons of the websites you visit": when you click Show browser icons on Refresh Site Icons, or turn on Use the browser's icon cache, to show the icons your browser already saved next to your bookmarks
• "Read and change your data on all example.com sites" (or "on a number of websites"): when you run the Dead Link Checker, Metadata Fetcher, or Refresh Site Icons, for only the sites in that run. A run over more than 20 sites, and the Read page content AI setting, ask for "Read and change all your data on all websites". Requests are sent without cookies. Once all websites are allowed, Ask AI can also check whether bookmarked links still work
• "Read your browsing history": only to save the current page or get folder suggestions from the side panel. The toolbar button and the quick save shortcut need no permission, and Bookmark Scout reads only the open tab's title and address
• "Communicate with cooperating native applications": only when you turn on Local AI agents
The right-click menu is optional too, but has no warning, so the browser adds it without asking.

SETTINGS AND BACKUP
• Export at the bottom of Settings saves a backup: the settings you changed, custom prompts, AI services (never their API keys), saved searches, and the manager's columns. Import restores it
• Only the settings you change are saved, so improved defaults in later versions still reach you

OPT-IN AI TOOLS (OFF BY DEFAULT)
Turn on AI in Settings and choose a cloud AI provider, any OpenAI-compatible endpoint, or a model server on your own computer, with your own API key where the provider requires one.
• Folder suggestions for the current page, including reviewed creation of a new folder path
• Tag suggestions and short summaries that you review before saving
• Folder reorganization plans, always previewed before anything changes
• Export selected bookmarks as Markdown or XML context for an AI chat (works without AI and sends nothing)
• Ask AI: chat about your bookmarks. The AI can search them by words, folder, tag, site, or date added, find duplicates, suggest folders, and look at the current page
• Ask AI makes changes only when you ask: it saves pages, and it proposes moves, renames, deletions, and new folders as a plan that changes nothing until you approve it. Every change can be undone
• Answers can end with buttons: a follow-up question, options to pick from, saving the page to a suggested folder, or opening a bookmark. Nothing happens until you click
• Choose what Ask AI may look up or change (Settings > AI)
• Read page content (off by default): send each page's readable text, not only its title and URL, for better suggestions
• Local AI agents (off by default): let AI agents on your computer, such as Claude Code, look up your bookmarks through the separate open-source bookmark-scout-mcp program. With Allow changes also on, they can save and reorganize bookmarks, and every change waits for your approval in a Bookmark Scout window

When you use an AI feature, the data it needs is sent directly from your browser to the provider you chose, under that provider's terms: bookmark titles, URLs, folder names, the dates bookmarks were added, and saved tags and summaries; the current page's title and URL; your Ask AI messages; whether the links Ask AI checks still work; and, only with Read page content on, the text of the pages involved. Nothing is sent to Bookmark Scout. Your API key is kept in this browser's local extension storage and is not synced. Provider usage may cost money.

PRIVACY
• No account, no analytics, no tracking, no ads
• Bookmarks stay in your browser; tags, summaries, and saved searches stay in local extension storage
• The settings you change and your custom prompts sync through your browser account where the browser supports it
• Open source under AGPL-3.0: https://github.com/isandrel/bookmark-scout

UPDATING FROM AN EARLIER VERSION
Version 0.3.3 stores its data in a new format and does not convert older data: settings return to their defaults, AI services and API keys need to be added again, and custom prompts, saved searches, tags, summaries, and saved site icons are cleared. Your bookmarks themselves are not touched.

Available in 9 languages. Light, dark, and system themes.

Documentation: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

AMO descriptions accept limited Markdown; this text is plain. AMO limits the summary to 250 characters and sets no practical limit on the description. 4,803 characters (2026-10-14). It describes the bookmarks manager's editing features, which the Firefox smoke suite covers (right-click menus, cut, copy, and paste, drag and drop, undo, and the folder tree), but not its maintenance tools, Ask AI, or local AI agents, which have not been checked by hand in Firefox, or icons from the browser's cache, which Firefox does not provide (see `../DEVELOPMENT.md`). Firefox has no bookmarks-page override and keeps Ctrl+D for itself, so this text claims neither.

```text
Bookmark Scout saves every page to the right folder in seconds, from the toolbar or with one keyboard shortcut, then helps you find and organize your bookmarks without leaving the browser.

SAVE TO THE RIGHT FOLDER IN SECONDS
• Type part of any folder's name, even one nested deep in the tree, and save the current page there without leaving the keyboard
• Type a path such as work/react; a small typo still finds the folder, and folders you used recently come first
• A page already in that folder is not saved twice
• Optional AI suggests the best folder for the page, or a new folder path that you review before it is created
• Save links from the right-click menu into recent folders

QUICK SAVE SHORTCUTS
• Press Alt+Shift+S on any page to save it without opening Bookmark Scout: by default to the folder that best matches the page (ranked on your device), or to the folder you used last or one you choose
• A small notification in the page says where it went, with Undo and other folders to move it to
• With AI turned on, Alt+Shift+D saves the page to the first AI folder suggestion
• Change the keys in Settings > Saving & Search > Keyboard shortcuts

SEARCH FROM THE TOOLBAR
• Instant search across all bookmarks, with match case, whole word, and regular expression options
• Folder tree with drag and drop, expand and collapse all, and new folders
• The same tree, search, and folder matches in the Firefox sidebar, which stays open while you browse
• Delete with a confirmation dialog (on by default) and a 10-second Undo

BOOKMARKS MANAGER
Open bookmark manager in the toolbar popup or the sidebar opens a full manager in a new tab, with a folder tree and a sortable, filterable table.
• Right-click menus on bookmarks, folders, and empty space: edit, rename, cut, copy, paste, open, show in folder, and delete
• Drag and drop to move bookmarks into folders or reorder them; links dropped from other pages become bookmarks
• Select several rows with Ctrl+click and Shift+click (Cmd on a Mac), copy, cut, and paste with the usual keys, and undo and redo your changes with Ctrl+Z and Ctrl+Shift+Z

SETTINGS AND BACKUP
• Export at the bottom of Settings saves a backup: the settings you changed, custom prompts, AI services (never their API keys), and saved searches. Import restores it
• Only the settings you change are saved, so improved defaults in later versions still reach you

OPT-IN AI FOLDER SUGGESTIONS (OFF BY DEFAULT)
Turn on AI in Settings and choose a cloud AI provider, any OpenAI-compatible endpoint, or a model server on your own computer, with your own API key where the provider requires one. Bookmark Scout then suggests folders for the current page, in the popup or with the AI quick save shortcut, and can create a new folder path after you review it.

When you ask for suggestions, the current page's title and URL and your folder names are sent directly from your browser to the provider you chose, under that provider's terms, and, only if you turn on Read page content, the page's text. Nothing is sent to Bookmark Scout. Your API key is kept in this browser's local extension storage and is not synced. Provider usage may cost money.

WHAT FIREFOX WILL ASK, AND WHY
At install, Firefox asks for one thing: "Read and modify bookmarks". Anything else is asked for only when you use the feature that needs it, after a short explanation. If you say no, only that feature stays off.
• "Access browser tabs": only to save the current page or get folder suggestions from the sidebar. The toolbar button and the quick save shortcut need no permission
• Turning on AI: Firefox asks to share "authentication information, bookmarks, browsing activity" (your API key, your bookmarks and folders, and the current page's title and URL). Its prompt says the developer wants to collect them; here that means the AI provider you chose, which receives them straight from your browser. Nothing reaches Bookmark Scout
• Read page content: "Access your data for all websites", and sharing "website content" with your AI provider
• Verify Service: access to your AI provider's address, and sharing "authentication information" (your API key) with it

PRIVACY
• No account, no analytics, no tracking, no ads
• Bookmarks stay in your browser
• The settings you change and your custom prompts sync through Firefox Sync where enabled
• Open source under AGPL-3.0: https://github.com/isandrel/bookmark-scout

UPDATING FROM AN EARLIER VERSION
Version 0.3.3 stores its data in a new format and does not convert older data: settings return to their defaults, AI services and API keys need to be added again, and custom prompts, saved searches, tags, summaries, and saved site icons are cleared. Your bookmarks themselves are not touched.

Available in 9 languages. Light, dark, and system themes.
```

## What's new in 0.3.3

Paste into AMO's release notes for the 0.3.3 version (shown to users on the version history page). The Chrome Web Store and Edge Add-ons have no public release-notes field; use it there only where the dashboard asks for notes. Plain text, 901 characters (2026-10-12). It names no Chrome- or Edge-only feature, so one text fits every store.

```text
• Quick save: press Alt+Shift+S on any page to save it to the folder that best matches it. A notification in the page says where it went, with Undo and other folders to move it to. With AI on, Alt+Shift+D saves to the first AI suggestion
• Bookmarks manager: right-click menus, drag and drop, cut, copy, and paste, selecting several rows, and undo and redo
• Ask AI can save pages and propose moves, renames, deletions, and new folders that change nothing until you approve them, and every change can be undone. Answers can end with buttons you click
• Choose which commands the manager's menus show, and what Ask AI may do
• Export in Settings now saves a backup you can import
• This update resets Bookmark Scout's saved data: settings return to their defaults, and AI services and API keys, custom prompts, saved searches, tags, and summaries need to be set up again. Your bookmarks are not touched
```

## Chrome Web Store single purpose

See [`../permissions.md`](../permissions.md#chrome-web-store-single-purpose).

## Support and links

| Field | Value | Status |
| --- | --- | --- |
| Website | https://bookmark-scout.com | Live |
| Documentation | https://docs.bookmark-scout.com | Live |
| Support URL | https://bookmark-scout.com/support/ | Live once the website deploys from `main`. Links to the docs, FAQ, GitHub issues, and the support, privacy, and security addresses. |
| Support email | support@bookmark-scout.com | The maintainer must confirm the alias forwards to a monitored inbox. `security@bookmark-scout.com` is for vulnerability reports only. |
| Privacy policy URL | https://bookmark-scout.com/privacy/ | Live once the website deploys from `main`. Translations at `/<locale>/privacy/` for every other website language; the old `/en/privacy/` redirects here. Text: `../privacy-policy.md` |
| License (AMO) | GNU Affero General Public License v3.0 | Matches `LICENSE` |
