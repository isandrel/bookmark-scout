---
name: extension-cws-submission
description: Submit or update Bookmark Scout in the Chrome Web Store Developer Dashboard - fill the listing, privacy, and test-instruction tabs from the repository's store copy, refresh screenshots and promo art, upload the release ZIP, audit against store policy, submit, and fix rejections. Use whenever the user is working in the Chrome Web Store dashboard for this extension, asks to upload a new version there, to recapture store screenshots, or pastes a Chrome Web Store rejection, even if they only say "update the store" or "publish 0.x.y to Chrome".
---

# Chrome Web Store submission (Bookmark Scout)

This is the Chrome Web Store step that comes after `extension-store-release`. That skill prepares manifests, release tags, and listing copy. This one puts them into the dashboard. For general dashboard knowledge, such as field limits, policy, rejection codes, and how to drive the dashboard in the user's Chrome over CDP, use the `chrome-web-store-submission` skill (in the user's `browser-extension-publishing` plugin) if it is installed. The essentials are repeated here so this skill works without it.

The maintainer approves each outward step: saving drafts, submitting, removing images, uploading packages, and opting into Verified CRX. Account settings (contact email, trader status) are theirs to change.

## Where every field comes from

| Dashboard field | Source in the repository |
| --- | --- |
| Description (en, ja, ko) | `store/listings/{en,ja,ko}.md`, section "Full description: Chrome Web Store and Edge Add-ons" |
| Title and summary | `extName` and `extDescription` in `apps/extension/public/_locales/*/messages.json` (package only) |
| Category | Tools |
| Store icon | `store/assets/store-icon-128.png` (padded; not the packaged `icon-128.png`) |
| Screenshots, in order | `store/screenshots/01-popup-light`, `02-manager-light`, `03-tools-duplicates-light`, `04-options-ai-light`, `06-manager-dark` |
| Small promo tile | `store/screenshots/promo-small-440x280.png` |
| Marquee tile | `store/assets/marquee-1400x560.png` |
| Homepage, support, privacy URLs | `site.url` values in `config/` (`/en/support/`, `/en/privacy/`) |
| Single purpose, permission justifications, remote code | `store/permissions.md` |
| Data usage | `store/privacy-disclosures.md`, which records the maintainer's choice and why |
| Test instructions (500 characters) | Write fresh: no login, popup and manager entry points, AI off by default, what leaves the device, source link |

Extract a field from the Markdown with a small Bun script. Do not retype it. After any dashboard edit, update the repository copy in the same session, so the two never drift.

## Shipping a new version

1. Land all PRs, bump `version` in `package.json` and `apps/extension/package.json`, and add a `CHANGELOG.md` entry. Tag and release by following `extension-store-release` (tag only on explicit request, after its preflight checks).
2. Download `bookmark-scout-vX.Y.Z-chrome.zip` from the GitHub release. Check its `manifest.json` version and permissions against `store/permissions.md`.
3. Package tab: "Upload new package". Confirm that the Package tab shows the new version and the expected permissions.
4. If listing text, permissions, or data flows changed, update those tabs (see the table above) and run the general policy checklist.
5. Submit only with the maintainer's go-ahead. The submit dialog's auto-publish box is checked by default. Unchecked, the approved version must be published within 30 days.

Verified CRX uploads are off. Turning them on later requires every update to be the CI-signed `.crx` (secret `CRX_PRIVATE_KEY` in the release workflow). The public key must come from that same private key, and the key needs a backup first.

## Refreshing screenshots

Recapture whenever the popup, manager, Tools, or Options UI changes. Run from the repository root:

```bash
bunx nx run extension:build:chrome
Q=~/.cache/bookmark-scout-qa
S=.agents/skills/extension-cws-submission/scripts
bun $S/prepare-granted-build.ts apps/extension/dist/chrome-mv3 $Q/store-ext
rm -rf $Q/store-shots
EXT=$Q/store-ext QA_DIR=$Q RUN=store-shots bun .agents/skills/extension-exploratory-qa/scripts/explore-run.ts $S/capture-store-screenshots.ts
bun $S/compose-store-screenshots.ts $Q/store-shots/shots $Q/store-ext $Q/store-shots/final
```

The capture seeds synthetic bookmarks, saves real site icons with Refresh Site Icons (the granted build skips the permission prompts), stubs the popup's active tab to a public page, and captures light and dark. The compose step frames the popup pair and writes eight 1280×800 RGB PNGs with no alpha. Look at every image, then copy `final/*.png` to `store/screenshots/`, `apps/website/public/screenshots/`, and `apps/docs/public/screenshots/`. Update "How they were made" in `store/README.md`, run `nx run website:verify` and the docs verify, and open a PR.

Promo art (icon, tiles, logo master) is not captured. Its prompts, inputs, and output paths are in `store/ai-asset-prompts.md`. Never use AI-generated UI as screenshots.

## Lessons from the first submission (0.3.0 to 0.3.1)

- **Rejected for Yellow Argon** because the description listed nine AI provider names. Describe provider kinds, not brands, in every language and in both listing blocks.
- **The policy audit found gaps that review would have flagged.** The site needed the Limited Use statement, the AI toggle needed to say what is sent in every browser (it had only said so in Firefox), and the privacy policy had to stop claiming the extension never reads pages.
- **Data usage was left unchecked by the maintainer's choice.** The test instructions explain that the developer receives nothing and that AI requests go straight to the user's provider. If review flags undisclosed data, check Authentication information, Web history, and Website content.
- **The Remote code radio came pre-set to "Yes".** Set it to "No".
- **The dashboard showed no justification field for `optional_host_permissions`.** The text in `store/permissions.md` is ready if it ever appears.
- **Re-uploading the same version over an unpublished draft works.** Listing-only fixes after a rejection need no new package.
