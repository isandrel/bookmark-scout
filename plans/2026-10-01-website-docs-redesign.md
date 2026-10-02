# Website and Docs Redesign Plan

Date: 2026-10-01. Branch: `fix/website-docs-seo`. Scope: `apps/website`, `apps/docs`, `config/site.config.toml`, `packages/config`. The extension app is out of scope: no code changes under `apps/extension/`.

## 1. Review summary

### Already done on this branch

| Commit | What |
| --- | --- |
| `76d79ed` | Website SEO: one `<html>` per page with the right `lang`, meta-refresh root page, 404 page, localized titles and descriptions, `x-default`, large social card with a product screenshot, no self-set rating in JSON-LD, mirrored `/docs` pages noindexed, sitemap hreflang |
| `6b025f0` | Docs SEO: `metadataBase` (OG images pointed at localhost), title template, `robots.txt`, OG site name |
| `41ed9d4` | Copy aligned with shipped features (saved searches, shortcuts, undo, dead-link repair, Edge/Firefox tests, Vite 8, Base UI) |

### Remaining UI/UX problems (website)

Checked in the browser at 1280px and 375px.

1. Generic dark SaaS template: near-black page, blue-to-violet gradient headline, ten identical emoji cards. Nothing about it says "bookmarks" or shows the product.
2. No product imagery. The store screenshots (`store/screenshots/`, 1280x800, light and dark) are unused.
3. The hero headline is the product name, not what it does. The main button sends people to the GitHub repo, not to an install.
4. The tech stack section speaks to contributors, not users, and loads badge images from `img.shields.io` (a third-party request on every visit).
5. Body text `#71717a` on `#0a0a0a` is about 4.1:1, below WCAG AA for body text.
6. Mobile nav: the site name wraps and the language switcher is cut off at 375px.
7. No `<main>` landmark, no skip link, emoji used as icons and flags for languages.
8. Forced dark mode (`className="dark"`), ignoring the visitor's setting.
9. No privacy page. All three stores require a privacy policy URL; `store/privacy-policy.md` is a draft that is not hosted.
10. No contact addresses. The site owns `@bookmark-scout.com`; only `SECURITY.md` mentions `security@`.
11. Install steps cover Chrome only. Edge and Firefox steps live only in the docs.
12. No FAQ for the obvious objections: where data goes, whether AI is required, Firefox limits, why it is not in the stores yet.

### Remaining problems (docs site)

1. Stock Fumadocs neutral theme, emoji in the nav title, no logo, no link back to the product site's look.
2. Information architecture mixes users and contributors: "Getting Started" is a manual CRX install, and "Installation" mixes user steps with contributor commands.
3. `features.mdx` is a 150-line reference dump. There are no task guides (Diátaxis "how-to"): clean duplicates, repair dead links, set up AI, import bookmarks, use keyboard shortcuts.
4. No privacy, permissions, browser support, FAQ, or troubleshooting pages, although the facts exist in `store/README.md`, `store/permissions.md`, and `store/privacy-policy.md`.
5. No `meta.json`, so page order and grouping are file-name driven.
6. Only `llms-full.txt`; no `llms.txt` index.

## 2. Research notes

