# Microsoft Edge Add-ons Submission Checklist

> **Submission is manual and requires explicit approval.** No agent or workflow uploads to Partner Center. Do not start this checklist until the maintainer has approved both the release and the Edge Add-ons submission for this version in writing.

## 0. Approval

- [ ] Maintainer approval for release `vX.Y.Z` recorded (link):
- [ ] Maintainer approval for Edge Add-ons submission of `vX.Y.Z` recorded (link):

## 1. Version and release package

Follow the release runbook in the root `AGENTS.md`.

- [ ] `apps/extension/package.json` `version` is `X.Y.Z` and higher than any version already on Edge Add-ons.
- [ ] The `Release Extension` workflow for `vX.Y.Z` finished green.
- [ ] Download `bookmark-scout-vX.Y.Z-edge.zip` from the GitHub release.
- [ ] Unzip it and confirm `manifest.json` has `"version": "X.Y.Z"` and the permissions in [`../permissions.md`](../permissions.md).

## 2. Manual smoke test in Edge

The full Chromium E2E suite runs against the Edge build as the required `Edge E2E` CI check. Still test the exact ZIP in a fresh Edge profile with synthetic bookmarks (`edge://extensions` → Developer mode → Load unpacked):

- [ ] **Bookmarks page override.** Open the browser's Favorites manager (`edge://favorites`). Record whether Edge shows the Bookmark Scout manager. If it does not, the manager and Tools sidebar are unreachable in Edge: use a reduced description (the Firefox text minus the Firefox-specific lines) and leave out the manager screenshots.
- [ ] Popup: search, folder tree, save the current page, delete and Undo.
- [ ] Side panel opens.
- [ ] Bookmark icons from the browser cache render after turning on Use the browser's icon cache and allowing it (optional `favicon`).
- [ ] Right-click a link: the save menu appears after turning on Right-Click Menu in Settings.
- [ ] Saving the current page from the side panel asks for tab access; declining saves nothing.
- [ ] Check Dead Links asks for website access on first run (if the manager is reachable).
- [ ] Options: AI is off by default.
- [ ] Settings sync when Edge sync is on.

## 3. Store listing (per language)

- [ ] Description: "Chrome Web Store and Edge Add-ons" sections of the 12 listings, adjusted by the override check above: [`en`](../listings/en.md), [`zh_CN`](../listings/zh_CN.md), [`es`](../listings/es.md), [`fr`](../listings/fr.md), [`pt_BR`](../listings/pt_BR.md), [`ru`](../listings/ru.md), [`id`](../listings/id.md), [`de`](../listings/de.md), [`ja`](../listings/ja.md), [`ko`](../listings/ko.md), [`it`](../listings/it.md), [`zh_TW`](../listings/zh_TW.md) (the order of `[locales] extension` in `config/project.toml`).
- [ ] Search terms: from the same files.
- [ ] Short description: from the package (`extDescription`).
- [ ] Store logo: 300x300 PNG. **Not prepared**; create it from `store/assets/icon-original.png` when needed.
- [ ] Screenshots (1280x800): all twelve from [`../screenshots/`](../screenshots/), or without the manager and Tools images if the override does not apply.
- [ ] Small promo tile 440x280 (optional): `promo-small-440x280.png`. Large promo tile 1400x560: not prepared.

## 4. Properties

- [ ] Category: decided by the maintainer (suggested: Productivity).
- [ ] Privacy policy required: yes. URL: `https://bookmark-scout.com/privacy/` (text: [`../privacy-policy.md`](../privacy-policy.md)). Confirm the page is live after the website deploys from `main`.
- [ ] Website `https://bookmark-scout.com`; support contact `https://bookmark-scout.com/support/` and `support@bookmark-scout.com` (confirm the alias reaches a monitored inbox).
- [ ] Mature content: no.

## 5. Availability

- [ ] Visibility: public or hidden, decided by the maintainer. Markets: all, unless decided otherwise.

## 6. Notes for certification

No test account is needed. Paste:

```text
No account or login is required. Click the toolbar icon to open the popup. The extension replaces the browser's bookmarks page with its own manager (edge://favorites); the Tools button at the top right opens the maintenance and AI tools.

AI features are off by default and need the reviewer's own provider API key (Settings > AI); a local Ollama server works without a key. All other features work without AI.

At install the extension asks only for bookmarks; storage, activeTab, sidePanel, scripting (the quick save notification in the tab a shortcut was pressed in), offscreen (a hidden page that parses HTML and builds AI requests for background work), and alarms (picking up background tasks) show no prompt. Everything else is optional and requested when the user turns on or runs the feature that needs it: tabs when saving the current page from the side panel (the toolbar popup uses activeTab), contextMenus when the user turns on Right-Click Menu in Settings (off by default), favicon when the user turns on "Use the browser's icon cache", website access (http/https) when the user runs Check Dead Links, Metadata Fetcher, Refresh Site Icons, Index Page Text, or Fetch Covers, turns on Read page content, or clicks Verify Service for an AI provider (that origin only), and <all_urls> only for Capture Covers While Browsing (off by default), which keeps pictures of bookmarked pages on the device.

nativeMessaging is optional and requested only when the user turns on "Allow local AI agents" (Settings > For developers, off by default). It lets AI agents the user runs on the same computer look up bookmarks through the open-source bookmark-scout-mcp program the user installs separately (packages/mcp-bridge in the repository); it never opens a network port and sends nothing to the developer. Every change an agent asks for waits for the user's approval in an extension window.

Source code: https://github.com/isandrel/bookmark-scout (AGPL-3.0).
```

Remove the second sentence of the first paragraph if the override check failed.

## 7. Submit and follow up

- [ ] Publish (manual, by the maintainer or with their explicit go-ahead for this step).
- [ ] Record the certification outcome and the listing URL, then add it to `README.md`, the docs installation page, and the website.
