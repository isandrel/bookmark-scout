# Bookmark Scout Privacy Policy

> **Published** at <https://bookmark-scout.com/privacy/> (live once the website is next deployed from `main`), with a translation for every other website language at `https://bookmark-scout.com/<locale>/privacy/` (English has no language prefix; the old `/en/privacy/` redirects to it). The website copy lives in `apps/website/messages/privacy/<locale>.json` and the effective date in `config/project.toml` (`[legal] privacy_effective_date`). Keep this file, every message file, and the date in step: change all of them together, and set a new effective date when the policy changes. Use the English URL as the privacy policy URL in every store.

**Effective date:** October 11, 2026
**Applies to:** the Bookmark Scout browser extension for Chrome, Microsoft Edge, and Firefox, version 0.3.0 and later; the website `bookmark-scout.com`; and the documentation site `docs.bookmark-scout.com`

This policy is also available in other languages. If a translation differs from the English version, the English version applies.

## At a glance

- **No account, no server.** The extension runs inside your browser. There is nothing to sign up for and no Bookmark Scout server that receives your data.
- **No telemetry.** The extension has no analytics, no crash reporting, and no ads.
- **AI is off until you turn it on.** When you use an AI feature, the request goes from your browser directly to the provider you chose.
- **The developer receives nothing.** Your bookmarks, settings, and API keys never reach the developer.

## Summary

Bookmark Scout works inside your browser. It has no account, no analytics, no ads, and no server of its own. The developer does not receive your bookmarks or any other data from the extension. Data leaves your browser only when you use an optional feature that needs the network, and then it goes directly to the service you chose. The one exception without a network request is access for local AI agents (off by default), which passes bookmark data to the AI agents you run on your own computer.

Bookmark Scout's use of information received through browser extension APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## What the extension reads

- **Your bookmarks**, to show, search, edit, move, delete, import, and export them.
- **The title and URL of the active tab**, so you can save the page you are viewing into a folder.
- **Site icons from your browser's own icon cache** (Chrome and Edge), to show next to bookmarks. No network request is made for them.
- **Site icons from the bookmarked websites**, only when you run Refresh Site Icons (see below).

The extension declares no content scripts and does not read the pages open in your tabs. After you press a quick save shortcut, it shows a small notification in that one tab, which reads nothing from the page. Only when you turn on Read page content does it download pages separately, as described below.

## What the extension stores

Everything is kept in your browser's extension storage:

