# Bookmark Scout Privacy Policy (Draft)

> **Draft, not yet published.** Neither the website nor the docs site has a privacy policy today. Before submission, the maintainer chooses where to host it (for example `https://bookmark-scout.com/privacy` or `https://docs.bookmark-scout.com/privacy`), fills in the contact line, sets the effective date, and adds Japanese and Korean versions if the site needs them. This draft covers the browser extension only. The website `bookmark-scout.com` uses Umami Cloud analytics and needs its own section or policy if it is hosted there.

**Effective date:** _to be set on publication_
**Applies to:** the Bookmark Scout browser extension for Chrome, Firefox, and Microsoft Edge, version 0.2.0 and later

## Summary

Bookmark Scout works inside your browser. It has no account, no analytics, no ads, and no server of its own. The developer does not receive your bookmarks or any other data from the extension. Data leaves your browser only when you use an optional feature that needs the network, and then it goes directly to the service you chose.

## What the extension reads

- **Your bookmarks**, to show, search, edit, move, delete, import, and export them.
- **The title and URL of the active tab**, so you can save the page you are viewing into a folder.
- **Site icons from your browser's own icon cache** (Chrome and Edge), to show next to bookmarks. No network request is made for them.

The extension does not read the content of the pages you visit and has no content scripts.

## What the extension stores

All storage is in your browser's extension storage:

- **Settings** are stored in the browser's sync storage, so your browser may sync them to your other devices through your browser account (for example Google, Mozilla, or Microsoft sync) if you have browser sync turned on. Settings include whether AI is on and which provider and model you chose, but not your API key.
- **AI provider settings**, including your API key, Base URL, and any extra headers, are stored in local storage on this device only. They are not synced.
- **Tags, summaries, saved searches, recent folders, and recent searches** are stored in local storage on this device only. You can turn off recent searches in Settings.

Uninstalling the extension removes the data it stored in this browser. Your bookmarks themselves stay in the browser.

## When data leaves your browser

### Optional AI features (off by default)

AI features run only after you turn them on in Settings and choose a provider. When you use one, the extension sends the data that feature needs directly from your browser to the provider endpoint you configured:

- folder suggestions: the current page title and URL and your bookmark folder names
- tag suggestions, summaries, and reorganization plans: the titles, URLs, and folder paths of the bookmarks in the scope you chose

Your API key is sent to that provider to authenticate the request. The provider handles the data under its own terms and privacy policy, which you accept with them directly. Bookmark Scout does not send this data anywhere else. If you point the extension at a model running on your own computer (for example Ollama), the data stays on your machine.

### Dead link checks and title fetching

Check Dead Links and Metadata Fetcher request the bookmarked pages themselves to see whether they load and what their titles are. The browser asks for your permission the first time you run them. Requests go directly to each website, without cookies, and the results stay in the extension. Like any visit, the website can see your IP address and that the page was requested.

### Exports

Bookmark and AI context exports are saved as files on your computer. Before saving, the extension can show a privacy review that lets you redact sensitive values. Nothing is uploaded.

## What the developer receives

Nothing. The extension does not send data to the developer, and there is no telemetry.

## Permissions

Bookmark Scout asks for `bookmarks`, `tabs`, `storage`, `contextMenus`, and, in Chrome and Edge, `favicon` and `sidePanel`. Website access is optional: it is requested for all sites when you first run Check Dead Links or Metadata Fetcher, and for one provider site when you click Verify Service or Refresh Models in the AI settings. See the [permission list in the README](https://github.com/isandrel/bookmark-scout#-permissions).

## Children

The extension is not directed at children and does not knowingly collect information from anyone.

## Changes

Changes to this policy will be published at this address with a new effective date, and noted in the release notes.

## Contact

_To be set by the maintainer (support email or issue tracker)._ Security issues: see [SECURITY.md](https://github.com/isandrel/bookmark-scout/blob/main/SECURITY.md).

The source code is public under the GNU Affero General Public License v3.0: <https://github.com/isandrel/bookmark-scout>.
