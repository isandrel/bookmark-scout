# Bookmark Scout Privacy Policy

> **Published** at <https://bookmark-scout.com/privacy/> (live once the website is next deployed from `main`), with a translation for every other website language at `https://bookmark-scout.com/<locale>/privacy/` (English has no language prefix; the old `/en/privacy/` redirects to it). The website copy lives in `apps/website/messages/privacy/<locale>.json` and the effective date in `config/project.toml` (`[legal] privacy_effective_date`). Keep this file, every message file, and the date in step: change all of them together, and set a new effective date when the policy changes. Use the English URL as the privacy policy URL in every store.

**Effective date:** October 22, 2026
**Applies to:** the Bookmark Scout browser extension for Chrome, Microsoft Edge, and Firefox, version 0.3.0 and later; the website `bookmark-scout.com`; and the documentation site `docs.bookmark-scout.com`

This policy is also available in other languages. If a translation differs from the English version, the English version applies.

## At a glance

- **No account, no server.** The extension runs inside your browser. There is nothing to sign up for and no Bookmark Scout server that receives your data.
- **We don't track what you do.** The extension has no analytics, no crash reporting, and no ads.
- **AI is off until you turn it on.** When you use an AI feature, the request goes from your browser directly to the provider you chose. With Chrome's built-in AI, it stays on your computer.
- **The developer receives nothing.** Your bookmarks, settings, and API keys never reach the developer.
- **The browser asks for one thing.** At install, Chrome and Edge ask only to “Read and change your bookmarks” (Firefox: “Read and modify bookmarks”). Other features ask only when you first use them. [What each one asks and why](https://docs.bookmark-scout.com/permissions).

## Summary

Bookmark Scout works inside your browser. It has no account, no analytics, no ads, and no server of its own. The developer does not receive your bookmarks or any other data from the extension. Data leaves your browser only when you use an optional feature that needs the network, and then it goes directly to the service you chose. The one exception without a network request is access for local AI agents (off by default), which passes bookmark data to the AI agents you run on your own computer.

Bookmark Scout's use of information received through browser extension APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## What the extension reads

- **Your bookmarks**, to show, search, edit, move, delete, import, and export them.
- **The title and URL of the active tab**, so you can save the page you are viewing into a folder.
- **Site icons from your browser's own icon cache** (Chrome and Edge), to show next to bookmarks. No network request is made for them.
- **Site icons from the bookmarked websites**, only when you run Refresh Site Icons (see below).
- **The text of bookmarked pages**, only when you run Index Page Text (see below), and **the text of the tab you are viewing**, only when you click Index this page's text in the popup.
- **The preview image of bookmarked pages**, only when you run Fetch Covers (see below), and **a picture of the tab you are viewing**, only when you click Use this view as the cover in the popup.
- **A picture of a bookmarked page you open**, only while Capture Covers While Browsing is on (off by default): when a bookmarked page finishes loading in the tab you are viewing, the extension takes a picture of that tab as the bookmark's cover. Never of a site you list under Never Capture These Sites, and in a private window only if you also turn on Also Capture in Private Windows (off by default) and your browser lets the extension run in private windows; those pictures stay on this device too. While it is on, the extension also checks the address of each page that loads in your active tab against your bookmarks, and keeps nothing of it but the cover of a bookmarked page.
- **A cover for the page you quick save**, only while Fetch Covers (off by default) and Save a Cover With Quick Save (off by default, and working only while Fetch Covers is also on) are both on: when you press a quick save shortcut, the extension reads the preview image the page names in that tab and downloads it only from the page's own site or a site you gave access to, or takes a picture of that tab, and keeps it as the new bookmark's cover without asking each time. Never in a private window and never of a site you list under Never Capture These Sites or Never Read These Sites; the cover stays on this device and is never sent anywhere.

The extension declares no content scripts and does not read the pages open in your tabs, except the text of the tab you are viewing when you click Index this page's text in the popup, which you see before it is kept, and the pictures of bookmarked pages that Capture Covers While Browsing takes while you have it on, which stay on this device. After you press a quick save shortcut, it shows a small notification in that one tab, which reads nothing from the page; with Fetch Covers and Save a Cover With Quick Save on, it also reads the page's preview image tags and may take a picture of that tab, as described above. Only when you turn on Read page content does it download pages separately, as described below. It also downloads the bookmarked pages you run Index Page Text on, and keeps their text on this device, and the head and preview image of the pages you run Fetch Covers on, keeping a small copy of the image on this device.

## What the extension stores

Everything is kept in your browser's extension storage:

- **Settings** you changed from their default are kept in the browser's sync storage; settings left at their default are not stored. If you have browser sync turned on, your browser may copy them to your other devices through your browser account (for example Google, Mozilla, or Microsoft). Settings include whether AI is on, but not your AI provider, model, or API key. (Version 0.3.2 and earlier also kept the AI provider and model you chose in synced settings.)
- **A few settings stay on this device only**, in local storage: the folder you chose for quick save, the site icon storage limit, AI activity recording, and Ask AI's web search. The settings for local AI agents are set on each device too.
- **Custom prompts** you write under Prompts in the AI Tools settings (each prompt's name, task, and text, and which prompt each task uses; up to 10) are kept in the browser's sync storage, so they sync through your browser account like settings. When an AI tool uses one of your prompts, its text is sent to your AI provider with the request.
- **About me**, the few words about yourself you can write in the AI settings (empty unless you write it), is kept in the browser's sync storage, so it syncs through your browser account like settings. While it has text, it is sent to your AI provider with your AI requests (see below).
- **The bookmark manager's table**: which columns are shown, their order, and the sort sync like settings. Column widths and page size stay on this device.
- **AI services** (each service's name, provider, and model) and their **connection settings** (API key, base URL, extra headers, and any provider-specific fields) are kept in local storage on this device only. They are not synced. A backup file holds each service's base URL and provider-specific fields, but never its API key or extra headers. Where the browser supports it (Chrome 140 and later), local storage is also closed to any script the extension places in a web page.
- **Model lists** fetched from your AI services (model names and ids) are kept in local storage on this device for 7 days.
- **AI activity**, only if you turn on Record requests under AI activity in the AI settings (off by default, set separately on each device): the last AI requests, with what was sent to your provider (or to Chrome's built-in AI) and what came back. They contain bookmark titles, URLs, and folder paths, and with Read page content on, page text. They also list each lookup a local AI agent made, with the name the agent gave. API keys, authentication headers, your extra headers, and keys in web addresses are removed before anything is stored. The log stays in local storage on this device, is never synced, and is deleted when you turn recording off.
- **Tags, summaries, saved searches, recent folders, and recent searches** are kept in local storage on this device only. You can turn off recent searches in Settings.
- **Site icons** you save with Refresh Site Icons are kept in local storage on this device only, up to a size limit you can change in Settings. You can delete them at any time with Clear saved icons.
- **Page text** you save with Index Page Text, or with Index this page's text in the popup (the text the tab showed you, kept only after you have seen it), is kept on this device only and used only by search. It is kept with how it was read (downloaded, or from your tab), the address it was read from, a fingerprint of the text, and whether it was cut short. It is deleted when you delete its bookmark, take back the extension's access to its website, or add its site to Never Read These Sites in Settings (a list of sites that syncs like your other settings). You can delete it at any time with Delete page text in Settings.
- **Covers** you save with Fetch Covers are small copies of each page's preview image, kept on this device only and shown only on the manager's cards. A cover can also be a picture of the tab you were viewing, taken only when you click Use this view as the cover in the popup and kept only after you have seen it, or, while Capture Covers While Browsing is on, taken when a bookmarked page loads in your active tab and kept without asking each time, or, while Save a Cover With Quick Save is on with Fetch Covers, taken when you quick save a page and kept without asking each time (the notification's Remove cover deletes it, and Undo removes it with the bookmark). Such a picture shows whatever the page displayed, so list private sites under Never Capture These Sites. Covers and their pictures are never sent anywhere. You can delete them at any time with Delete covers in Settings.
- **Your last quick save** (the page's title and URL and where it went), for Undo and Move to, is kept in session storage until the browser closes.
- **The bookmark manager's undo history** (the bookmarks you changed there, with copies of the ones you deleted and their tags and summaries), for Undo and Redo, is kept in session storage until the browser closes.
- **The bookmark change history** (what changed in your bookmarks and when, whether Bookmark Scout made the change or it was seen from elsewhere: titles, URLs, folders, and the outcome of each change), and a copy of every bookmark's title, URL, and folder as last seen (to tell what changed outside Bookmark Scout), are kept on this device only, in the browser's IndexedDB, for a limited time. They are never synced and never in the backup file. Recording changes made elsewhere can be turned off in Settings. Also a copy of each item Bookmark Scout deletes, with what was inside it and its tags and summary, so it can be restored from the History; removed with its change.
- **Background tasks** (a tool such as Check Dead Links, Metadata Fetcher, Refresh Site Icons, Index Page Text, AI Folder Reorganization, or a large Smart Rules run that keeps running after you close its page): the bookmarks it checks (titles, URLs, and folders) and each result, such as a page's title and description, a site's icon, a page's readable text, the moves the AI service suggests, or the reviewed changes it applies (which bookmark, and its new title, address, folder, or tags), are kept on this device only, in the browser's IndexedDB, so the task can go on after a restart and its results can be reviewed later. They are never synced and never in the backup file, and are removed after a limited time or when you delete the task under Background tasks.

Uninstalling the extension removes the data it stored in this browser. Your bookmarks themselves stay in the browser.

## When data leaves your browser

### Optional AI features (off by default)

AI features run only after you turn them on in Settings and choose a provider. When you use one, the extension sends the data that feature needs directly from your browser to the provider endpoint you configured:

- Folder suggestions (in the popup, in the side panel, or when you press the AI quick save shortcut): the current page's title and URL, and the names of your bookmark folders.
- Auto-Tagging, Content Summarizer, and AI Folder Reorganization: the titles, URLs, and folder paths of the bookmarks in the scope you chose.
- Auto-Tagging also sends the names of your most used tags (up to 200, without the bookmarks they belong to), so it reuses them instead of making near-duplicates, unless you turn off Send Existing Tags in the AI Tools settings.
- Only if you turn on Read page content (off by default): folder suggestions, Auto-Tagging, and Content Summarizer also download each page by its URL, without your cookies, and send its main text. Pages on your local network are never downloaded. AI Folder Reorganization never sends page content.
- Ask AI: your messages and the conversation so far, plus what the AI looks up to answer: matching bookmarks (titles, URLs, folder paths, dates added, saved tags and summaries), your folder names, the current page's title and URL, whether bookmarked links it checks still work, and, only with Read page content on, the text of bookmarked pages or the current page it reads. To check links, which it can do only after you allowed website access, Bookmark Scout requests those pages from your browser without cookies. If you turn on its web search (off by default), the provider also searches the web. The conversation is not saved; it ends when you close it.
- About me: if you write something under About me in the AI settings (empty by default), each AI feature in this list sends it to your provider with its requests.

If you also turn on Auto-recommend on Open (off by default), folder suggestions run each time you open the popup or side panel.

Your API key is sent to that provider to authenticate the request. The provider handles the data under its own terms and privacy policy, which you accept with them directly. Bookmark Scout does not send this data anywhere else. If you point the extension at a model running on your own computer (for example Ollama), the data stays on your machine.

**Chrome's built-in AI** (Chrome only): if you add Built-in AI as an AI service, folder suggestions run on Chrome's own model on your computer instead of a provider. The current page's title and URL, the names of the folders that best match it, and, with Read page content on, a short excerpt of its text go only to that model and never leave your computer. No API key is used. Chrome downloads the model from Google once, when you click Download the model in the AI settings; the download carries none of your data. The other AI features keep using a provider you set up.

### Local AI agents (off by default)

If you turn on Allow local AI agents in the settings for developers (off by default, set separately on each device), AI agents you run on your own computer, such as Claude Code, Codex, or Cursor, can look up your bookmarks through the bookmark-scout-mcp program you install there. The extension passes that program what an agent asks for: matching bookmarks (titles, URLs, folder paths, dates added, saved tags and summaries), your folder names, the current page's title and URL, whether bookmarked links still work (only after you allowed website access), and, only with Read page content on, the text of a bookmarked page or the current page. Agents change your bookmarks only if you also turn on Allow changes (off by default), and then each change waits for your approval in a Bookmark Scout window and can be undone in the bookmark manager. You can turn off each kind of lookup or change. Unless you turn it off, sensitive values in titles and web addresses (such as tokens, email addresses, and the parameters the Privacy Scanner lists) are replaced before they are passed on. The program talks to agents only on your computer, never over the network, and works without an AI provider set up in Bookmark Scout. What an agent does with what it reads, including sending it to its own AI provider, is governed by that agent and its provider.

### Dead link checks, title fetching, and site icons

Check Dead Links and Metadata Fetcher request the bookmarked pages themselves to see whether they load and what their titles are. Refresh Site Icons requests one bookmarked page for each website and then an icon file from that website's own domain, so bookmarks can show the site's icon. When you run one of these tools, the browser asks for your permission for the websites of the bookmarks in that run, or for all websites when there are more than 20, unless you allowed them before. Requests go directly to each website, without cookies, and the results stay in the extension. No third-party icon service is used. As with any visit, the website can see your IP address and that the page or icon was requested. Index Page Text requests each bookmarked page in its run (once for bookmarks that share an address, and, unless you turn off Skip Addresses with Sign-in Details or Secrets, not an address that holds a user name and password or a sensitive parameter such as a token) and keeps the readable text on this device, so search can find words inside the page; what it reads is never sent anywhere. It never requests a page on a site you list in Never Read These Sites, and a site that answers that it is busy is asked again only after the short wait it names, a few times at most. Fetch Covers requests the head of each bookmarked page in its run and the preview image the page names, only from the page's own website or a website you allowed, without cookies and without telling the image's website which page you bookmarked; it keeps a small copy of the image on this device, and showing cards requests nothing.

### Exports and backups

Bookmark exports and AI context exports are saved as files on your computer. A JSON bookmark export also holds the tags and summary of each bookmark in it. Before saving, the extension can show a privacy review that lets you redact sensitive values.

Back up settings, at the bottom of Settings, saves a backup file (`bookmark-scout-backup.json`) with the settings you changed, your custom prompts, your About me text, your AI services (name, provider, model, base URL, and any provider-specific fields), your saved searches, and the bookmark table's columns and sort. It never contains API keys or extra headers; after a restore, you enter them again in the AI settings. The file is not encrypted. Restore settings, next to it, restores it.

The extension uploads none of these files. They go only where you save them.

## What the developer receives

Nothing. The extension does not send data to the developer, and there is no telemetry.

## Permissions

When you install Bookmark Scout, the browser asks for one thing: “Read and change your bookmarks” in Chrome and Edge, or “Read and modify bookmarks” in Firefox (`bookmarks`). The other permissions granted at install show no prompt: `storage` for settings, `activeTab` to read the title and URL of the tab where you click the toolbar button or press a shortcut, `scripting` to show the quick save notification in that tab, `sidePanel` and `offscreen` (which runs the requests of AI quick save and AI Folder Reorganization, and reads page titles for the Metadata Fetcher, in a hidden extension page) in Chrome and Edge, and `contextMenus` in Firefox, which does not let extensions ask for it later. Everything else is optional. Bookmark Scout explains it first, and the browser asks only when you turn on or run the feature that needs it:

- “Read the icons of the websites you visit” (Chrome and Edge, `favicon`): when you click Show browser icons on Refresh Site Icons, or turn on Use the browser's icon cache in Settings.
- “Read your browsing history” (Firefox: “Access browser tabs”, `tabs`): when you save the current page or ask for folder suggestions from the side panel. The toolbar popup and the quick save shortcut do not need it.
- “Read and change your data on all example.com sites”, or “on a number of websites” (Firefox: “Access your data for sites in the example.com domain”): when you run Check Dead Links, Metadata Fetcher, or Refresh Site Icons, for the websites of the bookmarks in that run. Index Page Text and Fetch Covers ask the same way, for the websites of the bookmarks they read.
- “Read and change all your data on all websites” (Firefox: “Access your data for all websites”): when a run of those tools covers more than 20 sites, or when you turn on Read page content or Capture Covers While Browsing. For Capture Covers While Browsing, this access is what lets the extension take a picture of a tab without your click; the pictures stay on this device.
- “Read and change your data on api.example.com”, with your AI provider's address in place of api.example.com (Firefox: “Access your data for api.example.com”): when you click Verify Service or Refresh Models in the AI settings.
- “Communicate with cooperating native applications” (Firefox: “Exchange messages with programs other than Firefox”, `nativeMessaging`): when you turn on Allow local AI agents, to talk to the bookmark-scout-mcp program on your computer.
- In Firefox only, a prompt that says the developer wants to collect data, for what each feature shares: when you turn on AI (your API key, bookmarks, and the current page's title and URL), turn on Read page content (page text), or click Verify Service (your API key), all sent to your AI provider; and when you turn on Allow local AI agents, for the bookmark data the program on your computer receives. Here “the developer” means your AI provider or the program on your computer; Bookmark Scout receives nothing.
- The right-click menu (Chrome and Edge, `contextMenus`), when you turn on Right-Click Menu in Settings. The browser adds it without a prompt.

If you decline, the feature stays off. You can withdraw a permission in the browser's extension settings at any time, and the feature that needs it turns off.

The [permissions page in the docs](https://docs.bookmark-scout.com/permissions) lists each permission and why Bookmark Scout needs it.

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
