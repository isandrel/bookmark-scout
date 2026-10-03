# Chrome Web Store Submission Checklist

> **Submission is manual and requires explicit approval.** No agent or workflow uploads to the Chrome Web Store. Do not start this checklist until the maintainer has approved both the release and the store submission for this version in writing (issue, PR comment, or chat).

## 0. Approval

- [ ] Maintainer approval for release `vX.Y.Z` recorded (link):
- [ ] Maintainer approval for Chrome Web Store submission of `vX.Y.Z` recorded (link):

## 1. Version and release package

Follow the release runbook in the root `AGENTS.md` ("Release publishing"). Releasing is its own approval gate.

- [ ] `apps/extension/package.json` `version` is `X.Y.Z` and is higher than the version currently published on the Chrome Web Store.
- [ ] `main` is clean and green, and the tag does not exist yet: `git ls-remote --tags origin vX.Y.Z`.
- [ ] The `Release Extension` workflow for `vX.Y.Z` finished green.
- [ ] Download `bookmark-scout-vX.Y.Z-chrome.zip` from the GitHub release. Upload this ZIP, not the `.crx`; the store signs packages itself.
- [ ] Unzip it and confirm `manifest.json` has `"version": "X.Y.Z"` and the same `permissions`, `optional_permissions`, `optional_host_permissions`, and `chrome_url_overrides` as [`../permissions.md`](../permissions.md). If anything changed, update the justifications first.

## 2. Manual smoke test of the exact ZIP

Automated Chromium tests cover most flows, but test the uploaded artifact once in a fresh Chrome profile with synthetic bookmarks:

- [ ] Install shows only "Read and change your bookmarks".
- [ ] Popup: search, folder tree, save the current page (no prompt: the toolbar button grants `activeTab`), delete and Undo.
- [ ] Side panel opens from Chrome's side panel menu. Saving the current page there explains tab access, then Chrome asks "Read your browsing history"; declining saves nothing.
- [ ] `chrome://bookmarks` opens the Bookmark Scout manager; the Tools sidebar opens.
- [ ] Check Dead Links asks for website access on first run, and declining scans nothing.
- [ ] Right-click a link: no save menu until Context Menu is turned on in Settings; turning it on adds the menu without a prompt.
- [ ] Turning on Use the browser's icon cache asks to read site icons; icons from the cache appear only after allowing it.
- [ ] Options: AI is off by default; AI tools in the Tools sidebar say to turn on AI.

## 3. Store listing tab

- [ ] Description: English from [`../listings/en.md`](../listings/en.md) ("Chrome Web Store and Edge Add-ons"). Add Japanese and Korean from [`ja.md`](../listings/ja.md) and [`ko.md`](../listings/ko.md) for those locales.
- [ ] Name and summary come from the package (`extName`, `extDescription`); check they display correctly in en, ja, and ko.
- [ ] Category: decided by the maintainer (suggested: Productivity → Tools).
- [ ] Language: English as default; Japanese and Korean listed.
- [ ] Store icon: 128x128, from the package (`icon-128.png`).
- [ ] Screenshots (up to 5, 1280x800): `01-popup-light.png`, `02-manager-light.png`, `03-tools-duplicates-light.png`, `04-options-ai-light.png`, `06-manager-dark.png` from [`../screenshots/`](../screenshots/).
- [ ] Small promo tile 440x280: `promo-small-440x280.png`.
- [ ] Homepage URL `https://bookmark-scout.com` and support URL `https://bookmark-scout.com/en/support/`. Official URL (verified site): decided by the maintainer.

## 4. Privacy practices tab

All answers are in [`../privacy-disclosures.md`](../privacy-disclosures.md) and [`../permissions.md`](../permissions.md).

- [ ] Single purpose description pasted.
- [ ] One justification per permission: `bookmarks`, `storage`, `activeTab`, `sidePanel`, the optional `tabs`, `favicon`, and `contextMenus`, and the optional host permissions.
- [ ] Remote code: "No".
- [ ] Data usage categories chosen by the maintainer (suggested: Authentication information, Web history, Website content).
- [ ] The three certifications checked.
- [ ] Privacy policy URL: `https://bookmark-scout.com/en/privacy/` (text: [`../privacy-policy.md`](../privacy-policy.md)). Confirm the page is live after the website deploys from `main`.

## 5. Reviewer notes ("Test instructions")

No test account or login is needed. Paste:

```text
No account or login is required. Install, then click the toolbar icon to open the popup, or open chrome://bookmarks for the bookmarks manager (the Tools button at the top right opens the maintenance and AI tools).

AI features are off by default and need the reviewer's own provider API key (Settings > AI). They can be reviewed with a local Ollama server, which needs no key. All other features work without AI.

At install the extension asks only for bookmarks, storage, activeTab, and sidePanel. Everything else is optional and requested when the user turns on or runs the feature that needs it: tabs when saving the current page from the side panel (the toolbar popup uses activeTab), contextMenus when the user turns on Context Menu in Settings (off by default), favicon when the user turns on "Use the browser's icon cache", and website access (http/https) when the user runs Check Dead Links, Metadata Fetcher, or Refresh Site Icons, turns on Read page content, or clicks Verify Service for an AI provider (that origin only).

Source code: https://github.com/isandrel/bookmark-scout (AGPL-3.0).
```

## 6. Account and distribution

- [ ] Developer account verified, contact email confirmed, and trader or non-trader status declared (needed for EU listings).
- [ ] Visibility: public or unlisted, decided by the maintainer. Regions: all, unless decided otherwise.
- [ ] Choose "Defer publishing" so the approved version is published manually after review passes.

## 7. Submit and follow up

- [ ] Submit for review (manual, by the maintainer or with their explicit go-ahead for this step).
- [ ] Record the review outcome and the listing URL.
- [ ] After publication, add the store link to `README.md`, the docs installation page, and the website download section.
