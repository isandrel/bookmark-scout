# Privacy Disclosures

What the extension does with data in the source after version `0.3.2` (the next release), checked against the source on 2026-10-20, and the answers to each store's privacy questions. The public-facing summary is the [privacy policy](privacy-policy.md), published at <https://bookmark-scout.com/privacy/>.

## Facts checked in the code

- No analytics, telemetry, crash reporting, ads, or accounts. A search of `apps/extension/src` for analytics and telemetry libraries found none; the only hard-coded external URLs are the default AI provider endpoints.
- The developer runs no server for the extension. Nothing is sent to Bookmark Scout.
- No declared content scripts. The extension does not read the pages you visit in their tabs; it reads only the active tab's title and URL, when the user saves the page or asks for a folder suggestion: through `activeTab` from the toolbar popup or a quick save keyboard shortcut, or through the optional `tabs` permission, asked for from the side panel. After a quick save shortcut, the extension injects its own notification script (`quick-save-toast.js`, through `scripting` and that moment's `activeTab`) into that one tab; it reads nothing from the page, and its buttons only message the extension (`src/services/quick-save.ts`). With the opt-in Read page content setting, AI tools download a page again by its URL, without cookies (see below).
- Every permission a browser lets an extension ask for later is optional and asked for when the user first turns on or runs the feature that needs it (`store/permissions.md`). In Firefox, AI features also ask for data collection consent first (below).
- Network requests happen only after a user action, in these features:
  - **AI features** (off by default): requests go from the browser straight to the provider endpoint the user configured (`src/services/ai-client.ts`). AI quick save (a keyboard shortcut) builds the same folder-suggestion request in a hidden extension page (an offscreen document in Chrome and Edge, a frame of the background page in Firefox) and the background sends it through the same logging fetch (`src/services/quick-save-ai-host.ts`).
  - **Chrome's built-in AI** (an AI service the user adds, offered only where the browser has the Prompt API's `LanguageModel` and Chrome reports the model can run; never in Firefox): the extension makes no network request for it. Folder suggestions with it pass the current page's title and URL, the paths and ids of up to `[folders] candidates` folders the local word match shortlists, and with Read page content on, up to `[folders] page_excerpt_chars` characters of the page's text (`apps/extension/config/ai/built-in.toml`) to Chrome's model on the same computer (`src/services/builtin-ai-folders.ts`, `src/services/builtin-ai-model.lazy.ts`). Its features are limited by `features` in `apps/extension/config/ai/providers/chrome-builtin.toml`; every other AI feature uses another service. Chrome downloads the model from Google once, and only after the user clicks **Download the model** in Settings > AI (`downloadBuiltinAIModel` in `src/services/builtin-ai.ts`); that download carries no user data, and the popup never starts it. AI quick save asks it in the AI host page, which keeps one session with the instructions loaded and copies it for each save until `[quick_save] idle_timeout_ms` passes without one; when the model is not ready, fails, or is slow, quick save saves to the best word match instead. Each call is logged in the AI activity log as an `ON-DEVICE` entry (`recordOnDeviceActivity` in `src/services/ai-activity.ts`; from the AI host page through the background, `recordAIHostActivity`), since the logging fetch never sees it. Nothing is sent, so the Firefox data collection consent does not apply.
  - **Check Dead Links, Metadata Fetcher, and Ask AI's link check** (the `checkLinks` action, offered to the model only after access to all websites was granted): requests go to each bookmarked URL, with `credentials: 'omit'` so no cookies are sent (`src/services/bookmark-network-tools.ts`). They need optional website access, requested when the user runs a tool: only for the sites of the bookmarks in that run (`src/lib/site-access.ts`), or for all websites above 20 sites (`config/network/site-access.toml`). A redirect to a site outside the grant is not followed, and Check Dead Links reports it as needing a manual check. The dead-link repair option "archived copy" only builds a `https://web.archive.org/web/<URL>` link locally; it does not contact the Wayback Machine (`src/services/dead-link-repair.ts`).
  - **Refresh Site Icons**: for each origin in scope, one GET for the first bookmarked page on it (only the `<head>` is read), then at most three icon files the page declares on the bookmark's own registrable domain, and the origin's `/favicon.ico`, until one is a real image under the size cap (`src/services/site-icons.ts`). Same transport as above: `credentials: 'omit'`, the same optional website access for the sites in scope, and redirects the site answers with are followed within them. No third-party icon service is contacted.
  - **Access for local AI agents** (off by default; a device setting in Settings > For developers > Local AI agents; `src/services/agent-bridge.ts`): the extension itself makes no network request for it. After the user turns it on and grants the optional `nativeMessaging` permission (in Firefox, also data collection consent), the extension starts the `bookmark-scout-mcp` program the user installed on the same computer, through the browser's native messaging, and answers the lookups AI agents on that computer (such as Claude Code, Codex, or Cursor) request through that program: matching bookmarks (title, URL, folder path, date added, saved tags and summary), folder paths, duplicate groups, folders suggested on the device, the active tab's title and URL where the browser shows it, whether bookmarked links still work (with website access), and with Read page content on, the main text of a bookmarked page or the active tab's page. Agents change bookmarks (saving a page, applying a plan of moves, renames, deletions, and new folders, undoing one of their changes) only while **Allow changes** is also on (off by default), and each change waits for the user's approval in an extension window (`agent-approval.html`, `src/services/agent-approvals.ts`) and goes into the manager's undo history; the user can turn off each lookup or change. Private values in titles and URLs (the Privacy Scanner's sensitive parameters, tokens, email addresses) are replaced before they are sent, unless the user turns that off. The program talks to agents only over a per-user socket (a named pipe on Windows), never a network port (`packages/mcp-bridge`). What an agent does with what it reads, including sending it to its own AI provider, is up to that agent and its provider.
  - **Read page content** (off by default; AI must also be on): folder suggestions, Auto-Tagging, and Content Summarizer GET each page by its URL with `credentials: 'omit'`, keep the article text with Mozilla Readability, and send up to the configured character limit per page to the chosen AI provider (`src/services/page-reader.ts`). Turning the setting on requests the same optional website access. Hosts on the local network (loopback, private and link-local addresses, `localhost`, `.local`, `.internal`, `.lan`, `.home.arpa`) are never requested.
