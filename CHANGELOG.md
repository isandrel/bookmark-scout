# bookmark-scout

## 0.3.5

### Features

- **Covers and cards:** the bookmark manager can show a folder or search as **Cards** (the List and Cards switch beside **View**), each with the page's cover picture, its tags and summary, and, for a folder, how many items it holds. Bookmarks without a cover show a tile with the site's icon. Covers can also show in the list as an optional **Cover** column, larger while you point at it.
- Where covers come from, all kept only on this device: **Fetch Covers** (Tools sidebar, off until you turn it on in Settings > **Page Details**) reads the preview image each page names for itself; **Use this view as the cover** in the popup takes a picture of the tab you are looking at and shows it to you before it is kept; **Capture Covers While Browsing** (off by default) takes a picture of a bookmarked page when you open it; and **Save a Cover With Quick Save** (off by default) keeps one with each quick save, with **Remove cover** in its notification. **Cover Source** chooses between the page's own image and a screenshot. **Fetch cover** and **Remove cover** are in each bookmark's right-click and ⋯ menus. A cover you picked yourself is never replaced, and a bookmark's cover is deleted with it.
- **Index Page Text** (Tools sidebar, off until you turn it on in Settings > **Page Details**): downloads the bookmarked pages you choose, keeps their readable text on this device after a review, and lets every search box find words inside them. `content:` searches only page text and `has:content` lists indexed bookmarks. You pick the sites a run reads; sign-in pages, and by default addresses with a password or secret in them, are skipped; **Never Read These Sites** keeps sites out; **Retry failed** and **Refresh outdated** keep the index current; and **Index this page's text** in the popup reads the page you are looking at. Ask AI and local AI agents never search page text.
- **One search everywhere:** the popup, side panel, and manager search the same way. Every word must match somewhere in the title, address, folder path, tags, or summary, and operators narrow it: `title:`, `url:`, `domain:`, `folder:`, `tag:`, `summary:`, `is:`, `has:`, `after:`, `before:`, `-word` to leave out, `OR`, and parentheses. A result found by something other than its title says where it matched. The manager's search box has a **Search syntax** button, its other filters moved into one **Filters** menu with a chip for each filter in use, and Ask AI and local AI agents search with the same operators. Saved searches from 0.3.4 still find what they found.
- **Smart Rules** (Settings > Maintenance > Smart Rules): a rule names the bookmarks it is for with a search, then the tags to add and the folder to move them to. Run your rules from the Tools sidebar on a folder, search results, or selected bookmarks, and review every change before it is made; large runs continue in the background. **Tag New Bookmarks** and **Move New Bookmarks** (both off by default) apply rules to bookmarks as they are added, and **Changed by rules** lists what they did, with Undo. Four templates help you start, and a rule added from one starts turned off.
- **Bookmark history** (the History button at the top of the manager): a record, kept on this device, of every change Bookmark Scout makes to your bookmarks, with each item before and after and whether it read back as intended, plus Undo and Redo while the session allows them. **Restore** brings deleted items back even after Undo is gone. Changes made outside Bookmark Scout (the browser's own manager, another extension, or sync) are listed too, as from an unknown source; **Record Changes Made Elsewhere** turns that off. Quick saves, right-click saves, imports, AI folder saves, and deletions in the popup now each have a record and an undo step. A change that removes bookmarks does not start if its record cannot be saved.
- **Background tasks:** Check Dead Links, Metadata Fetcher, Refresh Site Icons, Index Page Text, and AI Folder Reorganization keep going after you close the manager, with Pause, Resume, and Cancel on their card and under **Background tasks**, and a progress line in the popup. Large reviewed changes (above **Apply in the Background Above**) are applied the same way, in parts, each listed in the History. A task never sends an AI request twice on its own: if it stopped during one, it waits for you to resume it. A task pauses when you take back its website access, and Resume asks for it again.
- **Reviewing tool results:** every tool's review now has tabs by category with counts, a checkbox for each item, **Set selected to…** for many items at once, and a default action for each category. Check Dead Links has a default repair for each kind of result (Settings > Maintenance, **Keep as is** until you change it) and a **Fix or remove links** review; Duplicate Cleaner lets you choose which copy to keep in each group and which copies to remove; and the Privacy Scanner can now delete what it finds. Check Dead Links asks a briefly busy site again after the short wait the site asks for, instead of listing it under **Check manually**.
- URL Cleaner's **Remove Parameters** now removes every `utm_` parameter by default: a name ending in `*` matches every name that starts with it.
- **Bookmark preview:** **Preview** in a card's or row's menu, or its key, shows the cover, address, folder, tags, and summary without opening the page, and steps through the page's bookmarks with **Previous bookmark** and **Next bookmark**. In the popup and side panel, resting on a bookmark shows its details in a card (**Show details on hover**). The manager list has optional **Tags** and **Summary** columns.
- **Arrange it your way**, with every default as before: every manager menu and the popup's bookmark and folder menus (hide, reorder, and group commands; the popup rows also have a ⋯ menu and a right-click menu); the popup's parts, toolbar buttons, row spacing, and which folders are open when it opens; the manager's default columns, sort, rows per page, start folder, card size and details, and resizable sidebars; the Tools sidebar's tools, order, and start tab, now shown one section at a time (**Tools Sidebar Layout** brings back **One list**); where notifications appear (**Toast Position**); and how dates and times show (**Dates and Times**).
- **Manager and popup shortcuts** (Settings > Behavior): change the keys of the manager's, popup's, and side panel's shortcuts with a key recorder that refuses keys the browser keeps or another shortcut already uses, and reset them one at a time or with **Reset all shortcuts**. The quick save keys still change on the browser's shortcut page (in Firefox, in Settings).
- The right-click menu can also save the page you are on, from anywhere on the page or from selected text (**Show Menu On**), and has its own recent folder count and entries.
- **Back up settings** saves the parts you choose: settings, this computer's settings, saved searches and table view, prompts and About me, Smart Rules, AI services, AI service keys, and covers. **Restore settings** first shows what each part would add, change, or remove, then restores with **Merge** or **Replace** and lets you settle conflicts. **Undo import**, in the result, in Settings, and in History, puts back what a restore changed for 24 hours. Backups made by 0.3.4 still restore.
- **Requires an API Key** (in each AI service's settings): turn it off for a service that needs no key, such as a gateway that adds the key for you or a company endpoint; its requests then carry no key at all. When a service answers that it needs a key, Bookmark Scout says so and offers **Open service settings**.
- Tags in Bookmark Details and Smart Rules are chips: Enter or a comma adds one, including the commas Japanese, Chinese, and Korean keyboards type.
- Links show a small icon for where a click opens them: a new tab, a background tab, or this tab. **Show Where Links Open** hides it.
- Addresses no longer show the `/` they end with; **Show Trailing Slash** brings it back.
- Drag and drop: reorder the manager's columns (also by their headers), saved searches, AI services, and the commands in each menu in Settings, each also with a keyboard menu on its grip. Drop a bookmarks file on **Import Bookmarks**, a backup file on Settings, or a link from a web page on a folder in the side panel. **Drag and Drop in the Tree** turns dragging off in the popup and side panel. When the default AI service cannot run a tool, the first one in the list that can is used, so the order of AI services now matters.
- Seven fixed values became settings: **Ask Before Opening More Than**, **Recent Searches Kept**, **Other Folders Offered** and **Notification Duration** for quick save, **Skip Local Network Pages**, **Most Steps per Answer** for Ask AI, and **Tooltip Delay**. Technical settings explain more in an info button beside their name.
- Firefox separators show as separators in the manager and popup, and stay separators through Duplicate Cleaner, copy and paste, export, and import.
- New languages: Russian, Indonesian, and Italian, in the extension, website, docs, and README, for 12 languages in all. These translations are machine-made and checked, not yet reviewed by native speakers.
- The **Page Titles & Icons** tab in Settings and section in the Tools sidebar is now called **Page Details**.

### Permissions and privacy

- New optional permission, access to all websites (`<all_urls>`), asked for only when you turn on **Capture Covers While Browsing** (off by default), which needs it to take a picture of a tab without a click. It pictures only bookmarked pages in the active tab, never in private windows unless you also turn on **Also Capture in Private Windows**, never sites you list under **Never Capture These Sites**, and the pictures stay on this device. Since that access is granted per browser, this setting, **Also Capture in Private Windows**, and **Save a Cover With Quick Save** stay on this device and do not sync. While it is allowed, the website tools no longer ask for each run.
- New required permission, `alarms`, which shows no prompt: it lets a background task pick up again after the browser stops the extension's background.
- Index Page Text and Fetch Covers ask for website access only for the sites in their run, like the other website tools, and request pages only from the bookmarked sites, without cookies. Cover images come only from the page's own site or a site you allowed, and a redirect is never followed to a site that was not checked first. Nothing new is sent to your AI service.
- New data kept only on this device, never synced: the Bookmark history (with copies of deleted items for **Restore**), background tasks and their results, page text, covers, Smart Rules and what they changed, and the safety copy behind **Undo import**. Page text and covers are deleted with their bookmark, and page text also when you take back a site's access or add the site to **Never Read These Sites**. Covers leave the device only in a backup file, when you choose that part.
- A backup file holds API keys only when you select **AI service keys**, and then they are encrypted with a password you choose, which is never stored and cannot be recovered. A whole backup file can be protected with a password too.
- **Skip Local Network Pages** (on by default) now also applies when AI quick save or a local AI agent reads a page, and to Index Page Text, Fetch Covers, and the cover quick save downloads.
- The privacy policy (effective 2026-10-23), docs, and store disclosures say all of this in every language.

### Fixes

- Undo and redo never erase newer changes inside a folder or a newer reorder, and a redo pressed quickly during an undo is no longer lost.
- Duplicate Cleaner checks the copy it keeps again before removing each extra one.
- Copied folders keep their tags, summaries, and Firefox separators, and undoing an import keeps the imported bookmarks you edited, moved, or tagged since.
- A restore that could not bring back tags and summaries says so instead of reporting success, and a deletion's Undo, clicked after the manager's undo key already undid it, says so.
- Reading pages (Metadata Fetcher, Read page content, links dropped from a page) no longer fills the browser's extension error list with Content Security Policy errors.
- The manager table opens with its columns already in place, and switching tabs in Settings no longer shows two tabs at once for a moment.
- Russian and Greek titles no longer look spaced out letter by letter.
- With pattern search on, a pattern that could freeze the popup is searched as plain text, with a warning.
- A bookmark menu you arranged in the manager in 0.3.4 shows the new **Preview**, **Fetch cover**, and **Remove cover** commands and keeps the commands you hid hidden, and the browser's right-click menu keeps showing as many recent folders as you chose for the popup in 0.3.4.
- A setting that cannot be saved says so instead of failing silently.
- Plural forms are corrected in History and Settings in several languages, and Japanese and Indonesian use the same words for filters and covers everywhere.

### Performance

- The manager prepares its search while it is idle, so the first search and each further letter stay quick in large libraries.
- Tool reviews draw only the rows on screen, so long results stay fast, and background tasks save their results in batches.

### Website and documentation

- Keyboard shortcuts show the Mac keys first, then the Windows and Linux keys in parentheses, on the website, in the docs, in the README, and in the store listings, and the website shows them as key caps.
- The store screenshots, website, docs, README, and store listings use a tech and AI example, as in the new promo video.
- The README and CONTRIBUTING are in every language, and languages are listed in one order everywhere, most speakers first.
- The docs take every setting's default from the extension's own settings, and cover the new features: covers, searching inside pages, the search operators, Smart Rules, the Bookmark history, background tasks, and backup parts.

## 0.3.4

### Features

- Free AI on this computer in Chrome: **Built-in AI** uses Chrome's own model (Gemini Nano), which runs on your computer with no account, no API key, and no cost, and sends nothing anywhere. It suggests folders in the popup and side panel and picks the folder for the AI quick save shortcut. Settings > AI offers it under **Free on this computer** (**Use built-in AI**) where Chrome can run it, and its service shows the model's state with **Download the model**. The popup and quick save never start the download; until the model is ready, quick save uses the best match. The other AI tools keep using your other AI service. It can be added only once.
- **Check this computer** under Built-in AI shows your Chrome version, operating system, memory, and processor cores against what the model needs, and names what a browser cannot see (free disk space and graphics memory). When Chrome says the model cannot run but nothing rules the computer out, it explains the Chrome flag to change and opens it, with **Check again**.
- **AI output language** (Settings > AI): tags, summaries, reasons, and new folder names come back in the extension's language by default, in a language you pick, or, with **Same as each page**, in each page's own language as before. Ask AI answers in the language you write in.
- **About me** (Settings > AI): a few words about you, up to 1,000 characters, that every built-in AI prompt includes so results fit you better. It is empty by default, syncs through your browser account, and is part of the settings backup.
- Auto-Tagging reuses your tags: it sends the names of your most used tags (up to 200) so the AI picks the ones you already have, and saves a suggested tag in the spelling you already use. Turn this off with **Send Existing Tags** (AI Tools > Auto-Tagging).
- The prompt editor lists placeholders: type `{{` to pick one, with what it is and its value now. New placeholders `{{today}}`, `{{language}}`, and `{{aboutMe}}` work in every tool, and `{{existingTags}}` in Auto-Tagging. A placeholder the tool does not fill in is flagged, with a suggestion for a likely typo; the preview shows the rules Bookmark Scout adds after your prompt; **Reset to built-in prompt** starts over; and `\{{` writes literal braces.
- A welcome page, **Bookmark Scout is ready**, opens once after a new install (never after an update) with three steps: pin the icon, save a page by typing a folder name, and the keys your quick save shortcut got, or **Set it up** when another extension took them. In Chrome and Edge it also offers to use the browser's bookmark key (Ctrl+D, ⌘D on a Mac) for quick save.
- Settings open on a new **Essentials** tab with the few settings most people change (quick save folder, right-click menu, theme, language, confirm before delete) and a note that AI is optional. The other tabs are listed under **Advanced**. Local AI agents moved to a new last tab, **For developers**, with the same settings.
- AI setup for newcomers: an **AI is optional** box at the top of Settings > AI says what AI does, what it needs, what it may cost, and what is sent; featured AI services have a **Get an API key** link; and the Add service list shows the well-known providers first, with about 200 more once you search. The popup's AI buttons appear only once AI is set up; until then, a line says **AI is on but not set up yet** with **Finish AI setup**, and the AI tools in the manager stay disabled.
- Pressing Enter in the popup or side panel search box now saves the current page to the first folder listed under **Save to folder**, which is highlighted; ↓ picks another. A line under the search box names the page to save, and another says **Already saved in** when the page is already bookmarked.
- The bookmark manager starts simpler: it opens on the Bookmarks Bar, shows the Title, URL, and Date Added columns, 50 rows per page (100 is offered), and one search box that matches titles and addresses, with the URL and folder filters under **More filters**. While a search lists bookmarks from every folder, each shows its folder. Everything else is still under **View**. Saved table views keep their own columns.
- New sort order **Browser Order**, the order you see on the bookmarks bar, is the default in the popup, side panel, and manager. **Date Added**, **Alphabetical**, and **Folders First** are still in Settings > Behavior. These new defaults (sort order, manager columns, rows per page) also reach you after the update if you never changed them; anything you changed stays as it is.
- Tools in the manager start on **All Bookmarks** (AI Folder Reorganization still starts on the open folder), and the Tools sidebar lists cleanup tools first and AI tools last.
- Ask AI's suggestion buttons now sit right above the message box, only for the latest answer once it is complete, and step aside while you type. They no longer fail with some AI services.
- Every AI service has an icon in Settings, with a generic one for programs on your computer and custom endpoints.
- Changes made by Duplicate Cleaner, URL Cleaner, dead link repairs, Metadata Fetcher, and AI Folder Reorganization are each one step in the manager's undo history, so Ctrl+Z (⌘Z on a Mac) undoes them too.
- Plainer words: **Context Menu** is now **Right-Click Menu**, **Metadata & Content** is **Page Titles & Icons**, the settings page is called **Settings** everywhere, and the buttons at the bottom of Settings are **Back up settings** and **Restore settings** (they never held bookmarks), next to a new **Export Bookmarks**. Match case, whole word, and pattern search moved into one **More search options** menu.
- While AI Features is off, the AI settings are greyed out under a note saying nothing there runs until you turn AI on. They can still be changed.

### Permissions and privacy

- Two new things can be sent to your AI provider: the names of your most used tags, for Auto-Tagging (on by default; **Send Existing Tags** turns it off), and your **About me** text, with every AI request while it has text (empty by default). The privacy policy (effective 2026-10-18), docs, and store disclosures say so in every language.
- Chrome's built-in AI keeps everything on your computer; the privacy policy says so.
- Milder permission prompts: **Show browser icons** on Refresh Site Icons asks only to read the icons of the websites you visit, instead of access to all websites. Check Dead Links, Metadata Fetcher, and Refresh Site Icons ask for only the sites of the bookmarks in that run (all websites above 20 sites). A redirect to a site outside that permission is listed under **Check manually**. Before asking to read your browsing history, the side panel shows the ways to save that need no permission.
- In Firefox, turning on AI asks to share less: page text is asked for only when you turn on **Read page content**.
- The Privacy Scanner no longer flags plain page anchors such as Gmail's `#inbox`, only ones that hold a key or token.

### Fixes

- The popup and side panel open in their final layout, without parts jumping in after the first frame.
- Switching between light and dark no longer flashes back to the old theme for a moment.
- Switching tabs in Settings no longer shifts the page sideways, and **Refresh Models** and **Verify Service** keep their result and buttons in place while a check runs.
- Bookmark manager rows are 32px high like the folder tree, Title and URL share the table's width, and the move buttons no longer cover the Date Added column.
- Typing in the manager's Type, Domain, and Folder filters matches any part of a name, ignoring case and accents.
- Clearer tool results: Metadata Fetcher says when a bookmark keeps its title, dead link results describe redirects they could not follow, repairs name bookmarks deleted after the scan, long folder paths shorten in the middle, and tool cards wrap in German and French.
- Quick save offers the next best matching folders under **Move to**, and an undone quick save no longer shows in later popups.
- AI activity marks on-device calls **On device** and local agents' actions **Action**; AI service rows show the model's name; Korean text breaks between words; and Japanese uses one spelling for "folder".
- In the prompt editor, a key typed right after picking a placeholder now lands after it.

### Performance

- The extension download is smaller than 0.3.3's despite the new features: language files are packed tighter, and two libraries were replaced with smaller code.

### Website and documentation

- The website shows English at its plain addresses (`/`, `/privacy/`, `/support/`) and suggests your language in a bar at the bottom instead of redirecting; old `/en/...` addresses redirect.
- The website, docs, README, and store listings lead with the Chrome Web Store install and plain words for people new to extensions, with new screenshots. The docs have a new **Your first save** page.
- Every keyboard shortcut in the docs, website, and README is now taken from the extension's own settings, and the docs show the keys for your computer.

## 0.3.3

### Features

- Quick save shortcuts: press Alt+Shift+S on any page to save it without opening Bookmark Scout, to the folder that best matches it (ranked on your device from folder names and the bookmarks in them), the last used folder, or a folder you choose (Settings > Saving & Search > Quick Save Shortcuts). Alt+Shift+D saves it to the first AI suggestion instead. A notification in the page says where it went, with Undo and other folders to move it to; a page already bookmarked is not saved twice. On pages extensions cannot draw on, the toolbar badge shows the result and the popup offers Undo. Rebind the keys in the browser's shortcut settings.
- Setting up the quick save shortcuts: in Firefox, Settings > Saving & Search > Keyboard shortcuts records new keys when you press them, explains combinations Firefox cannot use, and resets them to the default. In Chrome and Edge, **Change shortcuts** opens the browser's shortcut page, with a note to find Bookmark Scout there. When the browser left a quick save shortcut without keys (another extension already had them), the popup and side panel show **Quick save shortcut not set** with **Set it up**, until you set it or dismiss the line.
- Ctrl+D (⌘D on a Mac) for quick save: no browser lets an extension take its bookmark key as a default, so quick save stays on Alt+Shift+S. In Chrome and Edge, Settings > Saving & Search > Keyboard shortcuts explains how to give quick save Ctrl+D on the browser's shortcut page, where it then replaces the browser's bookmark dialog, and the popup and side panel offer it in a line you can dismiss. Firefox always keeps Ctrl+D and Ctrl+Shift+D for itself, so its shortcut fields now refuse them instead of saving keys that would never work.
- Settings that were typed as comma-separated text have proper editors: query parameter lists are chips you add with Enter or pick from suggestions, and **Success Status Codes** is a checklist of common HTTP codes with a box for any other code. Timeouts and notification duration are set in seconds, the icon cache in MB, and reorganization confidence shows as a percentage. A minimum (tags per bookmark, bookmarks per folder) can no longer be set above its maximum, and settings with only one possible value (the fixed scopes of Auto-Tagging, Content Summarizer, Duplicate Cleaner, and Privacy Scanner) are no longer shown.
- Settings take less space: each tool's on/off switch sits beside its heading and folds the tool's settings while it is off; technical settings (timeouts, concurrency, retries, status codes, batch size, file names, indentation, icon sizes) sit under a closed **Advanced settings** that a search opens; popup width and height, tags per bookmark, and bookmarks per folder share one row each; and **Show Favicons** and **Recent Folders** each lead one row with the settings they control.
- Settings are regrouped so each page has titled sections: **Saving & Search** comes first (folder matches, search, recent folders, right-click menu), **Appearance** takes the popup size and notification settings that were under **Advanced**, AI Folder Reorganization limits move to **AI Tools**, and every tool on the Maintenance, Metadata & Content, Security, Analytics, and AI Tools pages has its own heading. **Data** is now **Import & Export**. No setting or default changed.
- Save to a folder by typing its name. While you search in the popup or side panel, **Save to folder** lists the matching folders above the results with where they are, best first; press Down and then Enter, or click one, to save the current page there. Several words also match parent folders ("react hooks", "frontend/react"), a longer word may have one typo, and folders you saved to recently rank higher. Settings > Search can turn the list off, change how many folders it shows, and turn off typo matching.
- Pressing Down right after typing in the search box now moves to the new results instead of the previous ones.
- The popup footer says **Save here** while a folder is selected, since Enter saves the page there.
- The bookmark manager's address follows the title search as well as the folder, as Chrome's own manager does: `chrome://bookmarks/?q=react` opens it searching for "react", typing in **Filter titles...** updates the address with one **Back** step per burst of typing, and **Back** and **Forward** restore both the search and the folder. Links that name the Bookmarks bar, Other bookmarks, or Mobile bookmarks by the long IDs Chrome 154 to 156 used open those folders. **Copy link to this folder** (in the header and in a folder row's menu) copies `chrome://bookmarks/?id=…` (`edge://favorites/?id=…` in Edge, the manager page's own address in Firefox), the tab title names the open folder or the search, and a search result's menu has **Show in folder**, which opens its folder with it selected.
- The bookmark manager selects and opens rows like Chrome's: a click selects a row, `Ctrl`+click (`Cmd`+click on a Mac) adds or removes one, `Shift`+click selects a range, and `Ctrl+A` selects every row the filters show, on every page; `Esc` clears the selection. A double click opens a folder, or a bookmark in a tab, and middle-click opens a bookmark in a background tab (a single click on a folder row no longer opens it). The arrow keys, `Home`, and `End` move between rows (`Shift` extends the selection) and `Space` selects; the table is one `Tab` stop. `Enter` (`Cmd+O` on a Mac) opens the selection, `Ctrl+Enter` in background tabs, `Shift+Enter` in a new window, asking first for more than 15 tabs; `F2` (`Enter` on a Mac) edits, and `Delete` deletes.
- Undo and redo in the bookmark manager: `Ctrl+Z` (`Cmd+Z`) undoes edits, moves, reorders, and deletions made there, newest first, and `Ctrl+Y` or `Ctrl+Shift+Z` (`Cmd+Shift+Z`) redoes them. Changes made since in another way are left alone, and a message says so. The history is shared by all manager tabs, survives a reload, keeps the last 100 changes, and ends when the browser closes; it is kept in session storage on the device. The undo toast after a deletion uses the same history.
- Right-click menus in the bookmark manager, as in Chrome's: on a row (acting on the selection, or selecting the row first), on a folder in the tree, and on the table's empty space. They offer Edit or Rename, Show in folder, View Details, Cut, Copy, and Paste, Open in new tab, new window, or incognito window ("Open all (12)" for several items or a folder, which opens the bookmarks directly inside it; InPrivate in Edge; a private window in Firefox when the extension is allowed there), Copy link to this folder, Copy Bookmark ID, and Delete. A row's ⋯ menu shows the same commands. Copy puts the URLs on the clipboard as text and links; cut items move when pasted. A new ⋮ **Organize** menu in the header sorts the folder by name (folders first, then natural order, in the browser's own order) and adds a bookmark or folder at its end; all of these can be undone with `Ctrl+Z`.
- Drag and drop in the bookmark manager, as in Chrome's: drag rows (or the selection) onto a folder row or a folder in the folder tree to move them, and between rows to reorder while **Browser order** is on. A closed folder in the tree opens while a drag hovers it. Links dropped from other pages or apps become bookmarks where they land, and rows dragged out carry their URLs. `Ctrl+C`, `Ctrl+X`, and `Ctrl+V` (`Cmd` on a Mac) copy the selection's URLs, cut, and paste, and pasting URLs copied in another app adds them as bookmarks. Each drop or paste is one undo step.
- The bookmark manager's folder tree works like Chrome's: it is one `Tab` stop, the arrow keys move through it and open and close folders, `Home` and `End` go to the first and last folder, and `Enter` or `Space` shows a folder in the table; screen readers hear it as a tree with each folder's level and position. When Chrome keeps bookmarks both in your Google Account and only on this device, the tree shows them under **In your account** and **Only on this device**, the second closed at first, as Chrome's own manager does.
- URLs shown in the manager table, tool results, import and export reviews, dead-link repair, folder suggestions, and bookmark details are now links. A new setting, Settings > Behavior > **Open links in**, chooses whether a click opens a new tab (the default), a background tab, or the current tab; it also applies to bookmarks clicked in the popup and side panel. Middle-click and Ctrl/Cmd-click keep the browser's behavior.
- Ask AI can do more to answer: search bookmarks by folder, tag, site, or date added as well as by words, look up tags and summaries, find duplicates, suggest folders for a page (ranked on your device), and, once website access is allowed for Check Dead Links, check whether bookmarked links still work. Long lists come a page at a time, and a folder name that fits several folders makes it ask which one. It reads only bookmarked pages and the page you are on, never another address it was given. Each step still shows in the chat.

- Ask AI can change bookmarks when you ask: it saves pages, and it proposes moves, renames, deletions, and new folders as a plan shown in the chat, which changes nothing until you approve it. Once it has read a web page or searched the web, it asks before saving too. The root, the browser's permanent folders, and managed folders are never changed, and every change is one step you can undo, also with Ctrl+Z in the bookmark manager.
- Ask AI can end an answer with buttons: a follow-up question, a few options or ideas to pick from, saving the page to a suggested folder (with Undo), or opening or showing a bookmark. Nothing happens until you click, and each button works once.

- Options > Behavior > **Bookmark manager menus** chooses which commands the manager's right-click and ⋯ menus show and their order within each group, and Options > AI > **What Ask AI may do** turns off lookups or changes you do not want Ask AI to make; it is then not offered them at all. Applying a plan of changes always asks first.
- Local AI agents: Options > AI > **Local AI agents** (off by default, per device) lets AI agents on your computer, such as Claude Code, Codex, or Cursor, look up your bookmarks through the new `bookmark-scout-mcp` program (`packages/mcp-bridge`), an MCP server that talks to the extension through the browser's native messaging. Turning it on asks for the `nativeMessaging` permission (and in Firefox, consent to share bookmark data with that program). Agents get the same lookups as Ask AI, as tools with JSON Schemas; they cannot change bookmarks; private values in titles and URLs are hidden unless you turn that off; you can turn off each lookup; and every call is in AI activity, with the name the agent gave, while recording is on. Newly sent: bookmark titles, URLs, folder paths, the current page's title and URL, and with Read page content, page text, to that program on your computer and the agents you run there.
- Local AI agents can also change bookmarks once you turn on **Allow changes** (off by default): save pages, propose moves, renames, deletions, and new folders, and undo their changes. Each change opens a Bookmark Scout window that shows it as it will be made, with the agent's name, and waits for your approval; declining, closing the window, or not answering within 5 minutes changes nothing, and an approved change can be undone in the bookmark manager.

- New docs guide, [Use with local AI agents](https://docs.bookmark-scout.com/guides/local-agents): installing `bookmark-scout-mcp`, adding it to Claude Code, Codex, or Cursor (with a Cursor install link), approvals, and troubleshooting with `bookmark-scout-mcp doctor`. The program can also run under Node from an npm package, and a manual workflow builds it for Linux, macOS, and Windows on x64 and arm64.

### Performance

- Large libraries stay responsive: the popup and side panel draw only the rows on screen, so expanding every folder no longer freezes them and scrolling stays smooth.
- Changes made elsewhere (another window, the browser’s own manager, sync) show up in the manager, popup, and side panel within a moment instead of reloading every bookmark, and saving in the popup updates the tree at once.
- Extension pages and the background load less code at start: page reading loads the first time it is used, and the background no longer includes the interface library.

### Stored data

- **This update resets your saved data.** Bookmark Scout stores its data in a new format and removes what older versions stored instead of converting it. After updating, your settings are back to their defaults, AI services and API keys need to be added again, and custom prompts, saved searches, recent searches, recent folders, tags and summaries, and saved site icons are gone. Your bookmarks themselves are not touched. To keep your settings, click **Export** at the bottom of Settings before updating, and **Import** the file afterwards.
- Only the settings you change are saved, so a default improved in a later version still reaches you, and **Export** in Settings saves only those. The quick save folder, the site icon cache size, AI activity recording, and Ask AI's web search are kept on each device instead of syncing. Settings no longer hold an AI provider and model: AI uses the services you add under Settings > AI, and their names, providers, and models stay on the device.
- Settings sync within the browser's size limit: the URL Cleaner and Privacy Scanner parameter lists hold up to 20 names of up to 32 characters each (letters, digits, and URL punctuation), and **Success Status Codes** up to 20 codes.
- **Export** at the bottom of Settings now saves a backup: the settings you changed, custom prompts, AI services with their Base URL and provider-specific fields (never their API keys or extra headers), saved searches, and the manager table's columns and sort. **Import** restores a backup, replacing those parts (custom prompts the backup does not have are removed), says which services need an API key or extra headers entered again and marks them **Needs setup** in Settings > AI, and still accepts a settings file.
- JSON bookmark exports now include each bookmark's tags and summary on its own entry, and importing such a file gives them to the bookmark the import creates from it, also when several bookmarks share a URL.
- The manager table's visible columns, their order, and the sort still follow you to other devices, but column widths and the page size now stay on each device, since they suit one screen. Changing the view in one manager tab no longer undoes a different change made in another.
- The prompt library keeps up to 10 custom prompts in all, so that at their largest they fit in browser sync with your settings; saving one more says so. A prompt left behind by a save that stopped halfway is removed a day later, when the browser starts.
- A model list fetched in Settings > AI belongs to its service, so two services of the same provider no longer share one, and it is offered for 7 days before it has to be fetched again. Deleting a service deletes its list too.
- Changes made at the same moment in two Bookmark Scout tabs, or in a tab and the background, no longer overwrite each other.
- Data saved by a newer version of Bookmark Scout on another synced device is never overwritten by an older one; changing it asks you to update the extension.
- In Chrome 140 and later, the storage that holds API keys is closed to scripts running in web pages.

### Permissions and privacy

- Ask AI now also sends your AI provider the date each bookmark it finds was added and, when it checks links, whether they still work; those checks request the bookmarked pages from your browser without cookies, as Check Dead Links does. The privacy policy, docs, and store disclosures say so in every language.
- New install-time permissions without a warning: `scripting` in every browser (shows the quick save notification in the tab where the shortcut was pressed) and `offscreen` in Chrome and Edge (runs AI quick save's request in a hidden extension page). The AI quick save shortcut sends the same data as AI folder suggestions in the popup, to the AI provider you set up.
- The privacy policy (website, store, and docs, in every language) now covers what this version stores: only changed settings sync, and no longer the AI provider and model, which stay on the device with your AI services; custom prompts sync through your browser account; the opt-in AI activity log stays on the device, with keys removed; the manager's column widths and page size stay on the device; and what the backup file and JSON bookmark exports hold. Nothing new is sent anywhere.

## 0.3.2

### Languages

- The extension, website, and store listings are now available in Simplified Chinese, Traditional Chinese, Spanish, German, French, and Brazilian Portuguese, alongside English, Japanese, and Korean. With Language on Browser setting, Chinese browsers in Hong Kong, Macau, and Singapore get the matching Chinese variant.
- Plural forms now follow each language's rules, and Chinese text uses Chinese fonts instead of Japanese ones.

### Privacy

- Turning on AI or Read page content first explains what is sent and that it goes straight to the AI provider you set up, before the browser's own permission prompt.

### Fixes

- AI Folder Reorganization always shows its plan for review before it moves anything; the **Always Preview First** setting, which let it apply straight away, is gone. URL Cleaner, Metadata Fetcher, Auto-Tagging, and Content Summarizer now offer **Undo** after applying, which skips anything changed since. Folders an AI folder suggestion created are removed again after a failed save only while still empty.
- Setting sliders follow a mouse drag again; before, only the arrow keys moved them.
- The Firefox popup no longer clips its rounded corners and edges.
- The manifest summary describes the extension in full.

### Documentation

- The docs site is available in all nine languages, with English pages shown where a translation is missing, and search in each language.
- The docs say the side panel works in Firefox, where it opens as the Firefox sidebar.
- Refresh repository, docs-site, website, and localized README content to reflect current implemented features and planned work.
- Move implemented options, theme, settings sync, full bookmarks manager, import/export, duplicate cleanup, dead-link checking, and bookmark tooling out of roadmap copy.

## 0.3.1

### Privacy

- The AI Features setting now says, in every browser, what AI tools send (bookmark titles, URLs, folder names, the current page, and Ask AI messages) and that it goes straight to the provider you choose. Before, only Firefox showed this.
- The privacy policy adds the Chrome Web Store Limited Use statement and states that pages are downloaded only when Read page content is on.

### Store listing

- New screenshots of the redesigned popup, manager, Tools, and settings, a store icon with padding, a small promo tile, and a marquee tile.
- The Chrome and Edge listing descriptions name every AI feature and everything it sends.

## 0.3.0

### Highlights

- **Permissions only when needed.** Chrome and Edge now ask only for bookmark access at install. Tab access, the browser's icon cache, the right-click menu, website access, and (in Firefox) AI data collection are requested the first time you use the feature that needs them. The right-click menu is off by default.
- **Firefox ready for Add-ons review.** Permanent add-on ID, data collection declared as optional, a clean `addons-linter` run, and an "Open bookmark manager" button in the popup and side panel (Firefox cannot replace its bookmarks page).
- **Ask AI.** A read-only bookmark assistant in the popup and side panel.

### AI

- About 200 providers from the models.dev catalog with search and logos, named AI services with a popup switcher, and presets for local servers.
- Model lists and Verify Service without spending tokens, with clearer, localized errors.
- Opt-in page reading for AI tools, an opt-in AI activity log that redacts keys and custom credential headers, and a prompt library with saved custom prompts per tool.
- Reorganization moves bookmarks into the folders it suggests (creating new ones), skips bookmarks you moved after the preview, can apply partially, and is undoable.

### Bookmarks and tools

- Keyboard shortcuts in the popup and manager, saved searches, resizable table columns, persisted table views, and configurable sorting.
- Reviewed dead-link repair, import preview with duplicate strategy and undo, export privacy review, Refresh Site Icons, and stored tags and summaries.
- One delete-with-undo flow in the popup and manager that skips items changed since you confirmed; Undo disappears when its window ends.

### Fixes

- Dozens of fixes from exploratory QA: AI suggestions layout and folder names containing "/", keyboard access to search history, bulk move order, the manager page scrolling away, settings errors, translations in Japanese and Korean, and dark-mode contrast.
- Security: provider catalog data is validated before it is written or loaded, and site icons are no longer exposed to web pages.

### Under the hood

- Configuration split into validated TOML files with one source per value, shared building blocks replacing duplicated code, a clean type check in CI, and a refreshed website and docs site.

## 0.2.0

### Minor Changes

- Add AI provider routing controls for provider-specific AI service selection.
- Refresh extension, docs, and CI dependencies after merging the latest Dependabot updates.
- Document release asset installation paths for Chrome, Firefox, and Edge.

## 0.1.0

### Minor Changes

- ### Tooling & Build System Improvements

  - Add Nx 22 for monorepo-style build orchestration and caching
  - Integrate Rolldown-Vite 7.3 for faster builds
  - Add Changesets for version management and changelog generation
  - Migrate ESLint to Biome for linting and formatting
  - Convert config files from JS to TypeScript (postcss.config.ts, tailwind.config.ts)
