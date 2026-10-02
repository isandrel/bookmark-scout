---
id: TASK-33
title: Prepare store distribution and release listing assets
status: Done
assignee: []
created_date: '2026-09-23 16:31'
updated_date: '2026-10-01 18:00'
labels: []
dependencies: []
references:
  - README.md
  - apps/extension/wxt.config.ts
  - store/README.md
  - store/permissions.md
  - store/privacy-disclosures.md
  - store/privacy-policy.md
  - store/checklists/chrome-web-store.md
  - store/checklists/firefox-amo.md
  - store/checklists/edge-addons.md
priority: low
type: task
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
README current-focus item: prepare verified Chrome Web Store, Firefox Add-ons, and Edge Add-ons listing material, privacy disclosures, screenshots, and submission checklists. Do not publish without explicit release approval.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each store package and listing has accurate capability/browser claims, permissions rationale, and privacy copy.
- [x] #2 Review checklist documents manual submission gates; no store submission is performed by this task.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-01: Material added under the root `store/` folder (root, not `apps/extension/`, so it stays out of the Firefox sources zip and the extension's Nx inputs).

- Listings in en, ja, and ko per store (`store/listings/`), with measured character counts.
- Permission justifications from the built `chrome-mv3`, `firefox-mv2`, and `edge-mv3` manifests, the Chrome single-purpose statement, and `addons-linter` results (`store/permissions.md`).
- Data inventory and per-store privacy answers checked against the source (`store/privacy-disclosures.md`); privacy policy draft (`store/privacy-policy.md`), because neither the website nor the docs had one.
- Eight 1280x800 screenshots (popup, manager, Tools, options; light and dark) and a 440x280 promo tile, captured with the `extension-exploratory-qa` runner in a disposable profile with synthetic bookmarks.
- Per-store checklists with manual gates; nothing was submitted to any store and no release was published.

Findings that block or limit submission, recorded in the checklists:
- Firefox: the manifest has no `browser_specific_settings.gecko.id` and no `data_collection_permissions`; the latter is required for new AMO listings. Needs a code change and a release.
- Firefox: the bookmarks manager and Tools sidebar are not reachable (no bookmarks-page override, no UI link), so the Firefox listing describes a reduced feature set. The Firefox manifest declares `sidebar_action` although the docs say Firefox has no side panel; untested.
- Edge: whether `chrome_url_overrides.bookmarks` applies to Edge's Favorites page is unverified.
- Firefox and Edge have build validation only; each checklist requires a manual smoke test of every listed claim.
- Privacy policy hosting, support contact, categories, and Chrome data-usage categories are maintainer decisions.
<!-- SECTION:NOTES:END -->
