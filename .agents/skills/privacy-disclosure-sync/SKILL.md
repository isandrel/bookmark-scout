---
name: privacy-disclosure-sync
description: Keep every Bookmark Scout privacy disclosure true and in step with the code - the privacy policy (repository, website in every language), store data declarations (Chrome Data usage, Firefox data_collection_permissions, Edge privacy fields), permission justifications, docs privacy and permissions pages, store listings, and the in-product consent text - whenever what leaves the device changes. Use when a change adds or alters a network request, AI context, provider, permission, synced storage key, or page reading; when a store review flags undisclosed data or a policy issue; before a release; or when the user asks whether the privacy policy, store answers, or consent prompts are still accurate, even if they only say "check privacy" or "do we need to disclose this".
---

# Privacy disclosure sync (Bookmark Scout)

The extension promises that nothing reaches the developer, that AI is off until turned on, and that network tools send no cookies. About ten places restate those promises for different readers. A change that alters what leaves the device must update all of them in the same pull request. Most problems the Chrome Web Store review and the pre-submission audit found came from one place falling behind:

- The privacy policy still said the extension never reads pages after Read page content shipped.
- The AI toggle explained what is sent only in Firefox.
- The website lacked the Limited Use statement.

## 1. Establish the facts from the code

Run the inventory, then compare it with "Facts checked in the code", "Data inventory", and "What each AI feature sends" in `store/privacy-disclosures.md`:

```bash
bun .agents/skills/privacy-disclosure-sync/scripts/outbound-inventory.ts
bun .agents/skills/privacy-disclosure-sync/scripts/outbound-inventory.ts --base origin/main
```

The second form lists only lines this branch added. The script finds the following, and is a starting point, not proof:

- Network calls and the AI logging fetch
- Hard-coded external URLs
- `sync:` storage keys, which leave the device through the browser vendor's sync
- Permission and data-collection requests
- Tab reads and `credentials:` options

For each new data flow, answer these questions:

1. **What data?** For example: bookmark titles, URLs, folder paths, page text, API key, current tab URL.
2. **Sent where?** For example: the user's provider, the bookmarked site, browser sync.
3. **Triggered by what user action?**
4. **Is it on or off by default?**
5. **Which permission or consent gates it?**
6. **Does it carry cookies?**

Every provider request must go through `createLoggingFetch` (`src/services/ai-activity.ts`). It logs the request and, in Firefox, refuses to send without data-collection consent.

## 2. Update every disclosure

Update them in this order, because each one is derived from the one before:

| # | File or place | What to change |
| --- | --- | --- |
| 1 | `store/privacy-disclosures.md` | The facts, inventory rows, per-feature table, and each store's answers. Update the version and "checked against the source" date at the top. |
| 2 | `store/privacy-policy.md` | The public policy. Keep "What the developer receives" and the Limited Use statement. |
| 3 | `apps/website/messages/privacy/*.json` (every language) | The policy as published. Translate the change faithfully into every language, with no softening. Bump `privacy_effective_date` in `config/project.toml` when the substance changes. |
| 4 | `apps/docs/content/docs/privacy.mdx` and `permissions.mdx`, plus each `*.<tag>.mdx` translation | The docs versions. Update the translations, or say in the PR that they are stale. |
| 5 | `store/permissions.md` | When a permission, host access, or the time it is requested changes. It includes the single purpose statement and the per-permission justifications that are pasted into the dashboard. |
| 6 | Firefox declaration | `dataCollection` in `src/lib/permission-catalog.ts` for each feature. `FIREFOX_DATA_COLLECTION_PERMISSIONS` in `manifest.config.ts` is derived from it. `tests/unit/manifest-config.test.ts` and `permissions.test.ts` pin it. |
| 7 | In-product consent text, in every `_locales/*/messages.json` | `settings_aiEnabledDesc`, `settings_aiReadPageContentDesc`, the `permission_*Desc` and `permission_*Detail` explanation dialogs, and any new setting's description. The text must say what is sent and where, in every browser, before the browser's own prompt. |
| 8 | `store/listings/*.md` | The privacy paragraph in both description blocks. Name kinds of provider, never brands. |
| 9 | Store dashboards (maintainer) | The Chrome Web Store Privacy practices tab (Data usage and certifications), Edge's privacy question, and the AMO privacy policy field. Give the maintainer the exact answers from file 1; they decide and click. |
| 10 | `CHANGELOG.md` | One line under the next version saying what is newly sent, so reviewers and users see it. |

## Rules

- **Never weaken a promise to fit the code.** If the code breaks a promise ("no cookies", "nothing to the developer", "off by default"), fix the code or ask the maintainer. Do not reword the promise.
- **Disclose by category and destination.** Name the data and say who receives it ("your AI provider", "the bookmarked site"). Avoid vague words like "may".
- **Firefox counts sending to a provider the user picked as collection.** New AI data needs its category in `dataCollection`, and the feature's explanation dialog needs to say it before Firefox's prompt. Firefox only shows its prompt when `permissions.request` is the first call in the click handler, so check before any `await`.
- **Optional permissions are requested at first use**, from a user gesture, with an explanation where the browser's prompt alone is alarming (`PERMISSION_FEATURES` in `permission-catalog.ts`).
- **The Chrome Data usage answers are the maintainer's decision.** `store/privacy-disclosures.md` records the decision and why. If a change makes "the developer collects nothing" untrue, raise it with the maintainer before release.
- **Never commit real keys or user data** in examples, tests, or screenshots for these pages.

## 3. Check before opening the PR

```bash
rg -n -i "never (reads|fetches|sends)|no page content|only the title" store apps/website/messages/privacy apps/docs/content/docs/privacy*.mdx
nx run extension:test:unit
nx run website:verify
nx run docs:build
bun run --cwd apps/docs verify
```

The first search finds absolute claims that a new feature may have made false. Read each hit against the facts from step 1.

Before opening the PR, read the published privacy page in one non-English language to confirm the change reached it. In the PR body, list which of the ten places changed and which did not need to.
