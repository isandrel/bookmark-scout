# AGENTS.md

## Scope

This file applies to work under `apps/website`.

Use it together with the repository root `AGENTS.md`. If there is a conflict, this file takes precedence for the website app.

## Mission

This app is the public marketing surface for Bookmark Scout. Changes here affect public perception of the product, search visibility, and the accuracy of user-facing claims.

Agents should treat the website as SEO-sensitive, localization-sensitive, and content-sensitive. A visually correct change is not sufficient if it breaks locale routing, metadata, or product accuracy.

## App overview

`apps/website` uses:

- Next.js App Router
- React
- TypeScript
- `next-intl` for localization
- shared site and product configuration from `@bookmark-scout/config`

The website currently uses localized routes and shared site metadata. Preserve those patterns unless the task explicitly changes them.

## Local repository map

- `DESIGN.md`: the site's design system (tokens, type, components, do's and don'ts). Read it before UI work.
- `app/`: route tree, layouts, static handlers, metadata, sitemap, and robots
- `app/[locale]/`: locale-aware pages: home, `privacy/`, `support/`, and `docs/*` meta-refresh redirects to the docs site
- `components/site/`: header, footer, language links, redirect helper
- `components/home/`, `components/privacy/`, `components/support/`, `components/longform/`: page components
- `lib/content/`: typed content data (demo library, tour, install steps, FAQ, AI providers, page sections, `routes.ts` with the indexable routes)
- `lib/`: `download.ts` (store link or release fallback), `page-metadata.ts`, `seo.ts`, `assets.ts`
- `messages/{en,ja,ko}.json`: shared and home copy; `messages/privacy/` and `messages/support/`: long-form page copy, merged in `i18n/request.ts`
- `i18n/`: locale routing and request behavior
- `public/`: icons, store screenshots, and `.well-known/security.txt`
- `scripts/verify-build.ts`, `scripts/serve-out.ts`, `tests/e2e/`, `playwright.config.ts`: build checks and browser tests

Do not edit generated output under:

- `.next/`
- `out/`

## Commands

- dev server: `nx run website:dev`
- build: `nx run website:build`
- build and verify the export: `nx run website:verify`
- browser tests against the export (desktop and mobile Chromium): `nx run website:test:e2e`
- lint: `nx run website:lint`

Equivalent scripts also exist in `apps/website/package.json`.

## Verification rules

Minimum for any substantive website change:

- `nx run website:lint`
- `nx run website:verify` (builds, then checks lang, canonical, hreflang, sitemap, third-party resources, security.txt, and message key parity)

Also run `nx run website:test:e2e` when the change touches pages, components, routing, or interaction. CI runs all three in the required `Website and Docs` job.

Build verification is particularly important when the change touches:

- localized pages
- metadata generation
- canonical URLs or alternate language links
- sitemap or robots handlers
- route structure
- message keys or locale lookups

## Architecture guidance

### Preserve App Router conventions

- keep route behavior inside the existing `app/` structure
- preserve the locale-aware route model under `app/[locale]/`
- avoid introducing alternate routing patterns unless the task truly requires it

### Localization

The website uses `next-intl` and locale routing from `i18n/routing.ts`.

Current supported locales:

- `en`
- `ja`
- `ko`

Rules:

- preserve locale-aware routing and `setRequestLocale` usage where already established
- do not hardcode localized copy in page components if the page is already message-driven
- keep translated message keys aligned across locale files

### Shared config and content data

Values come from `config/site.config.toml` through `@bookmark-scout/config`: site URL, docs URL, GitHub URL, `RELEASES_URL`, `CONTACT` (support, privacy, security addresses), `STORES` (store listing URLs; empty until live), `LICENSE`, and `PRIVACY_EFFECTIVE_DATE`.

- never hardcode URLs, email addresses, dates, or store links in components
- keep lists (demo bookmarks, tour tabs, install steps, FAQ, page sections, routes) in typed modules under `lib/content/`; copy stays in messages
- when a store listing goes live, set its URL in `[stores]`; download buttons switch from the GitHub release automatically
- add new indexable pages to `lib/content/routes.ts` so the sitemap, verify script, and browser tests cover them
- keep public claims aligned with the actual product and repository documentation

### Store-required pages

The Chrome Web Store, Firefox Add-ons, and Edge Add-ons listings link to the home page, `/{locale}/privacy/`, and `/{locale}/support/`. Keep these pages live and accurate. When the privacy text changes, update `messages/privacy/*.json`, `store/privacy-policy.md`, and `[legal] privacy_effective_date` together. Renew `public/.well-known/security.txt` before its `Expires` date.

### Metadata and SEO

Website changes can easily create invisible regressions. Be careful when editing:

- `generateMetadata`
- alternate language definitions
- canonical URLs
- sitemap and robots output
- structured data
- analytics script inclusion

If a change touches any of these, verify that the new behavior still reflects the intended locale and site URLs.

## Content and design guidance

- preserve the existing visual language and layout patterns
- keep the site polished but maintainable
- prefer extending current components rather than inventing parallel component systems
- avoid gratuitous animation or styling churn in content-focused changes

When editing product claims:

- keep browser support accurate
- keep feature descriptions aligned with current implementation
- keep installation and documentation links current

## Localization expectations

When you add or change localized website content:

- update `messages/en.json`, `messages/ja.json`, and `messages/ko.json`, or the matching files under `messages/privacy/` or `messages/support/`
- keep keys and array lengths identical across locales; `nx run website:verify` fails otherwise

If the change is intentionally English-only for a temporary reason, call that out explicitly in the final report instead of silently leaving the app inconsistent.

## Style guidance

- use TypeScript and functional React components
- keep page files focused on composition, metadata, and route logic
- extract reusable UI to `components/` when duplication appears
- avoid broad formatting changes outside the task scope

## Change discipline

- keep public claims aligned with real product behavior
- update website copy when setup, browser support, or product capabilities change
- do not edit generated directories
- avoid introducing hidden SEO regressions while making visual or content changes
