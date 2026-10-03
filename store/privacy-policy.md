# Bookmark Scout Privacy Policy

> **Published** at <https://bookmark-scout.com/en/privacy/> (live once the website is next deployed from `main`), with Japanese and Korean versions at <https://bookmark-scout.com/ja/privacy/> and <https://bookmark-scout.com/ko/privacy/>. The website copy lives in `apps/website/messages/privacy/{en,ja,ko}.json` and the effective date in `config/site.config.toml` (`[legal] privacy_effective_date`). Keep this file, the three message files, and the date in step: change all of them together, and set a new effective date when the policy changes. Use the English URL as the privacy policy URL in every store.

**Effective date:** October 2, 2026
**Applies to:** the Bookmark Scout browser extension for Chrome, Microsoft Edge, and Firefox, version 0.2.0 and later; the website `bookmark-scout.com`; and the documentation site `docs.bookmark-scout.com`

This policy is also available in Japanese and Korean. If a translation differs from the English version, the English version applies.

## At a glance

- **No account, no server.** The extension runs inside your browser. There is nothing to sign up for and no Bookmark Scout server that receives your data.
- **No telemetry.** The extension has no analytics, no crash reporting, and no ads.
- **AI is off until you turn it on.** When you use an AI feature, the request goes from your browser directly to the provider you chose.
- **The developer receives nothing.** Your bookmarks, settings, and API keys never reach the developer.

## Summary

Bookmark Scout works inside your browser. It has no account, no analytics, no ads, and no server of its own. The developer does not receive your bookmarks or any other data from the extension. Data leaves your browser only when you use an optional feature that needs the network, and then it goes directly to the service you chose.

## What the extension reads

- **Your bookmarks**, to show, search, edit, move, delete, import, and export them.
- **The title and URL of the active tab**, so you can save the page you are viewing into a folder.
- **Site icons from your browser's own icon cache** (Chrome and Edge), to show next to bookmarks. No network request is made for them.
- **Site icons from the bookmarked websites**, only when you run Refresh Site Icons (see below).

The extension does not read the content of the pages you visit and has no content scripts.

## What the extension stores

Everything is kept in your browser's extension storage:

- **Settings** are kept in the browser's sync storage. If you have browser sync turned on, your browser may copy them to your other devices through your browser account (for example Google, Mozilla, or Microsoft). Settings include whether AI is on and which provider and model you chose, but not your API key.
- **AI provider settings**, including your API key, base URL, and any extra headers, are kept in local storage on this device only. They are not synced.
- **Tags, summaries, saved searches, recent folders, and recent searches** are kept in local storage on this device only. You can turn off recent searches in Settings.
- **Site icons** you save with Refresh Site Icons are kept in local storage on this device only, up to a size limit you can change in Settings. You can delete them at any time with Clear saved icons.

Uninstalling the extension removes the data it stored in this browser. Your bookmarks themselves stay in the browser.

## When data leaves your browser

### Optional AI features (off by default)

AI features run only after you turn them on in Settings and choose a provider. When you use one, the extension sends the data that feature needs directly from your browser to the provider endpoint you configured:

- Folder suggestions: the current page's title and URL, and the names of your bookmark folders.
- Auto-Tagging, Content Summarizer, and AI Folder Reorganization: the titles, URLs, and folder paths of the bookmarks in the scope you chose.
- Only if you turn on Read page content (off by default): folder suggestions, Auto-Tagging, and Content Summarizer also download each page by its URL, without your cookies, and send its main text. Pages on your local network are never downloaded. AI Folder Reorganization never sends page content.

If you also turn on Auto-recommend on Open (off by default), folder suggestions run each time you open the popup or side panel.

Your API key is sent to that provider to authenticate the request. The provider handles the data under its own terms and privacy policy, which you accept with them directly. Bookmark Scout does not send this data anywhere else. If you point the extension at a model running on your own computer (for example Ollama), the data stays on your machine.

### Dead link checks, title fetching, and site icons

Check Dead Links and Metadata Fetcher request the bookmarked pages themselves to see whether they load and what their titles are. Refresh Site Icons requests one bookmarked page for each website and then an icon file from that website's own domain, so bookmarks can show the site's icon. The browser asks for your permission the first time you run one of these tools. Requests go directly to each website, without cookies, and the results stay in the extension. No third-party icon service is used. As with any visit, the website can see your IP address and that the page or icon was requested.

### Exports

Bookmark exports and AI context exports are saved as files on your computer. Before saving, the extension can show a privacy review that lets you redact sensitive values. Nothing is uploaded.

## What the developer receives

Nothing. The extension does not send data to the developer, and there is no telemetry.

## Permissions

Bookmark Scout asks for `bookmarks`, `tabs`, `storage`, and `contextMenus`, and in Chrome and Edge also `favicon` and `sidePanel`. Website access is optional and is never granted at install:

- Access to all websites is requested when you first run Check Dead Links, Metadata Fetcher, or Refresh Site Icons.
- Access to one provider's site is requested when you click Verify Service or Refresh Models in the AI settings.

Each permission is explained in the [permission list in the README](https://github.com/isandrel/bookmark-scout#-permissions).

## This website and the docs site

This website, bookmark-scout.com, is a static site hosted on Cloudflare Pages. Cloudflare processes requests to deliver the site, including your IP address, under the [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/).

This website counts visits with [Umami Cloud](https://umami.is/), which works without cookies. Umami records the page address and title, the referring site, your browser, operating system, device type, screen size, language, and approximate location (country, region, and city). It uses your IP address to work out these values but does not store it. It groups page views into sessions with a hash whose salt changes at the start of every month, and it does not track you across other websites. Details are in [Umami's documentation](https://docs.umami.is/docs/metric-definitions).

The documentation site, docs.bookmark-scout.com, is also hosted on Cloudflare Pages and does not load any analytics.

Neither site has accounts or ads. Both serve their fonts themselves, so your browser does not contact Google Fonts.

## Children

Bookmark Scout is not directed at children. The extension does not collect information from anyone, and the websites collect only the anonymous visit statistics described above.

## Changes to this policy

Changes to this policy will be published on this page with a new effective date and noted in the release notes.

## Contact

For privacy questions and requests, email [privacy@bookmark-scout.com](mailto:privacy@bookmark-scout.com).

To report a security vulnerability, email [security@bookmark-scout.com](mailto:security@bookmark-scout.com) or follow the steps in [SECURITY.md](https://github.com/isandrel/bookmark-scout/blob/main/SECURITY.md). Please do not report vulnerabilities in a public issue.

The source code is public on [GitHub](https://github.com/isandrel/bookmark-scout) under the [AGPL-3.0](https://github.com/isandrel/bookmark-scout/blob/main/LICENSE) license.
