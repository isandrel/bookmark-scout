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

- `app/`: route tree, layouts, static handlers, metadata, sitemap, and robots
- `app/[locale]/`: locale-aware pages and layouts
- `components/`: website-specific components
- `messages/`: translation message files for `en`, `ja`, and `ko`
- `i18n/`: locale routing and request behavior
- `public/`: icons and static assets

Do not edit generated output under:

- `.next/`
- `out/`

## Commands

- dev server: `nx run website:dev`
- build: `nx run website:build`

Equivalent scripts also exist in `apps/website/package.json`.

## Verification rules

Minimum for any substantive website change:

- `nx run website:build`

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

### Shared config

The website already relies on `@bookmark-scout/config` for site-wide values.

- reuse shared config when possible
- avoid duplicating canonical URLs, titles, or product constants directly in page files
- keep public claims aligned with the actual product and repository documentation

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

- update `messages/en.json`
- update `messages/ja.json`
- update `messages/ko.json`

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
