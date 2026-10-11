# English Listing Copy

Character counts count Unicode characters, as measured on the date each section gives (2026-10-10 unless it says otherwise). Store limits are listed in each section; confirm them in the dashboard during submission.

## Name

```text
Bookmark Scout
```

All three stores read the name from the packaged manifest (`extName` in `apps/extension/public/_locales/en/messages.json`).

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

The Chrome Web Store shows the manifest description as the summary, and Edge uses it as the short description. It is `extDescription` in `apps/extension/public/_locales/en/messages.json`; changing it needs a new version. Ships with the next version after 0.3.2 (126 characters):

```text
Save pages to the right folder fast: type part of a folder name or let AI suggest one. Plus bookmark search and cleanup tools.
```

### Firefox Add-ons summary (250 characters maximum, 231 characters)

```text
Save pages to the right bookmark folder fast: type part of a folder's name, even one deep in the tree, and save from the keyboard, or let opt-in AI suggest a folder. Plus instant search and a folder tree in the toolbar and sidebar.
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

Plain text, 4,105 characters (2026-10-10). Name AI providers in general terms, not as a list of brands: the Chrome Web Store rejected 0.3.1 for "excessive keywords" (Yellow Argon) when this paragraph listed nine providers. Before using it for Edge, complete the Edge bookmarks-page check in `../checklists/edge-addons.md`; if the override does not apply in Edge, remove the "Bookmarks manager" and "Maintenance tools" sections and the manager-only AI tools.

```text
Bookmark Scout saves every page to the right folder in seconds, then helps you find and tidy your bookmarks without leaving the browser.

SAVE TO THE RIGHT FOLDER IN SECONDS
• Type part of any folder's name, even one nested deep in the tree, and save the current page there without leaving the keyboard
• Type a path such as work/react; a small typo still finds the folder, and folders you used recently come first
• A page already in that folder is not saved twice
• Optional AI suggests the best folder for the page, or a new folder path that you review before it is created
• Optional right-click menu (turn on Context Menu in Settings) to save links into recent folders

SEARCH FROM THE TOOLBAR
• Instant search across all bookmarks, with match case, whole word, and regular expression options
• Folder tree with drag and drop, expand and collapse all, and new folders
• Side panel with the same tree, search, and folder matches
• Keyboard shortcuts that never take over browser Ctrl/Cmd shortcuts
• Delete with a confirmation dialog (on by default) and a 10-second Undo

BOOKMARKS MANAGER
Bookmark Scout replaces the browser's Bookmarks page with a manager that has a folder tree, breadcrumbs, a sortable and filterable table, resizable columns, and saved searches (smart views that store only your filters and always show current results).

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

The Dead Link Checker, Metadata Fetcher, Refresh Site Icons, and the Read page content AI setting ask for optional website access the first time you use them. It is never granted at install, requests are sent without cookies, and declining it simply turns that feature off.

OPT-IN AI TOOLS (OFF BY DEFAULT)
Turn on AI in Settings and choose a cloud AI provider, any OpenAI-compatible endpoint, or a model server on your own computer, with your own API key where the provider requires one.
• Folder suggestions for the current page, including reviewed creation of a new folder path
• Tag suggestions and short summaries that you review before saving
• Folder reorganization plans, previewed before anything changes (default)
• Export selected bookmarks as Markdown or XML context for an AI chat (works without AI and sends nothing)
• Ask AI: chat about your bookmarks; the AI can look up matching bookmarks, your folder names, and the current page
• Read page content (off by default): send each page's readable text, not only its title and URL, for better suggestions
• Local AI agents (off by default): let AI agents on your computer, such as Claude Code, look up your bookmarks through the separate open-source bookmark-scout-mcp program; every change they ask for waits for your approval

When you use an AI feature, the data it needs is sent directly from your browser to the provider you chose, under that provider's terms: bookmark titles, URLs, folder names, and saved tags and summaries; the current page's title and URL; your Ask AI messages; and, only with Read page content on, the text of the pages involved. Nothing is sent to Bookmark Scout. Your API key is kept in this browser's local extension storage and is not synced. Provider usage may cost money.

PRIVACY
• No account, no analytics, no tracking, no ads
• Bookmarks stay in your browser; tags, summaries, and saved searches stay in local extension storage
• Settings sync through your browser account where the browser supports it
• Open source under AGPL-3.0: https://github.com/isandrel/bookmark-scout

Available in 9 languages. Light, dark, and system themes.

Documentation: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

AMO descriptions accept limited Markdown; this text is plain. 2,075 characters (2026-10-10). It does not describe the tools inside the bookmarks manager, which opens from the popup's Open bookmark manager button but has not been checked by hand in Firefox, or icons from the browser's cache, which Firefox does not provide (see `../README.md`).

```text
Bookmark Scout saves every page to the right folder in seconds, then helps you find your bookmarks without leaving the browser.

SAVE TO THE RIGHT FOLDER IN SECONDS
• Type part of any folder's name, even one nested deep in the tree, and save the current page there without leaving the keyboard
• Type a path such as work/react; a small typo still finds the folder, and folders you used recently come first
• A page already in that folder is not saved twice
• Optional AI suggests the best folder for the page, or a new folder path that you review before it is created
• Save links from the right-click menu into recent folders

SEARCH FROM THE TOOLBAR
• Instant search across all bookmarks, with match case, whole word, and regular expression options
• Folder tree with drag and drop, expand and collapse all, and new folders
• The same tree, search, and folder matches in the Firefox sidebar, which stays open while you browse
• Keyboard shortcuts that never take over browser Ctrl/Cmd shortcuts
• Delete with a confirmation dialog (on by default) and a 10-second Undo

OPT-IN AI FOLDER SUGGESTIONS (OFF BY DEFAULT)
Turn on AI in Settings and choose a cloud AI provider, any OpenAI-compatible endpoint, or a model server on your own computer, with your own API key where the provider requires one. Bookmark Scout then suggests folders for the current page and can create a new folder path after you review it.

When you ask for suggestions, the current page's title and URL and your folder names are sent directly from your browser to the provider you chose, under that provider's terms. Nothing is sent to Bookmark Scout. Your API key is kept in this browser's local extension storage and is not synced. Provider usage may cost money.

PRIVACY
• No account, no analytics, no tracking, no ads
• Bookmarks stay in your browser
• Settings sync through Firefox Sync where enabled
• Open source under AGPL-3.0: https://github.com/isandrel/bookmark-scout

Available in 9 languages. Light, dark, and system themes.

The bookmarks manager opens in a new tab from the toolbar popup.
```

## Chrome Web Store single purpose

See [`../permissions.md`](../permissions.md#chrome-web-store-single-purpose).

## Support and links

| Field | Value | Status |
| --- | --- | --- |
| Website | https://bookmark-scout.com | Live |
| Documentation | https://docs.bookmark-scout.com | Live |
| Support URL | https://bookmark-scout.com/en/support/ | Live once the website deploys from `main`. Links to the docs, FAQ, GitHub issues, and the support, privacy, and security addresses. |
| Support email | support@bookmark-scout.com | The maintainer must confirm the alias forwards to a monitored inbox. `security@bookmark-scout.com` is for vulnerability reports only. |
| Privacy policy URL | https://bookmark-scout.com/en/privacy/ | Live once the website deploys from `main`. Translations at `/<locale>/privacy/` for every website language. Text: `../privacy-policy.md` |
| License (AMO) | GNU Affero General Public License v3.0 | Matches `LICENSE` |
