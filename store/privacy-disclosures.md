# Privacy Disclosures

What the extension does with data at version `0.2.0`, checked against the source on 2026-10-01, and the answers to each store's privacy questions. The public-facing summary is the [privacy policy draft](privacy-policy.md).

## Facts checked in the code

- No analytics, telemetry, crash reporting, ads, or accounts. A search of `apps/extension/src` for analytics and telemetry libraries found none; the only hard-coded external URLs are the default AI provider endpoints.
- The developer runs no server for the extension. Nothing is sent to Bookmark Scout.
- No content scripts. The extension does not read the pages you visit; it reads only the active tab's title and URL.
- Network requests happen only after a user action, in two features:
  - **AI features** (off by default): requests go from the browser straight to the provider endpoint the user configured (`src/services/ai-client.ts`).
  - **Check Dead Links and Metadata Fetcher**: requests go to each bookmarked URL, with `credentials: 'omit'` so no cookies are sent (`src/services/bookmark-network-tools.ts`). They need optional website access, requested on first use.
- AI provider credentials are stored with `local:` storage items only (`src/lib/ai-provider-storage.ts`) and are not synced.

## Data inventory

| Data | Stored where | Leaves the device? |
| --- | --- | --- |
| Bookmarks (titles, URLs, folders) | The browser's own bookmark store | Only as described under "AI features", "Network tools", and "Exports" below. Browser bookmark sync is the browser's feature, not the extension's. |
| Active tab title and URL | Not stored, unless the user saves the page as a bookmark | Sent to the AI provider only when the user asks for folder suggestions, or when the user turned on both AI and Auto-recommend on Open (both off by default) |
| Settings (`bookmark-scout-settings`), including the AI on/off switch, provider name, and model name | `storage.sync` | Synced by the browser vendor's sync service when the user has browser sync on |
| Bookmark table view (`bookmark-scout-table-view`): visible columns, order, widths, page size, sort | `storage.sync` | Same as settings. Contains no bookmark content. |
| AI provider settings (`bookmark-scout-ai`): API key, Base URL, extra headers, per provider | `storage.local` | The key and headers are sent only to the configured provider, as request authentication |
| Tags and summaries (`bookmark-scout-bookmark-metadata`) | `storage.local` | Included in AI context exports when the user turns that on; otherwise no |
| Saved searches | `storage.local` | No |
| Recent folders (for the right-click menu) | `storage.local` | No |
| Recent searches | `storage.local`, can be turned off in Settings | No |
| Scan results (duplicates, dead links, metadata, privacy scan, statistics) | Memory only, while the dialog is open | No |

## What each AI feature sends

Only when AI is turned on and the user starts the feature (or turned on Auto-recommend on Open):

| Feature | Sent to the chosen provider |
| --- | --- |
| Folder suggestions (popup, side panel) | Current page title and URL, and the names and paths of all bookmark folders |
| Auto-Tagging | ID, title, URL, and folder path of each bookmark in the current folder |
| Content Summarizer | ID, title, URL, folder path, and optionally the domain of each bookmark in the current folder. No page content is fetched. |
| AI Folder Reorganization | Titles, URLs, and folder paths of the bookmarks in the chosen scope |
| Verify Service | A fixed test prompt, no bookmark data |
| Refresh Models | A model-list request with the API key, no bookmark data |
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
| Website content | Yes | Bookmark titles and the active tab title are sent to the AI provider; page heads are read locally by the Metadata Fetcher |

Certifications (all true for this code):

- [ ] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [ ] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [ ] I do not use or transfer user data to determine creditworthiness or for lending purposes.

Sending data to the AI provider the user configured, at the user's request, is part of the extension's single purpose. State that in the privacy policy, as the draft does.

### Privacy policy URL

Required once any data category above is checked. The policy is not hosted yet; see [`privacy-policy.md`](privacy-policy.md).

## Firefox Add-ons: data collection declaration

`addons-linter` reports `MISSING_DATA_COLLECTION_PERMISSIONS`: new Firefox extensions must declare `browser_specific_settings.gecko.data_collection_permissions` in the manifest, and Firefox shows the declaration to the user at install. The Firefox build has no such key and no add-on ID today, so **the Firefox package cannot be submitted as a new listing until a manifest change lands.** That change is out of scope here (it touches `wxt.config.ts` and needs a release). Options for the maintainer:

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
