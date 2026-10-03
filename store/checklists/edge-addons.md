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

- [ ] **Bookmarks page override.** Open the browser's Favorites manager (`edge://favorites`, Ctrl+Shift+O). Record whether Edge shows the Bookmark Scout manager. If it does not, the manager and Tools sidebar are unreachable in Edge: use a reduced description (the Firefox text minus the Firefox-specific lines) and leave out the manager screenshots.
- [ ] Popup: search, folder tree, save the current page, delete and Undo.
- [ ] Side panel opens.
- [ ] Bookmark icons render (`favicon` API).
- [ ] Right-click a link: the save menu appears.
- [ ] Check Dead Links asks for website access on first run (if the manager is reachable).
- [ ] Options: AI is off by default.
- [ ] Settings sync when Edge sync is on.

## 3. Store listing (per language)

- [ ] Description: "Chrome Web Store and Edge Add-ons" sections of [`en.md`](../listings/en.md), [`ja.md`](../listings/ja.md), [`ko.md`](../listings/ko.md), adjusted by the override check above.
- [ ] Search terms: from the same files.
- [ ] Short description: from the package (`extDescription`).
- [ ] Store logo: 300x300 PNG. **Not prepared**; create it from `apps/extension/public/icon-original.png` when needed.
- [ ] Screenshots (1280x800): all eight from [`../screenshots/`](../screenshots/), or without the manager and Tools images if the override does not apply.
- [ ] Small promo tile 440x280 (optional): `promo-small-440x280.png`. Large promo tile 1400x560: not prepared.

## 4. Properties

- [ ] Category: decided by the maintainer (suggested: Productivity).
- [ ] Privacy policy required: yes. URL: `https://bookmark-scout.com/en/privacy/` (text: [`../privacy-policy.md`](../privacy-policy.md)). Confirm the page is live after the website deploys from `main`.
- [ ] Website `https://bookmark-scout.com`; support contact `https://bookmark-scout.com/en/support/` and `support@bookmark-scout.com` (confirm the alias reaches a monitored inbox).
- [ ] Mature content: no.

## 5. Availability

- [ ] Visibility: public or hidden, decided by the maintainer. Markets: all, unless decided otherwise.

## 6. Notes for certification

No test account is needed. Paste:

```text
No account or login is required. Click the toolbar icon to open the popup. The extension replaces the browser's bookmarks page with its own manager (edge://favorites); the Tools button at the top right opens the maintenance and AI tools.

AI features are off by default and need the reviewer's own provider API key (Settings > AI); a local Ollama server works without a key. All other features work without AI.

Website access (http/https) is an optional permission requested only when the user runs Check Dead Links or Metadata Fetcher, or clicks Verify Service for an AI provider (that origin only).

Source code: https://github.com/isandrel/bookmark-scout (AGPL-3.0).
```

Remove the second sentence of the first paragraph if the override check failed.

## 7. Submit and follow up

- [ ] Publish (manual, by the maintainer or with their explicit go-ahead for this step).
- [ ] Record the certification outcome and the listing URL, then add it to `README.md`, the docs installation page, and the website.