- **Settings** you changed from their default are kept in the browser's sync storage; settings left at their default are not stored. If you have browser sync turned on, your browser may copy them to your other devices through your browser account (for example Google, Mozilla, or Microsoft). Settings include whether AI is on, but not your AI provider, model, or API key. (Version 0.3.2 and earlier also kept the AI provider and model you chose in synced settings.)
- **A few settings stay on this device only**, in local storage: the folder you chose for quick save, the site icon storage limit, AI activity recording, and Ask AI's web search. The settings for local AI agents are set on each device too.
- **Custom prompts** you write under Prompts in the AI Tools settings (each prompt's name, task, and text, and which prompt each task uses; up to 10) are kept in the browser's sync storage, so they sync through your browser account like settings. When an AI tool uses one of your prompts, its text is sent to your AI provider with the request.
- **The bookmark manager's table**: which columns are shown, their order, and the sort sync like settings. Column widths and page size stay on this device.
- **AI services** (each service's name, provider, and model) and their **connection settings** (API key, base URL, extra headers, and any provider-specific fields) are kept in local storage on this device only. They are not synced. A backup file holds each service's base URL and provider-specific fields, but never its API key or extra headers. Where the browser supports it (Chrome 140 and later), local storage is also closed to any script the extension places in a web page.
- **Model lists** fetched from your AI services (model names and ids) are kept in local storage on this device for 7 days.
- **AI activity**, only if you turn on Record requests under AI activity in the AI settings (off by default, set separately on each device): the last AI requests, with what was sent to your provider and what came back. They contain bookmark titles, URLs, and folder paths, and with Read page content on, page text. They also list each lookup a local AI agent made, with the name the agent gave. API keys, authentication headers, your extra headers, and keys in web addresses are removed before anything is stored. The log stays in local storage on this device, is never synced, and is deleted when you turn recording off.
- **Tags, summaries, saved searches, recent folders, and recent searches** are kept in local storage on this device only. You can turn off recent searches in Settings.
- **Site icons** you save with Refresh Site Icons are kept in local storage on this device only, up to a size limit you can change in Settings. You can delete them at any time with Clear saved icons.
- **Your last quick save** (the page's title and URL and where it went), for Undo and Move to, is kept in session storage until the browser closes.
- **The bookmark manager's undo history** (the bookmarks you changed there, with copies of the ones you deleted and their tags and summaries), for Undo and Redo, is kept in session storage until the browser closes.

Uninstalling the extension removes the data it stored in this browser. Your bookmarks themselves stay in the browser.

## When data leaves your browser

### Optional AI features (off by default)

AI features run only after you turn them on in Settings and choose a provider. When you use one, the extension sends the data that feature needs directly from your browser to the provider endpoint you configured:

- Folder suggestions (in the popup, in the side panel, or when you press the AI quick save shortcut): the current page's title and URL, and the names of your bookmark folders.
- Auto-Tagging, Content Summarizer, and AI Folder Reorganization: the titles, URLs, and folder paths of the bookmarks in the scope you chose.
- Only if you turn on Read page content (off by default): folder suggestions, Auto-Tagging, and Content Summarizer also download each page by its URL, without your cookies, and send its main text. Pages on your local network are never downloaded. AI Folder Reorganization never sends page content.
- Ask AI: your messages and the conversation so far, plus what the AI looks up to answer: matching bookmarks (titles, URLs, folder paths, dates added, saved tags and summaries), your folder names, the current page's title and URL, whether bookmarked links it checks still work, and, only with Read page content on, the text of bookmarked pages or the current page it reads. To check links, which it can do only after you allowed website access, Bookmark Scout requests those pages from your browser without cookies. If you turn on its web search (off by default), the provider also searches the web. The conversation is not saved; it ends when you close it.

If you also turn on Auto-recommend on Open (off by default), folder suggestions run each time you open the popup or side panel.

Your API key is sent to that provider to authenticate the request. The provider handles the data under its own terms and privacy policy, which you accept with them directly. Bookmark Scout does not send this data anywhere else. If you point the extension at a model running on your own computer (for example Ollama), the data stays on your machine.

### Local AI agents (off by default)

If you turn on Allow local AI agents in the settings for developers (off by default, set separately on each device), AI agents you run on your own computer, such as Claude Code, Codex, or Cursor, can look up your bookmarks through the bookmark-scout-mcp program you install there. The extension passes that program what an agent asks for: matching bookmarks (titles, URLs, folder paths, dates added, saved tags and summaries), your folder names, the current page's title and URL, whether bookmarked links still work (only after you allowed website access), and, only with Read page content on, the text of a bookmarked page or the current page. Agents change your bookmarks only if you also turn on Allow changes (off by default), and then each change waits for your approval in a Bookmark Scout window and can be undone in the bookmark manager. You can turn off each kind of lookup or change. Unless you turn it off, sensitive values in titles and web addresses (such as tokens, email addresses, and the parameters the Privacy Scanner lists) are replaced before they are passed on. The program talks to agents only on your computer, never over the network, and works without an AI provider set up in Bookmark Scout. What an agent does with what it reads, including sending it to its own AI provider, is governed by that agent and its provider.

### Dead link checks, title fetching, and site icons

Check Dead Links and Metadata Fetcher request the bookmarked pages themselves to see whether they load and what their titles are. Refresh Site Icons requests one bookmarked page for each website and then an icon file from that website's own domain, so bookmarks can show the site's icon. When you run one of these tools, the browser asks for your permission for the websites of the bookmarks in that run, or for all websites when there are more than 20, unless you allowed them before. Requests go directly to each website, without cookies, and the results stay in the extension. No third-party icon service is used. As with any visit, the website can see your IP address and that the page or icon was requested.

### Exports and backups

Bookmark exports and AI context exports are saved as files on your computer. A JSON bookmark export also holds the tags and summary of each bookmark in it. Before saving, the extension can show a privacy review that lets you redact sensitive values.

Export in Settings saves a backup file (`bookmark-scout-backup.json`) with the settings you changed, your custom prompts, your AI services (name, provider, model, base URL, and any provider-specific fields), your saved searches, and the bookmark table's columns and sort. It never contains API keys or extra headers; after a restore, you enter them again in the AI settings. The file is not encrypted. Import in Settings restores it.

The extension uploads none of these files. They go only where you save them.

## What the developer receives

Nothing. The extension does not send data to the developer, and there is no telemetry.

## Permissions

At install, Bookmark Scout asks only for `bookmarks`, `storage`, `activeTab`, and `scripting` (which shows the quick save notification in the tab where you pressed the shortcut), plus `sidePanel` and `offscreen` (which runs AI quick save's request in a hidden extension page) in Chrome and Edge, and `contextMenus` in Firefox, which does not let extensions ask for it later. Everything else is optional and requested only when you turn on or run the feature that needs it:

- Access to your tabs (`tabs`), when you save the current page or ask for folder suggestions from the side panel. The toolbar popup does not need it.
- The right-click menu (`contextMenus`, Chrome and Edge), when you turn on Context Menu in Settings.
- The browser's icon cache (`favicon`, Chrome and Edge), when you click Show browser icons on Refresh Site Icons or turn on Use the browser's icon cache in Settings.
- Access to the websites of the bookmarks a run checks, when you run Check Dead Links, Metadata Fetcher, or Refresh Site Icons (access to all websites when a run covers more than 20 sites), and access to all websites when you turn on Read page content.
- Access to one provider's site, when you click Verify Service or Refresh Models in the AI settings.
- In Firefox, your consent to share data with your AI provider, for what each feature sends: when you turn on AI (your API key, bookmarks, and the current page's title and URL), turn on Read page content (page text), or click Verify Service (your API key).
- Communicating with the bookmark-scout-mcp program on your computer (`nativeMessaging`), when you turn on Allow local AI agents; in Firefox, together with your consent to share bookmark data with it.

If you decline, the feature stays off. You can withdraw a permission in the browser's extension settings at any time, and the feature that needs it turns off.

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
