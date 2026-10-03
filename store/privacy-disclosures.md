# Privacy Disclosures

What the extension does with data at version `0.2.0`, checked against the source on 2026-10-02, and the answers to each store's privacy questions. The public-facing summary is the [privacy policy](privacy-policy.md), published at <https://bookmark-scout.com/en/privacy/>.

## Facts checked in the code

- No analytics, telemetry, crash reporting, ads, or accounts. A search of `apps/extension/src` for analytics and telemetry libraries found none; the only hard-coded external URLs are the default AI provider endpoints.
- The developer runs no server for the extension. Nothing is sent to Bookmark Scout.
- No content scripts. The extension does not read the pages you visit in their tabs; it reads only the active tab's title and URL. With the opt-in Read page content setting, AI tools download a page again by its URL, without cookies (see below).
- Network requests happen only after a user action, in these features:
  - **AI features** (off by default): requests go from the browser straight to the provider endpoint the user configured (`src/services/ai-client.ts`).
  - **Check Dead Links and Metadata Fetcher**: requests go to each bookmarked URL, with `credentials: 'omit'` so no cookies are sent (`src/services/bookmark-network-tools.ts`). They need optional website access, requested on first use. The dead-link repair option "archived copy" only builds a `https://web.archive.org/web/<URL>` link locally; it does not contact the Wayback Machine (`src/services/dead-link-repair.ts`).
  - **Refresh Site Icons**: for each origin in scope, one GET for the first bookmarked page on it (only the `<head>` is read), then at most three icon files the page declares on the bookmark's own registrable domain, and the origin's `/favicon.ico`, until one is a real image under the size cap (`src/services/site-icons.ts`). Same transport as above: `credentials: 'omit'`, the same optional website access, and redirects the site answers with are followed. No third-party icon service is contacted.
  - **Read page content** (off by default; AI must also be on): folder suggestions, Auto-Tagging, and Content Summarizer GET each page by its URL with `credentials: 'omit'`, keep the article text with Mozilla Readability, and send up to the configured character limit per page to the chosen AI provider (`src/services/page-reader.ts`). Turning the setting on requests the same optional website access. Hosts on the local network (loopback, private and link-local addresses, `localhost`, `.local`, `.internal`, `.lan`, `.home.arpa`) are never requested.
- AI provider credentials are stored with `local:` storage items only (`src/lib/ai-provider-storage.ts`) and are not synced.

## Data inventory

| Data | Stored where | Leaves the device? |
| --- | --- | --- |
| Bookmarks (titles, URLs, folders) | The browser's own bookmark store | Only as described under "AI features", "Network tools", and "Exports" below. Browser bookmark sync is the browser's feature, not the extension's. |
| Active tab title and URL | Not stored, unless the user saves the page as a bookmark | Sent to the AI provider only when the user asks for folder suggestions, when the user turned on both AI and Auto-recommend on Open (both off by default), or when the model in Ask AI asks for the current page |
| Settings (`bookmark-scout-settings`), including the AI on/off switch, provider name, and model name | `storage.sync` | Synced by the browser vendor's sync service when the user has browser sync on |
| Bookmark table view (`bookmark-scout-table-view`): visible columns, order, widths, page size, sort | `storage.sync` | Same as settings. Contains no bookmark content. |
| AI provider settings (`bookmark-scout-ai`): API key, Base URL, extra headers, per provider | `storage.local` | The key and headers are sent only to the configured provider, as request authentication |
| Tags and summaries (`bookmark-scout-bookmark-metadata`) | `storage.local` | Included in AI context exports when the user turns that on; otherwise no |
| Saved searches | `storage.local` | No |
| Recent folders (for the right-click menu) | `storage.local` | No |
| Recent searches | `storage.local`, can be turned off in Settings | No |
| Site icons (`bookmark-scout-site-icons`): one `data:` image URL and download time per origin, saved only after the user reviews a refresh; total capped by the `siteIconsMaxCacheKb` setting (default 4096 KB) | `storage.local` | No |
| Scan results (duplicates, dead links, metadata, site icons before saving, privacy scan, statistics) | Memory only, while the dialog is open | No |

## What each AI feature sends

Only when AI is turned on and the user starts the feature (or turned on Auto-recommend on Open):

