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
- `app/(default)/`: the default language (English) at unprefixed URLs: home, `privacy/`, `support/`
- `app/[locale]/`: the same pages for every other language under `/<tag>/` (`generateStaticParams` skips the default language, `dynamicParams = false`)
- `app/manifest.ts`: the web manifest, built from config
- `components/pages/`: the body and metadata of each page, which both route trees render; keep the route files thin wrappers so the trees cannot drift
- `components/site/`: the shared layout (`SiteLayout.tsx`, the only one that renders `<html>`), header, footer, language links, and the language suggestion banner
- `components/home/`, `components/privacy/`, `components/support/`, `components/longform/`: page sections
- `lib/content/`: typed content data (demo library, tour, install steps, FAQ, AI providers, page sections, `routes.ts` with the indexable routes)
- `lib/`: `language-preference.ts` (browser-language matching and the one remembered-choice storage key for the banner), `redirects.ts` (the `_redirects` format that `serve-out.ts` applies in tests), `download.ts` (store link or release fallback), `page-metadata.ts`, `images.ts` (responsive image widths, formats, quality, and byte budget), `extension-providers.ts` (reads the AI provider list from `apps/extension/config` at build time for `lib/content/ai-providers.ts`)
- `scripts/optimize-images.ts`: generates AVIF and WebP variants of `public/screenshots/*.png` before dev and build (`bun run images` to run alone, `--force` to rebuild all)
- `messages/<locale>.json`: shared and home copy; `messages/privacy/` and `messages/support/`: long-form page copy, merged in `i18n/request.ts`
- `i18n/`: locale routing and request behavior
- `public/`: icons, store screenshots, and `_headers`. `scripts/generate-public-files.ts` writes `_redirects` (301s from the old `/en/...` URLs and the old `/<locale>/docs/...` pages, from the `LEGACY_DOCS_REDIRECTS` table in `lib/content/docs-redirects.ts`) and `.well-known/security.txt` from config before dev and build (both git-ignored)
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

Browser test files are named `tests/e2e/*.spec.mts` (as `.ts`, Playwright loads them as CommonJS and cannot import the ESM `@bookmark-scout/config`), and every test stubs analytics so no test reaches the real network. For screenshot reviews, deploy checks, and known static-export traps, follow the `website-docs-delivery` skill in `.agents/skills/`.

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
- preserve the two-tree locale model: `app/(default)/` for the default language without a prefix, `app/[locale]/` for the others. A static export has no middleware, so next-intl's `localePrefix: 'as-needed'` is not used. A new page is one component in `components/pages/` plus a thin route file in each tree, and a row in `lib/content/routes.ts`
- never redirect by browser language; `/` is English for everyone, including crawlers. The client-only `LanguageSuggestion` banner offers the visitor's language instead, and stops after a choice (dismiss, its link, or the header switcher)
- avoid introducing alternate routing patterns unless the task truly requires it

### Localization

The website uses `next-intl` and locale routing from `i18n/routing.ts`.

Supported locales are `[locales] supported` in `config/project.toml` (language tags such as `zh-CN`, which are also the URL segment and the message file name). Adding one needs its three message files, its own name and Open Graph code in the same config, and a font stack in `app/globals.css` if its script needs one (Chinese does).

Rules:

- preserve locale-aware routing and `setRequestLocale` usage where already established
- do not hardcode localized copy in page components if the page is already message-driven
- keep translated message keys aligned across locale files

### Shared config and content data

Values come from `config/project.toml` and `config/web.toml` through the `site` model in `@bookmark-scout/config`: page URLs (`site.url.path(locale, route, anchor)` for links, `site.url.page(...)` and `site.url.alternates(route)` for metadata; the default language has no prefix, so `site.url.path("en", "/privacy")` is `/privacy/`), client-side path switching (`pathInLocale` from `@bookmark-scout/config/locale-path`, with `site.locales.routing` passed as a prop), repository URLs (`site.repo.url`, `site.repo.file`, `site.repo.releasesLatest`, `site.repo.newIssue`), `site.docs.url(path)`, `site.contact.mailto(role)`, `site.store(browser)` (store listings; not live until a URL is set), `site.license`, `site.locales`, and `site.legal.privacyEffectiveDate`. The package reads files with `node:fs`, so client components get these values as props.

- never hardcode URLs, email addresses, dates, or store links in components
- SEO keywords (`metadata.keywords`) and the structured-data feature list (`structuredData.features`) are copy, so they live in messages per locale; browser theme colors come from `[website.theme]` in `config/web.toml` (a test checks they match `app/globals.css`); shared paths and the title template come from `PUBLIC_PATHS` and `titleTemplate`
- keep lists (demo bookmarks, tour tabs, install steps, FAQ, page sections, routes) in typed modules under `lib/content/`; copy stays in messages
- when a store listing goes live, set its URL in `[stores]`; download buttons switch from the GitHub release automatically
- add new indexable pages to `lib/content/routes.ts` so the sitemap, verify script, and browser tests cover them
- keep public claims aligned with the actual product and repository documentation

### Store-required pages

The Chrome Web Store, Firefox Add-ons, and Edge Add-ons listings link to the home page, `/privacy/`, and `/support/` (other languages under `/<tag>/`; the old `/en/...` URLs redirect). Keep these pages live and accurate. When the privacy text changes, update `messages/privacy/*.json`, `store/privacy-policy.md`, and `[legal] privacy_effective_date` together. Renew security.txt by moving `[security_txt] expires` in `config/web.toml` before that date; `website:verify` warns `warn_days` ahead.

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

- update every `messages/<locale>.json`, or the matching files under `messages/privacy/` or `messages/support/`
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
