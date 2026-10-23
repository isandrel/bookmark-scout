# Chrome Web Store dashboard

Read this before working in the Developer Dashboard. The maintainer approves each outward step: saving drafts, submitting, removing images, uploading packages, and opting into Verified CRX. Account settings (contact email, trader status) are theirs to change.

## Where every field comes from

| Dashboard field | Source in the repository |
| --- | --- |
| Description (each language) | `store/listings/<folder>.md`, section "Full description: Chrome Web Store and Edge Add-ons" |
| Title and summary | `extName` and `extDescription` in `apps/extension/public/_locales/*/messages.json` (package only) |
| Category | Tools |
| Store icon | `store/assets/store-icon-128.png` (padded; not the packaged `icon-128.png`) |
| Screenshots, in order | The Chrome Web Store order in `store/README.md` (five at most) |
| Small promo tile | `store/screenshots/promo-small-440x280.png` |
| Marquee tile | `store/assets/marquee-1400x560.png` |
| Homepage, support, privacy URLs | `site.url` values in `config/` (`/support/`, `/privacy/`; the old `/en/...` URLs redirect) |
| Single purpose, permission justifications, remote code | `store/permissions.md` |
| Data usage | `store/privacy-disclosures.md`, which records the maintainer's choice and why |
| Test instructions (500 characters) | Write fresh: no login, popup and manager entry points, AI off by default, what leaves the device, source link |

Extract a field from the Markdown with a small Bun script. Do not retype it. After any dashboard edit, update the repository copy in the same session, so the two never drift.

## Shipping a new version

1. Release by following "Release" in the skill (tag only on explicit request, after its preflight checks).
2. Download `bookmark-scout-vX.Y.Z-chrome.zip` from the GitHub release. Check its `manifest.json` version and permissions against `store/permissions.md`.
3. Package tab: "Upload new package". Confirm that the Package tab shows the new version and the expected permissions.
4. If listing text, permissions, or data flows changed, update those tabs (see the table above) and run the store policy checklist in `store/checklists/chrome-web-store.md`.
5. Submit only with the maintainer's go-ahead. The submit dialog's auto-publish box is checked by default. Unchecked, the approved version must be published within 30 days.

When `CWS_SUBMIT` is `true`, the release tag also uploads and submits the Chrome zip (the `submit-chrome` job, after its environment reviewer approves), so steps 2 and 3 become checking the job's log and the Package tab. Setup and the off switch are in "Automated submission" in `store/checklists/chrome-web-store.md`. Dashboard-only changes still have to be made before tagging.

Verified CRX uploads are off. Turning them on later requires every update to be the CI-signed `.crx` (secret `CRX_PRIVATE_KEY` in the release workflow). The public key must come from that same private key, and the key needs a backup first.

New languages: the dashboard adds a listing language for each `_locales` folder in the uploaded package; paste each one's description from `store/listings/<folder>.md` after the release that contains the folder. Edge needs each language's description and images entered by hand.

## Lessons from the first submission (0.3.0 to 0.3.1)

- **Rejected for Yellow Argon** because the description listed nine AI provider names. Describe provider kinds, not brands, in every language and in both listing blocks.
- **The policy audit found gaps that review would have flagged.** The site needed the Limited Use statement, the AI toggle needed to say what is sent in every browser (it had only said so in Firefox), and the privacy policy had to stop claiming the extension never reads pages.
- **Data usage was left unchecked by the maintainer's choice.** The test instructions explain that the developer receives nothing and that AI requests go straight to the user's provider. If review flags undisclosed data, check Authentication information, Web history, and Website content.
- **The Remote code radio came pre-set to "Yes".** Set it to "No".
- **The dashboard showed no justification field for `optional_host_permissions`.** The text in `store/permissions.md` is ready if it ever appears.
- **Re-uploading the same version over an unpublished draft works.** Listing-only fixes after a rejection need no new package.
