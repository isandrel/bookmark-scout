# Firefox Add-ons (AMO): what Mozilla's Publish guidance asks of this add-on

Read with `store/checklists/firefox-amo.md`, which holds the fields to paste. Checked against [Extension Workshop's Publish section](https://extensionworkshop.com/documentation/publish/) on 2026-11-01; recheck the pages linked here when a submission is near, because Mozilla edits them.

## Package and manifest

- One ZIP with `manifest.json` at its root, at most 200 MB ([Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)). `bun run zip:firefox` makes it; `web-ext build` is Mozilla's tool for the same.
- Manifest V3 with `browser_specific_settings.gecko.id` (required for MV3) and `strict_min_version` 140 (built-in data consent). `build/browser-targets.toml` sets V3 for every browser.
- No `gecko_android`: AMO copies compatibility from the manifest, marks an add-on with `gecko_android` as compatible with Android, and locks that setting ([Firefox version compatibility](https://extensionworkshop.com/documentation/publish/version-compatibility/)). Firefox for Android has no bookmarks API. addons-linter then warns `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`; the reviewer notes explain it. Avoid `strict_max_version`.
- Signing and publishing take up to 24 hours, longer when a version is picked for manual review, and any version can be reviewed manually later ([Signing and distribution overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)).

## Source code and libraries

- Every version needs its sources ZIP and build instructions that reproduce the package exactly; reviewers diff their build with the package ([Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)). `apps/extension/SOURCE_CODE_REVIEW.md` and `references/reproducible-build.md`.
- Third-party libraries must be unmodified release versions; reviewers check them by checksum. Dependencies declared in `package.json` from the public registry count as the required links, so the reviewer notes say every library comes from the workspace `package.json` files and `bun.lock`, with no private packages ([Third Party Library Usage](https://extensionworkshop.com/documentation/publish/third-party-library-usage/)).
- Build tools must be open source, run locally, and still be maintained.

## Policies

- The policies effective 2026-12-01 ([preview](https://extensionworkshop.com/documentation/publish/add-on-policies-preview-2026-12/)) keep what this add-on already follows: no remote code, CSP not relaxed, encrypted transmission, unmodified libraries, data collection declared in the manifest for Firefox 140+, native messaging data under the same consent rules, and no data from private browsing stored (Ask AI chats and recent searches are not kept in private windows).
- A privacy policy is required because AI features send data off the device; link it on the listing ([Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)).

## Listing

- Summary at most 250 characters per language (`scripts/store-field-limits.test.ts` checks every listing); categories at most two; a support email at least; one screenshot set, 1280x800 recommended, captions per language; no text drawn in screenshots; desktop platforms only ([Create an appealing listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/)).
- Name: "<Name> for Firefox" is the allowed form if Firefox appears in it ([Add-on Policies FAQ](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/)).
- Set a display name on the AMO profile; the Mozilla account's name does not carry over ([Developer accounts](https://extensionworkshop.com/documentation/publish/developer-accounts/)).

## After release

- AMO has no beta channel: a beta is a self-distributed (unlisted) build with its own `update_url` ([Distribute pre-release versions](https://extensionworkshop.com/documentation/publish/distribute-pre-release-versions/)).
- A bad listed version can be rolled back to the approved version before it, republished under a higher version number, from Status & Versions or the API ([Version rollback](https://extensionworkshop.com/documentation/publish/version-rollback/)).
- Updates go to the existing add-on's page so AMO treats them as updates; unrelated changes in a resubmission slow review.
