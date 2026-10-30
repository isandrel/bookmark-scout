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
| Test instructions | Section 5, "Reviewer notes", in `store/checklists/chrome-web-store.md`: no login, popup and manager entry points, AI off by default, what leaves the device, source link |

Extract a field from the Markdown with a small Bun script. Do not retype it. After any dashboard edit, update the repository copy in the same session, so the two never drift.

Field limits live in `store/dashboard-limits.toml`, and `scripts/store-field-limits.test.ts` checks the single purpose, every permission justification, and the test instructions against them. Before 0.3.5, three justifications in `store/permissions.md` were over the 1,000-character field and were cut when pasted. If the dashboard shows a new limit, record it in the TOML first.

## Shipping a new version

1. Release by following "Release" in the skill (tag only on explicit request, after its preflight checks).
2. Download `bookmark-scout-vX.Y.Z-chrome.zip` from the GitHub release. Check its `manifest.json` version and permissions against `store/permissions.md`.
3. Package tab: "Upload new package". Confirm that the Package tab shows the new version and the expected permissions.
4. If listing text, permissions, or data flows changed, update those tabs (see the table above) and run the store policy checklist in `store/checklists/chrome-web-store.md`.
5. Submit only with the maintainer's go-ahead. The submit dialog's auto-publish box is checked by default. Unchecked, the approved version must be published within 30 days.

When `CWS_SUBMIT` is `true`, the release tag also uploads and submits the Chrome zip (the `submit-chrome` job, after its environment reviewer approves), so steps 2 and 3 become checking the job's log and the Package tab. Setup and the off switch are in "Automated submission" in `store/checklists/chrome-web-store.md`. Dashboard-only changes still have to be made before tagging.

Verified CRX uploads are off. Turning them on later requires every update to be the CI-signed `.crx` (secret `CRX_PRIVATE_KEY` in the release workflow). The public key must come from that same private key, and the key needs a backup first.

New languages: the dashboard adds a listing language for each `_locales` folder in the uploaded package; paste each one's description from `store/listings/<folder>.md` after the release that contains the folder. Edge needs each language's description and images entered by hand.

The same applies to permissions: a justification field appears only after a package that declares the permission is uploaded. With 0.3.5, the `ru`, `id`, and `it` descriptions and the `alarms` justification could not be filled until the package was in. To fill them before review, set `CWS_UPLOAD_ONLY` (see `store/checklists/chrome-web-store.md`): the release uploads a draft, you fill the new fields, and the maintainer submits.

## Driving the dashboard from a script

Only with the maintainer's approval: attach Playwright over CDP to their signed-in browser (for example `playwright-cli attach --cdp=chrome`, then `run-code --filename=<script>.js`). Save drafts only; the maintainer presses Submit. Keep the scripts outside the repository, in `~/.cache/bookmark-scout-*`. Generate each field's value from the repository files with Bun, then read every field back after saving and compare it to the source. Learned in October 2026:

- **Privacy tab:** the textareas are not tied to their labels, so locating them by label failed. List every textarea with the heading text next to it, fill each one by its position, and read them all back. In 0.3.5 there were 13: single purpose, one for each permission, and remote code last.
- **Test instructions** are read-only until you press their **Edit** button, and they save with their own **Save changes** button, not the page's Save draft.
- **Screenshots:** the page has several file inputs, and the screenshot input was not the first (it was the third). Check the thumbnail count after each upload. New images go to the end, so to change the order, remove every screenshot and upload them again in the order from `store/README.md`.

## Lessons from the first submission (0.3.0 to 0.3.1)

- **Rejected for Yellow Argon** because the description listed nine AI provider names. Describe provider kinds, not brands, in every language and in both listing blocks.
- **The policy audit found gaps that review would have flagged.** The site needed the Limited Use statement, the AI toggle needed to say what is sent in every browser (it had only said so in Firefox), and the privacy policy had to stop claiming the extension never reads pages.
- **Data usage was left unchecked by the maintainer's choice.** The test instructions explain that the developer receives nothing and that AI requests go straight to the user's provider. If review flags undisclosed data, check Authentication information, Web history, and Website content.
- **The Remote code radio came pre-set to "Yes".** Set it to "No".
- **The dashboard showed no justification field for `optional_host_permissions`.** The text in `store/permissions.md` is ready if it ever appears.
- **Re-uploading the same version over an unpublished draft works.** Listing-only fixes after a rejection need no new package.
