# Chrome Web Store Submission Checklist

> **Submission requires explicit approval.** The only automated path is the `submit-chrome` job in `.github/workflows/release-extension.yml` (see [Automated submission](#automated-submission)), which is off until the maintainer turns it on and waits for an environment reviewer. Listing, privacy, and screenshot changes stay manual. Do not start this checklist until the maintainer has approved both the release and the store submission for this version in writing (issue, PR comment, or chat).

## 0. Approval

- [ ] Maintainer approval for release `vX.Y.Z` recorded (link):
- [ ] Maintainer approval for Chrome Web Store submission of `vX.Y.Z` recorded (link):

## 1. Version and release package

Follow the "Release" section of `.agents/skills/extension-store-release/SKILL.md`. Releasing is its own approval gate.

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
- [ ] Right-click a link: no save menu until Right-Click Menu is turned on in Settings; turning it on adds the menu without a prompt.
- [ ] Turning on Use the browser's icon cache asks to read site icons; icons from the cache appear only after allowing it.
- [ ] Turning on Capture Covers While Browsing (Settings > Page Details, with Fetch Covers on) explains it first, then asks to "Read and change all your data on all websites"; declining leaves it off.
- [ ] Options: AI is off by default; AI tools in the Tools sidebar say to turn on AI.

## 3. Store listing tab

- [ ] Description: English from [`../listings/en.md`](../listings/en.md) ("Chrome Web Store and Edge Add-ons"). Add each other language from its listing: [`en`](../listings/en.md), [`zh_CN`](../listings/zh_CN.md), [`es`](../listings/es.md), [`fr`](../listings/fr.md), [`pt_BR`](../listings/pt_BR.md), [`ru`](../listings/ru.md), [`id`](../listings/id.md), [`de`](../listings/de.md), [`ja`](../listings/ja.md), [`ko`](../listings/ko.md), [`it`](../listings/it.md), [`zh_TW`](../listings/zh_TW.md) (the order of `[locales] extension` in `config/project.toml`).
- [ ] Name and summary come from the package (`extName`, `extDescription`); check they display correctly in all 12 languages.
- [ ] Category: decided by the maintainer (suggested: Productivity → Tools).
- [ ] Language: English as default; the other 11 listed.
- [ ] Store icon: 128x128, from the package (`icon-128.png`).
- [ ] Screenshots (up to 5, 1280x800): `01-popup-light.png`, `02-quick-save-light.png`, `07-manager-cards-light.png`, `03-manager-light.png`, `04-tools-duplicates-light.png` from [`../screenshots/`](../screenshots/).
- [ ] Small promo tile 440x280: `promo-small-440x280.png`.
- [ ] Homepage URL `https://bookmark-scout.com` and support URL `https://bookmark-scout.com/support/`. Official URL (verified site): decided by the maintainer.

## 4. Privacy practices tab

All answers are in [`../privacy-disclosures.md`](../privacy-disclosures.md) and [`../permissions.md`](../permissions.md).

- [ ] Single purpose description pasted.
- [ ] One justification per permission the Chrome manifest declares, pasted from its block under [Per-permission justification](../permissions.md#per-permission-justification): every entry of the Chrome column of its built manifests table (`permissions`, `optional_permissions`, and optional host access, `<all_urls>` included). The dashboard asks for each one it finds in the uploaded package; a permission with no block there means `permissions.md` is behind the manifest.
- [ ] Remote code: "No".
- [ ] Data usage categories chosen by the maintainer (suggested: Authentication information, Web history, Website content).
- [ ] The three certifications checked.
- [ ] Privacy policy URL: `https://bookmark-scout.com/privacy/` (text: [`../privacy-policy.md`](../privacy-policy.md)). Confirm the page is live after the website deploys from `main`.

## 5. Reviewer notes ("Test instructions")

No test account or login is needed. The dashboard field (Additional instructions) takes at most 500 characters, so this is the short form; the permission details are in [`../permissions.md`](../permissions.md). Paste at the next submission (469 characters); it replaces the text entered on 2026-10-18, which did not name `<all_urls>`. Record the date here once it is in the dashboard:

```text
No login needed. Popup: toolbar icon. Manager: chrome://bookmarks (Tools, top right). Alt+Shift+S quick-saves the page. AI is off by default; test it free with Chrome's built-in AI (Settings > AI), Ollama, or your own key. Nothing goes to the developer; with AI on, titles and URLs go straight to the user's provider. Optional permissions are asked only when used; <all_urls> only for opt-in Capture Covers While Browsing (pictures of bookmarked pages, kept on device).
```

## 6. Account and distribution

- [ ] Developer account verified, contact email confirmed, and trader or non-trader status declared (needed for EU listings).
- [ ] Visibility: public or unlisted, decided by the maintainer. Regions: all, unless decided otherwise.
- [ ] Choose "Defer publishing" so the approved version is published manually after review passes.

## 7. Submit and follow up

- [ ] Submit for review (manual, by the maintainer or with their explicit go-ahead for this step).
- [ ] Record the review outcome and the listing URL.
- [ ] After publication, add the store link to `README.md`, the docs installation page, and the website download section.

## Automated submission

After the first listing is live, a release tag can upload the Chrome zip and submit it for review with `wxt submit` (Chrome Web Store API v2, service account). The job runs only when the repository variable `CWS_SUBMIT` is `true`, uses the zip attached to the GitHub release, and defaults to `STAGED_PUBLISH` (an approved version waits until it is published from the dashboard). Dashboard-only changes, such as listing text, screenshots, and privacy answers, still have to be made by hand before tagging.

One-time setup, by the maintainer:

1. Turn on 2-Step Verification for the publisher's Google account. Publishing through the API requires it.
2. In Google Cloud Console, create or choose a project, enable the **Chrome Web Store API**, create a service account, and create a JSON key for it.
3. In the Developer Dashboard, under **Account**, add the service account's email. A publisher can have only one.
4. Copy the publisher ID from the dashboard URL (`/devconsole/<publisher-id>/...`).
5. From the repository root, preview the setup, then run it. It creates the `chrome-web-store` environment, stores the private key as an environment secret (passed on stdin, never printed), and sets the variables:
   ```bash
   bun scripts/setup-chrome-web-store-ci.ts --key <key.json> --publisher-id <id> --extension-id <id> --dry-run
   bun scripts/setup-chrome-web-store-ci.ts --key <key.json> --publisher-id <id> --extension-id <id> --enable --dry-run-submit
   ```
6. In the repository settings (Environments, `chrome-web-store`), add yourself as a required reviewer so each submission waits for approval, and limit deployment tags to `v*`. The script never changes these rules once the environment exists. (Set up on 2026-10-09.)
7. Delete the local key file, or keep it only in a password manager.
8. On the next release, the job runs `wxt submit --dry-run`, which checks authentication only. When it passes, rerun the script without `--dry-run-submit`.

To review the listing before review starts, set the repository variable `CWS_UPLOAD_ONLY` to `true` (with `CWS_SUBMIT_DRY_RUN` `false`): the job then runs `wxt submit --chrome-skip-submit-review`, which uploads the zip as a draft and stops. Update the listing in the dashboard, then press **Submit for review** there.

If you manually change the item's visibility in the dashboard, publish once from the dashboard before the API can publish again. To turn automation off, set `CWS_SUBMIT` to `false`. To rotate the key, create a new one, rerun the script, and delete the old key in Google Cloud.