- Every stored key is listed in `src/lib/storage/registry.ts`, with its area and what the backup file does with it; the key names below come from there. Settings are stored as overrides: only the settings the user changed from their default are kept (`src/lib/settings-storage.ts`). Most go to `storage.sync`; the device settings in `DEVICE_SETTING_KEYS` (the quick save folder, the site icon storage limit, AI activity recording, Ask AI web search, and access for local AI agents) stay in `storage.local`. AI services and their credentials are no longer settings and never sync.
- AI provider credentials (API key, Base URL, extra headers, provider-specific fields) are stored with `local:` storage items only (`src/lib/ai-provider-storage.ts`, registry `backup: 'secret'`): they are not synced. The backup file holds only each service's Base URL and provider-specific fields (`aiEndpoints`, `src/services/backup.ts`), never the API key or the extra headers, which can carry a key (`AI_SECRET_FIELDS`). Where the browser supports it (Chrome 140 and later), `storage.local` is also closed to content scripts (`src/lib/storage/cleanup.ts`).
- Custom prompts (Settings > AI Tools > Prompts) are in `storage.sync`, one item per prompt plus an index, at most `max_prompts` of them (`apps/extension/config/ai/prompt-library.toml`, `src/lib/prompt-library-storage.ts`). A prompt's text is sent to the AI provider as the instructions of the task that uses it.
- **About me** (Settings > AI; empty by default) is its own `storage.sync` item (`ai.about-me`, `src/lib/about-me-storage.ts`), at most `max_length` characters (`apps/extension/config/ai/about-me.toml`). While it has text, the built-in prompt of every AI feature that calls a provider (folder suggestions, Auto-Tagging, Content Summarizer, AI Folder Reorganization, Ask AI) includes it in an `<about_user>` block, so it goes to the AI provider with each of their requests; a custom prompt sends it only when it uses `{{aboutMe}}` (`src/services/prompt-config.ts`). Chrome's built-in AI prompts never include it.
- **Existing tags**: Auto-Tagging also sends the names of the tags already saved on any bookmark (`bookmarks.metadata`), most used first, at most `[existing_tags] max_tags` names and `max_chars` characters (`apps/extension/config/ai/prompts.toml`), so the model reuses them. The **Send Existing Tags** setting (on by default) turns this off; a custom prompt sends them only when it uses `{{existingTags}}`.
- The AI activity log (Settings > AI > AI activity) records nothing until the user turns on recording, a device setting that is off by default. It then keeps the last AI requests, with their request and response bodies (for Chrome's built-in AI, the prompt the model read and its answer), in `storage.local` on this device; the count and body length are set in `apps/extension/config/ai/activity.toml`. Credential headers, the user's extra headers, and API keys in URLs are redacted before an entry is stored, and headers whose names look like credentials are redacted again when it is read (`src/lib/ai-activity-storage.ts`). Turning recording off deletes the log (`src/hooks/use-ai-activity.ts`).

## Data inventory

"In the backup file" is the registry's `backup` policy: whether **Back up settings** in Settings writes the item to the backup file (see "Files the user saves" below). The one partial case is `ai.credentials` (`backup: 'secret'`): its endpoint fields go into the file's `aiEndpoints` section, its secret fields never do.

| Data | Stored where | Leaves the device? | In the backup file |
| --- | --- | --- | --- |
| Bookmarks (titles, URLs, folders) | The browser's own bookmark store | Only as described under "What each AI feature sends", the network tools under "Facts checked in the code", and "Files the user saves" below. Browser bookmark sync is the browser's feature, not the extension's. | No; bookmark exports are separate files |
| Active tab title and URL | Not stored, unless the user saves the page as a bookmark | With Chrome's built-in AI, passed only to the model on the computer. Sent to the AI provider only when the user asks for folder suggestions (including the AI quick save shortcut), when the user turned on both AI and Auto-recommend on Open (both off by default), or when the model in Ask AI asks for the current page | No |
| Settings the user changed from their defaults (`settings`), including the AI on/off switch; no AI provider, model, or key | `storage.sync` | Synced by the browser vendor's sync service when the user has browser sync on | Yes |
| Device settings (`settings` in `storage.local`), only those changed from their defaults: the quick save folder (a folder id), the site icon storage limit, AI activity recording, Ask AI web search, and access for local AI agents (on or off, hiding private values, and the lookups turned off) | `storage.local` | No | Yes |
| Local AI agent profile id (`agent-bridge.profile`): a random id that tells agents on this computer which browser profile they reach | `storage.local` | Passed to the `bookmark-scout-mcp` program on this computer while access for local AI agents is on | No |
| Changes local AI agents asked for, waiting for approval (`agent-bridge.approvals`): the action, its input (such as a page's title and URL and a folder), and the name the agent gave; each waits at most 5 minutes (`apps/extension/config/ai/agent-approvals.toml`) | `storage.session`, cleared when the browser closes | No | No |
| Local AI agent bridge status (`agent-bridge.status`): whether the program is running, and the browser's reason when it is not | `storage.session`, cleared when the browser closes | No | No |
| Custom prompts (`prompts.index`, `prompts.prompt/<id>`): each prompt's name, task, and text, and which prompt each task uses; at most 10 | `storage.sync` | Synced by the browser vendor's sync service when the user has browser sync on. A prompt's text is sent to the AI provider as the instructions of the task that uses it | Yes |
| About me (`ai.about-me`): what the user wrote about themselves for AI prompts; at most 1,000 characters | `storage.sync` | Synced by the browser vendor's sync service when the user has browser sync on. Sent to the AI provider with each AI request whose prompt includes it (every built-in prompt does) | Yes |
| AI services (`ai.services`): each service's name, provider, and model | `storage.local` | No | Yes |
| Bookmark table view (`manager.table-view`): visible columns, their order, and the sort | `storage.sync` | Same as settings. Contains no bookmark content. | Yes |
| Bookmark table layout (`manager.table-layout`): column widths and page size | `storage.local` | No | No |
| AI provider settings (`ai.credentials`): API key, Base URL, extra headers, and provider-specific fields, per AI service | `storage.local`, never synced | The key and headers are sent only to the configured provider, as request authentication | Base URL and provider-specific fields: yes, as `aiEndpoints`. API key and extra headers: never |
| Model lists fetched from each AI service (`ai.model-cache`): model ids and names, offered for 7 days | `storage.local` | No | No |
| AI activity log (`ai.activity-log`), only while the user has AI activity recording on (off by default, per device): the last AI requests with their request and response bodies, which hold bookmark titles, URLs, folder paths, and with Read page content, page text, and the bookmark changes Ask AI made and every lookup a local AI agent made (the action, its input, its result, and the name the agent gave); credentials redacted before storing; deleted when recording is turned off | `storage.local` | No; never synced. The user can copy an entry to the clipboard | No |
| Tags and summaries (`bookmarks.metadata`) | `storage.local` | Sent to the AI provider by Ask AI for the bookmarks it looks up. The names of the most used tags, without the bookmarks they belong to, are sent by Auto-Tagging while Send Existing Tags is on (the default). Written into JSON bookmark exports (on each bookmark's own entry) and into AI context exports when the user turns that on | No |
| Saved searches (`search.saved`) | `storage.local` | No | Yes |
| Recent folders (`folders.recent`, for the popup, the right-click menu, and quick save) | `storage.local` | No | No |
| Last quick save (`quick-save.last`): the page title and URL, where it was saved, and the folders offered, for Undo and Move | `storage.session`, cleared when the browser closes | No | No |
| Bookmark changes Ask AI proposed (`ai.action-plans`): the changes in each plan (bookmark and folder ids, titles, URLs, folder paths) and a one-line summary the model wrote, until the user applies it; at most 10 plans, each usable for 60 minutes (`apps/extension/config/ai/actions.toml`) | `storage.session`, cleared when the browser closes | No | No |
| Manager undo history (`bookmarks.history`): the bookmarks changed in the manager or by Ask AI (ids, titles, URLs, folders, positions), with copies of deleted ones and their tags and summaries, for Ctrl+Z and Ctrl+Y; at most the last 100 changes and 4 MB, a large change stored gzip-compressed (`apps/extension/config/bookmarks/history.toml`) | `storage.session`, cleared when the browser closes | No | No |
| Bookmark change history (IndexedDB `bookmark-scout-audit`, `apps/extension/src/lib/bookmark-audit-store.ts`): one record per change Bookmark Scout makes to bookmarks (when, which surface, counts, outcome) and its rows (bookmark ids, titles, URLs, folder ids and positions before and after), for the History; finished records kept for `retention_days` in `config/bookmarks/audit.toml`, at most `max_operations`; records that need review are kept until resolved. Before Bookmark Scout deletes anything, a copy of the deleted items (title, URL, folder and position, what was inside a folder, and their tags and summaries; store `checkpoints`) is stored and read back, for **Restore** in the History after Undo is gone; it is deleted with its record. Also a baseline (store `baseline`): every bookmark's id, title, URL, and folder id as last seen, and notes of the extension's own pending writes (store `intents`, kept for `intent_ttl_ms`), so the background observer (`src/services/bookmark-observer.ts`) can tell changes made elsewhere (recorded as from an unknown source; device setting `historyRecordOutsideChanges`, on by default) | IndexedDB on this device | No | No |
| Manager clipboard (`manager.clipboard`): the ids of the bookmarks the manager's Cut or Copy holds, whether they were cut, when, and a short hash of the text put on the system clipboard (not the text), so every manager tab can paste them; at most 10,000 items (`apps/extension/config/bookmarks/clipboard.toml`) | `storage.session`, cleared when the browser closes | No | No |
| Recent searches (`search.history`) | `storage.local`, can be turned off in Settings | No | No |
| Site icons (`site-icons.cache`): one `data:` image URL and download time per origin, saved only after the user reviews a refresh; total capped by the `siteIconsMaxCacheKb` setting (default 4096 KB) | `storage.local` | No | No |
| Scan results (duplicates, dead links, metadata, site icons before saving, privacy scan, statistics) | Memory only, while the dialog is open | No | No |

## What each AI feature sends

Only when AI is turned on and the user starts the feature (or turned on Auto-recommend on Open):

| Feature | Sent to the chosen provider |
| --- | --- |
| Folder suggestions (popup, side panel, AI quick save shortcut) | Current page title and URL, and the names and paths of all bookmark folders. With Read page content on, also the page's own title and main text. With Chrome's built-in AI (popup, side panel, and AI quick save): nothing leaves the device; the page title and URL, a shortlist of folder paths, and with Read page content a short text excerpt go to Chrome's model on the computer |
| Auto-Tagging | ID, title, URL, and folder path of each bookmark in the current folder. With Send Existing Tags on (the default), also the names of up to 200 of the user's most used tags. With Read page content on, also each page's own title and main text |
| Content Summarizer | ID, title, URL, folder path, and optionally the domain of each bookmark in the current folder. With Read page content on, also each page's own title and main text |
| AI Folder Reorganization | Titles, URLs, and folder paths of the bookmarks in the chosen scope |
| Verify Service | A fixed test prompt, no bookmark data |
| Refresh Models | A model-list request with the API key, no bookmark data |
| Ask AI (popup, side panel) | The user's messages and the conversation so far, plus what the model looks up and changes with the actions in `src/services/actions.ts` (reads in `read-actions.ts`; saving, plans, and undo in `write-actions.ts` and `plan-actions.ts`, each change only after the user's approval when the rules in `actionApproval` require it): matching bookmarks (title, URL, folder path, date added, saved tags and summary), folder paths, duplicate groups, folders suggested on the device, the active tab's title and URL, whether bookmarked links it checks still work (status code, redirect address), and with Read page content on, the main text of pages it reads, which can only be a bookmarked page or the active tab's page. With the web search toggle on (off by default), the provider also searches the web itself. The conversation is kept in memory only and is gone when the panel closes (`src/services/ai-agent.ts`). |
| AI Context Packer | Nothing. It downloads a file; it never contacts a provider. |
| Access for local AI agents | Nothing to the chosen provider. The lookups listed under "Facts checked in the code" go to the `bookmark-scout-mcp` program on this computer, which passes them to the AI agent that asked; that agent may send them to its own provider. Works with AI off. |

Every feature above that calls a provider also sends the user's **About me** text while it has any (empty by default), and the output language as a language name (from the AI output language setting).

Ollama and custom endpoints can point to a server on the user's own machine, in which case nothing leaves the device. Chrome's built-in AI always runs on the user's computer.

## Files the user saves

The extension uploads none of these files; each is downloaded to wherever the user saves it, and what happens to it then is up to the user.

- **Backup file** (**Back up settings** in Settings, `bookmark-scout-backup.json`, named in `apps/extension/config/ui/options.toml`): every registry item marked `backup: 'include'` (the "In the backup file" column above), as stored: the changed settings (synced and device ones, including the quick save folder id), custom prompts, About me, AI services (name, provider, and model), saved searches, and the table view (columns and sort). Of `ai.credentials`, it holds only each AI service's Base URL and provider-specific fields (such as an Azure resource name or API version, or an OpenAI organization or project), in an `aiEndpoints` section keyed by service id, with the names of the secret fields it left out. It never holds the API key or the extra headers, which can carry a key (`AI_SECRET_FIELDS` in `src/lib/ai-provider-storage.ts`, `src/services/backup.ts`); after a restore, a service missing either is marked **Needs setup** in Settings > AI, and the restore notice lists what was not restored for which service. It is plain JSON, not encrypted. Settings > Import restores it, replacing each item the file holds.
- **Bookmark exports** (HTML, JSON, Markdown, CSV), with an optional privacy review that can redact sensitive values first. A JSON export also holds each exported bookmark's tags and summary, on that bookmark's own entry (`tags` and `summary`), and importing it gives each bookmark it creates its own tags and summary (`src/services/bookmark-export.ts`, `src/services/bookmark-import.ts`).
- **AI context exports** (AI Context Packer): bookmarks, and tags and summaries when the user turns that on, in a file for an AI chat. Nothing is sent to a provider.

## Chrome Web Store: Privacy practices tab

### Data usage

The Chrome Web Store asks which user data the extension collects. Bookmark Scout never sends data to its developer, but the AI features send data to a third party the user picks, and the network tools contact bookmarked sites. Disclosing conservatively is the safer reading of the User Data policy. **The final choice is the maintainer's.**

Submitted for 0.3.0 (2026-10-08): the maintainer left every category unchecked, because the developer receives no data and AI requests go straight from the browser to a provider the user picks. The reviewer notes (Test instructions) explain this, and the listing description names everything the AI features send. If review rejects the item for undisclosed data, check Authentication information, Web history, and Website content as suggested below.

| Category | Suggested answer | Reason |
| --- | --- | --- |
| Personally identifiable information | No | Not collected. About me is free text the user chooses to write for their own AI provider (empty by default), sent only to that provider; the maintainer may still prefer to check this |
| Health information | No | Not collected |
| Financial and payment information | No | Not collected |
| Authentication information | Yes | The user's own AI provider API key is stored locally and sent to that provider |
| Personal communications | No | Not collected |
| Location | No | Not collected |
| Web history | Yes | Bookmark URLs and the active tab URL are sent to the user's AI provider when the user uses AI features |
| User activity | No | No clicks, keystrokes, or usage are sent anywhere. The opt-in AI activity log records only the extension's own AI requests, on this device |
| Website content | Yes | Bookmark titles and the active tab title are sent to the AI provider; page heads are read locally by the Metadata Fetcher and Refresh Site Icons, and site icons are stored locally |

Certifications (all true for this code):

- [ ] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [ ] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [ ] I do not use or transfer user data to determine creditworthiness or for lending purposes.

Sending data to the AI provider the user configured, at the user's request, is part of the extension's single purpose. State that in the privacy policy, as the published policy does.

### Privacy policy URL

Required once any data category above is checked. Use `https://bookmark-scout.com/privacy/` (text: [`privacy-policy.md`](privacy-policy.md)).

## Firefox Add-ons: data collection declaration

New Firefox extensions must declare `browser_specific_settings.gecko.data_collection_permissions` in the manifest, and Firefox shows the declaration at install. Nothing goes to the developer, but the AI features send data to a provider the user picks, which Mozilla counts as collection. The maintainer chose to ask for it at first use rather than at install (option A below). The Firefox build declares (generated from `apps/extension/src/lib/permission-catalog.ts`):

```json
"data_collection_permissions": {
  "required": ["none"],
  "optional": ["authenticationInfo", "bookmarksInfo", "browsingActivity", "websiteContent"]
}
```

So the install prompt says the extension does not require data collection, and Firefox asks with `permissions.request({ data_collection: [...] })`, from the user's click, when a feature first needs a category:

| Feature | Categories | Asked for when | Sent where |
| --- | --- | --- | --- |
| AI features: folder suggestions, Ask AI, Auto-Tagging, Content Summarizer, AI Folder Reorganization | `authenticationInfo` (the user's API key), `bookmarksInfo` (bookmark titles, URLs, folder paths, and the names of the user's tags), `browsingActivity` (the current page's title and URL, as the browser's history holds them) | The user turns on **Enable AI** | The AI provider the user configured |
| Read page content | `websiteContent` (the text of the pages read), with access to all websites | The user turns on **Read page content** | The same provider |
| Verify Service, Refresh Models | `authenticationInfo` | The button click, in the same prompt as access to that provider's site | The same provider |
| Access for local AI agents | `bookmarksInfo`, `browsingActivity` (the current page's title and URL); page text only with Read page content, under its own `websiteContent` consent | The user turns on **Allow local AI agents**, in the same prompt as `nativeMessaging` | The `bookmark-scout-mcp` program on the user's computer and the AI agents the user runs there |
| Check Dead Links, Metadata Fetcher, Refresh Site Icons | None: each request goes only to the bookmarked site itself, without cookies | Not applicable | Not applicable |

Each feature asks only for the categories it sends (in 0.3.3 and earlier, turning on AI asked for all four at once). Before Firefox's prompt, which says "the developer" wants to collect the data, the extension's dialog says that here this means the AI provider the user chose (or, for local AI agents, the agents on the user's computer) and that Bookmark Scout receives nothing (`perm_aiFirefoxNote`, `perm_agentBridgeFirefoxNote`). If the user declines, the setting stays off and nothing is sent. Every provider request goes through `createLoggingFetch` (`src/services/ai-activity.ts`), which refuses to send without the consent, so withdrawing it in `about:addons` stops AI at once. Users who turned AI on before this change are asked again when they next turn it on. Mozilla does not say whether requests to the bookmarked site itself count as collection; the reviewer notes explain why the network tools declare none.

Options considered:

| Option | Manifest value | Trade-off |
| --- | --- | --- |
| A. Optional AI data (chosen) | `required: ["none"]`, the AI categories as `optional` | Matches "AI is off by default". Needs the runtime request and refusal handling, which the extension has. |
| B. Declare up front | The AI categories as `required` | No code change beyond the manifest, but every user sees it at install although AI is off by default. |
| C. Declare none | `required: ["none"]` only | Not defensible: Mozilla counts data sent to a provider the user picks as collection. |

AMO listing fields:

- "This add-on requires payment, non-free services or software, or additional hardware": leave unchecked. The extension is free and fully usable without AI; AI is optional and uses the user's own provider account. Mention the possible provider cost in the description (done).
- Privacy policy: AMO requires one when an add-on handles user data; attach the hosted policy text or link.

## Edge Add-ons: privacy fields

- "Does your extension access, collect, or transmit personal information?": **Yes**, for the same reasons as the Chrome answers above. A privacy policy URL is then required.
- Use the same policy as the other stores.