| Feature | Sent to the chosen provider |
| --- | --- |
| Folder suggestions (popup, side panel) | Current page title and URL, and the names and paths of all bookmark folders. With Read page content on, also the page's own title and main text |
| Auto-Tagging | ID, title, URL, and folder path of each bookmark in the current folder. With Read page content on, also each page's own title and main text |
| Content Summarizer | ID, title, URL, folder path, and optionally the domain of each bookmark in the current folder. With Read page content on, also each page's own title and main text |
| AI Folder Reorganization | Titles, URLs, and folder paths of the bookmarks in the chosen scope |
| Verify Service | A fixed test prompt, no bookmark data |
| Refresh Models | A model-list request with the API key, no bookmark data |
| Ask AI (popup, side panel) | The user's messages and the conversation so far, plus what the model looks up with read-only tools: matching bookmarks (title, URL, folder path, saved tags and summary), folder paths, the active tab's title and URL, and with Read page content on, the main text of pages it reads. With the web search toggle on (off by default), the provider also searches the web itself. The conversation is kept in memory only and is gone when the panel closes (`src/services/ai-agent.ts`). |
| AI Context Packer | Nothing. It downloads a file; it never contacts a provider. |

Ollama and custom endpoints can point to a server on the user's own machine, in which case nothing leaves the device.

## Chrome Web Store: Privacy practices tab

### Data usage

The Chrome Web Store asks which user data the extension collects. Bookmark Scout never sends data to its developer, but the AI features send data to a third party the user picks, and the network tools contact bookmarked sites. Disclosing conservatively is the safer reading of the User Data policy. **The final choice is the maintainer's.**

| Category | Suggested answer | Reason |
| --- | --- | --- |
| Personally identifiable information | No | Not collected |
| Health information | No | Not collected |
| Financial and payment information | No | Not collected |
| Authentication information | Yes | The user's own AI provider API key is stored locally and sent to that provider |
| Personal communications | No | Not collected |
| Location | No | Not collected |
| Web history | Yes | Bookmark URLs and the active tab URL are sent to the user's AI provider when the user uses AI features |
| User activity | No | No clicks, keystrokes, or usage are recorded or sent |
| Website content | Yes | Bookmark titles and the active tab title are sent to the AI provider; page heads are read locally by the Metadata Fetcher and Refresh Site Icons, and site icons are stored locally |

Certifications (all true for this code):

- [ ] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [ ] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [ ] I do not use or transfer user data to determine creditworthiness or for lending purposes.

Sending data to the AI provider the user configured, at the user's request, is part of the extension's single purpose. State that in the privacy policy, as the published policy does.

### Privacy policy URL

Required once any data category above is checked. Use `https://bookmark-scout.com/en/privacy/` (text: [`privacy-policy.md`](privacy-policy.md)).

## Firefox Add-ons: data collection declaration

New Firefox extensions must declare `browser_specific_settings.gecko.data_collection_permissions` in the manifest, and Firefox shows the declaration to the user at install. The Firefox build declares option B today (`apps/extension/manifest.config.ts`): `required: ["authenticationInfo", "bookmarksInfo", "browsingActivity", "websiteContent"]`, for the AI provider the user chooses. Nothing goes to the developer. The maintainer chose option A instead (each category asked for when the user first turns on the feature that sends it); [`plans/2026-10-03-dynamic-permissions.md`](../plans/2026-10-03-dynamic-permissions.md) describes that change. Options considered:

| Option | Manifest value | Trade-off |
| --- | --- | --- |
| A. Optional AI data | `required: ["none"]`, `optional: ["bookmarksInfo", "browsingActivity"]` | Matches "AI is off by default". Needs code that requests the optional data permission when the user turns on AI, and handles a refusal. |
| B. Declare up front | `required: ["bookmarksInfo", "browsingActivity"]` | No code change beyond the manifest, but every user sees it at install although AI is off by default. |
| C. Declare none | `required: ["none"]` | Only defensible if Mozilla does not count user-directed requests to a user-chosen provider as collection. Check Mozilla's guidance before choosing it. |

The category names above follow Mozilla's documentation as remembered on this date. Verify them against the current list at the link `addons-linter` prints (`https://mzl.la/firefox-builtin-data-consent`) before editing the manifest.

AMO listing fields:

- "This add-on requires payment, non-free services or software, or additional hardware": leave unchecked. The extension is free and fully usable without AI; AI is optional and uses the user's own provider account. Mention the possible provider cost in the description (done).
- Privacy policy: AMO requires one when an add-on handles user data; attach the hosted policy text or link.

## Edge Add-ons: privacy fields

- "Does your extension access, collect, or transmit personal information?": **Yes**, for the same reasons as the Chrome answers above. A privacy policy URL is then required.
- Use the same policy as the other stores.