- Extension landing pages convert with: a benefit headline, the product in action above the fold, one primary action, proof, the problem it solves, and an FAQ that answers objections ([Chrome extension landing page guide](https://bestchromeextensions.com/2025/02/23/chrome-extension-landing-page-convert-visitors-to-installs/), [Marketing your browser extension](https://extensionbooster.net/blog/marketing-browser-extension-complete-guide/)).
- Store listing rules also apply to the site copy: no superlatives, accurate capability lists, real screenshots ([Chrome Web Store: creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)).
- Review stars in search need real reviews visible on the page; self-set ratings are not allowed ([Google review snippet guidelines](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)).
- Docs should be organized by reader need: tutorial, how-to, reference, explanation ([Diátaxis](https://scientyficworld.org/how-to-use-the-diataxis-framework-for-developer-docs/)).
- Role mailboxes: RFC 2142 names (`support@`, `security@`, plus `postmaster@` and `abuse@` for mail operators) survive people changes ([RFC 2142](https://datatracker.ietf.org/doc/html/rfc2142)). Publish `/.well-known/security.txt` with `Contact` and `Expires` ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html)).

## 3. Contact addresses

Configured in `config/site.config.toml` `[contact]` and exported as `CONTACT` from `@bookmark-scout/config`:

| Address | Use | Published on |
| --- | --- | --- |
| `support@bookmark-scout.com` | Help with the extension, store support email | Footer, FAQ, docs |
| `privacy@bookmark-scout.com` | Privacy questions and data requests | Footer, privacy page, store privacy policy |
| `security@bookmark-scout.com` | Vulnerability reports | Footer, `SECURITY.md`, `/.well-known/security.txt` |
| `postmaster@`, `abuse@` | Mail operations (RFC 2142, RFC 5321) | Not published; create as aliases |

The maintainer must create these as aliases to a monitored inbox. `security.txt` expires 2027-09-30 and must be renewed.

## 4. Design system

### Direction

Subject: a privacy-first browser extension that finds, organizes, and cleans up years of bookmarks. Audience: people with hundreds or thousands of bookmarks (researchers, developers, students). Primary job: show the product working and get a download.

The memorable element is the hero: a live, typeable search across a sample bookmark library, with matches highlighted like a marker pen, and the brand's ribbon bookmark tucked into the panel. Everything else stays quiet: left-aligned text, generous whitespace, real screenshots, plain lists instead of card grids.

Rejected defaults: near-black page with one neon accent, cream paper with a serif, identical rounded feature cards, uppercase eyebrow labels, gradient headline text, emoji icons.

### Tokens (in `apps/website/app/globals.css`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper` | `#f4f7fb` | `#0d1b2a` | Page background |
| `surface` | `#ffffff` | `#132638` | Panels, demo, screenshots frame |
| `sunken` | `#e9eef5` | `#0a1622` | Inset areas, code |
| `ink` | `#0f2135` | `#e8eff6` | Text |
| `ink-soft` | `#4a5b70` | `#9fb2c6` | Secondary text (AA on paper) |
| `line` | `#d6dfea` | `#23394f` | Borders and rules |
| `teal` | `#0b7a80` | `#3cc4c9` | Primary action, focus ring, links |
| `violet` | `#5b3fd6` | `#a08bff` | Secondary accent, sparingly |
| `marker` | `#ffe27a` | `#f5cf4a` | Search match highlight, text selection |
| `inverse*` | ink band | light band | The privacy band |
| `--ribbon` | teal to blue to violet gradient | same | Only on the ribbon shape and the logo |

Utilities: `.ribbon` (clip-path ribbon shape), `.caret` (typing caret), `mark` styling. Colors follow `prefers-color-scheme`; no forced theme.

### Type

- Display: Bricolage Grotesque (headings, the wordmark). Tight tracking, large sizes, weight 600 to 800.
- Body: Instrument Sans, 16 to 18px, line-height 1.6, measure under 70 characters.
- Code and URLs: JetBrains Mono (URLs in the demo, install commands).
- Japanese and Korean fall back to Hiragino Sans, Apple SD Gothic Neo, or Noto Sans.
- All fonts are self-hosted by `next/font` at build time; no runtime request to Google.

### Motion

One orchestrated moment: on load, the demo types a query and the list filters. Respect `prefers-reduced-motion` (show the final state immediately). Hover and press feedback only on controls.

### Design pass 1: first layout

```text
[logo] Bookmark Scout      Features  Privacy  Install  Docs  GitHub      English 日本語 한국어
------------------------------------------------------------------------------------------
Every bookmark you saved,                       (display, left, ~72px)
one search away.
sub (56ch)            [Download from GitHub]  [Read the docs]
+--ribbon--+-----------------------------------------------------------+
|          | search: react docs|                       6 of 214        |
|          | Dev Docs / React     React Reference     react.dev/...     |
+----------+-----------------------------------------------------------+
Product tour tabs: Manager | Duplicates | Popup | AI      [screenshot]
Find | Organize | Clean up          three columns of lists
#### dark band: Your bookmarks stay in your browser. 4 facts ####
AI: providers list
Install tabs: Chrome | Edge | Firefox, numbered steps
FAQ
```

### Critique against the brief and the generic defaults

| Part | Verdict | Change |
| --- | --- | --- |
| Hero: headline plus a live search panel | Specific to the product; the search is the product's core job | Keep. Make the search field itself the type moment: the query renders in the display face at heading size, so the input reads as part of the headline |
| Find / Organize / Clean up three columns | Generic feature triad, repeats the tour | Cut. Fold each job into the tour: each tab is a job (Find, Organize, Clean up, AI) with its screenshot and a short capability list |
| Separate AI section | Thin, repeats the tour and FAQ | Cut. The AI tab lists providers; the FAQ answers "do I need AI" |
| Inverse privacy band with four facts | Template pattern (dark band plus a fact grid) | Replace with a data-boundary diagram that carries information: your browser drawn as a boundary holding bookmarks, settings, and keys; dashed opt-in paths out to "AI provider you choose" and "websites you check"; no path to a Bookmark Scout server. The four facts sit beside it as plain text |
| Plain hero background | Fine but flat for "fancy and modern" | Add one subject-specific texture: faint topographic contour lines (scouting, map reading) behind the search panel only, drawn in `line` color, static |
| Tabs, numbered install steps, FAQ details | Content really is tabbed, sequential, and question-shaped | Keep |

### Design pass 2: revised layout

```text
HEADER  sticky, translucent paper, bottom rule
HERO    left column: H1 + sub + buttons + license note
        below, full width: search instrument
          +--ribbon tucked into top-left corner, brand gradient
          | [magnifier] query in display face, ~40px, caret       N of M bookmarks
          | suggestion chips: "recipes" "mdn" "travel" "pasta"
          | rows: folder path (ink-soft) / title with <mark> / url in mono
          +-- faint contour lines behind the panel, nowhere else
TOUR    #features  tablist: Find | Organize | Clean up | AI (opt-in)
        grid: screenshot in a browser frame (2/3) + capability list (1/3)
PRIVACY #privacy   boundary diagram (left) + four facts (right) + policy link
INSTALL #install   tabs Chrome | Edge | Firefox; numbered steps; store note
FAQ     #faq       details list, single column, 70ch
FOOTER  sunken, five columns
```

Mobile: everything stacks; the search query shrinks to ~26px; the tour stacks the list under the screenshot; the boundary diagram becomes vertical.

## 5. Website information architecture

### Shared chrome (`app/[locale]/layout.tsx`)

- Skip link, sticky header with a translucent paper background and a bottom rule.
- Header: logo and wordmark, links (Features, Privacy, Install, Docs, GitHub), language links (English, 日本語, 한국어, with `aria-current`), and a `<details>` menu below `md`.
- `<main id="main">`, then the footer.
- Footer: tagline; Product (Features, Install, Docs, Releases); Project (GitHub, Contributing, License AGPL-3.0); Contact (support, privacy, security emails); Legal (Privacy policy); author credit and year.

### Home page sections (`app/[locale]/page.tsx`)

See "Design pass 2" above for the final layout.

1. Hero: headline, one-sentence description, primary "Download from GitHub" (latest release), secondary "Read the docs", a short note "Free and open source under AGPL-3.0". Below it: the search instrument with the query in the display face, the ribbon, and contour lines behind it.
2. Tour (`#features`): tabs Find (popup screenshot), Organize (manager), Clean up (duplicate cleaner), AI (options, opt-in). Each tab: screenshot in a browser frame, light or dark via `<picture>`, plus a short capability list. The AI tab lists providers.
3. Privacy (`#privacy`): data-boundary diagram plus four facts and a link to the privacy page.
4. Install (`#install`): tabs for Chrome, Edge, Firefox with numbered steps (a real sequence), download button, note that store listings are being prepared, Firefox feature limits.
5. FAQ (`#faq`): native `<details>` items.

Remove: tech stack section, emoji icons, `img.shields.io` badges, glass and glow styles.

### Privacy page (`app/[locale]/privacy/page.tsx`)

- Content from `store/privacy-policy.md`, plus a "This website and the docs site" section (Umami Cloud cookieless analytics on bookmark-scout.com, GitHub Pages hosting logs, docs on Cloudflare Pages with no analytics) and the `privacy@` contact.
- Effective date 2026-10-01, rendered in the locale's date format.
- Layout: title and date, "At a glance" summary (four facts), sticky table of contents on wide screens, readable long-form sections.
- Localized in en, ja, ko. Messages live in `messages/privacy/{locale}.json`, merged in `i18n/request.ts`.
- Added to the sitemap with hreflang alternates; own canonical; linked from footer, privacy band, and FAQ.
- `store/privacy-policy.md` and the store checklists point to `https://bookmark-scout.com/en/privacy/`.

### Mirrored docs pages

`/[locale]/docs/*` become meta-refresh redirects to the matching docs page (React 19 hoists `<meta>` into `<head>`). Their message namespaces (`docs`, `gettingStarted`, `featuresPage`, `contributingPage`) are removed.

### Other website files

- `public/.well-known/security.txt` (RFC 9116). `deploy-website.yml` sets `include-hidden-files: true` so it is published.
- `public/screenshots/*.png`: the eight store screenshots. `lib/assets.ts` points the social image at the dark manager screenshot.
- `public/manifest.json`: theme and background colors match the new tokens.
- JSON-LD: `featureList` and `screenshot` stay in sync with the page.

## 6. Docs site plan (`apps/docs`)

- Theme: brand colors and fonts on top of Fumadocs (CSS variables for primary, background, and accent in light and dark), the logo in the nav, no emoji in the nav title, links to the website and GitHub.
- Navigation (`content/docs/meta.json` and folder `meta.json` files):
  - Get started: Introduction (`index.mdx`), Install (user install only, per browser), Browser support (matrix from `store/README.md`)
  - Guides: Search and saved searches, Organize and save, Clean up duplicates and tracking URLs, Find and repair dead links, Import and export, Set up AI tools, Keyboard shortcuts
  - Reference: Features (current `features.mdx`, trimmed of anything moved to guides), Settings, Permissions (from `store/permissions.md`)
  - About: Privacy (summary and a link to the website policy), FAQ and troubleshooting, Project status
  - Contribute: Contributing and development setup (contributor commands moved out of Install)
- Every claim must match the current code or existing docs; the `store/` material and `status.mdx` are the sources. Do not invent features.
- `llms.txt` index route next to `llms-full.txt`.
- Contact: support and privacy addresses from `CONTACT` where pages mention help.

## 7. Work split

Foundation (done by the lead before dispatch): tokens and fonts, locale layout with header, footer, skip link, `<main>`, language links, `CONTACT` config, `security.txt`, screenshots, `request.ts` merge of `messages/privacy/*.json`, nav and footer messages.

| Agent | Owns | Must not touch |
| --- | --- | --- |
| A: website home | `app/[locale]/page.tsx`, `components/home/**`, `messages/{en,ja,ko}.json` (except `nav`, `footer`, `metadata`), `components/JsonLd.tsx`, mirrored docs redirects, `public/manifest.json` | `app/[locale]/privacy/**`, `messages/privacy/**`, `apps/docs/**` |
| B: website privacy | `app/[locale]/privacy/**`, `components/privacy/**`, `messages/privacy/*.json`, `app/sitemap.ts`, `store/privacy-policy.md` and store checklist links | `app/[locale]/page.tsx`, `components/home/**`, `messages/{en,ja,ko}.json`, `apps/docs/**` |
| C: docs site | `apps/docs/**` | `apps/website/**` |

Agents A and B share one working tree and the running website dev server (port 3100); they verify with that server, `tsc`, and `eslint`, and do not run `next build` for the website (the lead runs it once at the end). Agent C runs `nx run docs:build` and may start the docs dev server on port 3200.

## 8. Verification and acceptance

- `nx run website:build`, `nx run website:lint`, `nx run docs:build`, `bun run types:check` in `apps/docs`.
- Built HTML: one `<html>` with the right `lang` per locale, canonical and hreflang on home and privacy, privacy in the sitemap, `security.txt` in `out/.well-known/`.
- Browser checks at 375px and 1280px, light and dark: no horizontal scroll, header usable, demo works with keyboard, tabs work with arrow keys, visible focus, reduced motion respected.
- No third-party requests from the website except Umami.
- All three locales render with no missing-message errors.
- No changes under `apps/extension/`.
