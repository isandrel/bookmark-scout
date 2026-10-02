---
version: alpha
name: Bookmark Scout
description: A calm, map-reader's interface for a privacy-first bookmark extension. Cool paper and deep-ink type carry most of the page; the brand's teal-to-violet ribbon appears only on the logo and on the one signature element, a live bookmark search whose matches are highlighted like a marker pen. Text is left-aligned, lists replace card grids, and real product screenshots do the selling.

colors:
  paper: "#f4f7fb"
  surface: "#ffffff"
  sunken: "#e9eef5"
  ink: "#0f2135"
  ink-soft: "#4a5b70"
  line: "#d6dfea"
  teal: "#0b7a80"
  teal-ink: "#ffffff"
  violet: "#5b3fd6"
  marker: "#ffe27a"
  marker-ink: "#1b1600"
  inverse: "#0f2135"
  inverse-ink: "#e8eff6"
  dark-paper: "#0d1b2a"
  dark-surface: "#132638"
  dark-sunken: "#0a1622"
  dark-ink: "#e8eff6"
  dark-ink-soft: "#9fb2c6"
  dark-line: "#23394f"
  dark-teal: "#3cc4c9"
  dark-teal-ink: "#04252a"
  dark-violet: "#a08bff"
  dark-marker: "#f5cf4a"
  ribbon: "linear-gradient(160deg, #2bb3b1 0%, #4f6ce0 48%, #8a3fd1 100%)"

typography:
  display-xl:
    fontFamily: "Bricolage Grotesque, Hiragino Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: 72px
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: -0.03em
  display-lg:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.02em
  display-md:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.01em
  search-query:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.1
  body-lg:
    fontFamily: "Instrument Sans, Hiragino Sans, Apple SD Gothic Neo, Noto Sans JP, Noto Sans KR, system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
  url:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5

rounded:
  sm: 4px
  md: 12px
  lg: 16px
  xl: 24px
  pill: 9999px

spacing:
  gutter-mobile: 16px
  gutter-desktop: 24px
  container: 1152px
  measure: 70ch
  section: 112px

components:
  button-primary: "rounded.pill, bg teal, text teal-ink, label, 12px x 24px"
  button-secondary: "rounded.pill, bg surface, 1px line border, text ink"
  search-instrument: "surface panel, rounded.xl, ribbon tucked top-left, search-query type, rows with marker highlights"
  tabs: "ARIA tablist with roving tabindex, active tab ink underline"
  screenshot-frame: "browser-chrome frame around 1280x800 screenshots, light/dark via picture"
  data-boundary: "diagram: browser boundary, dashed opt-in paths, no path to a vendor server"
  faq-item: "native details/summary, line separators"
---

## Overview

Bookmark Scout is a browser extension that searches, organizes, and cleans up years of bookmarks, entirely inside the browser. The design borrows from map reading and field notes: cool paper, ink, a compass-teal action color, faint topographic contour lines, and a marker-pen highlight for search matches.

One element is loud on purpose: the hero's live search over a sample bookmark library. Everything around it is quiet, left-aligned, and built from plain lists, real screenshots, and generous whitespace.

The source of truth for tokens is `apps/website/app/globals.css`. The docs site (`apps/docs/src/app/global.css`) maps the same values onto Fumadocs `--color-fd-*` variables.

## Colors

### Brand and accent

- `teal` is the only action color: primary buttons, links, focus rings. White text on `#0b7a80` passes WCAG AA.
- `violet` is a secondary accent for small details only. Never use it for body text or large fills.
- `ribbon` is the gradient from the icon. Use it only on the logo and the ribbon shape (`.ribbon`). Never on text, buttons, or backgrounds.

### Surface

- `paper` is the page. `surface` is panels (search instrument, screenshot frames). `sunken` is the footer, code, and inset areas.
- Dark mode follows `prefers-color-scheme`. Dark paper is deep navy (`#0d1b2a`), not near-black.

### Text

- `ink` for headings and body. `ink-soft` for secondary text; both pass AA on `paper` and `surface` in both themes.

### Semantic

- `marker` with `marker-ink` highlights search matches (`<mark>`) and text selection. It is functional, never decorative.

## Typography

### Font family

- Bricolage Grotesque for display: headings, the wordmark, and the search query.
- Instrument Sans for body and UI.
- JetBrains Mono for URLs and commands only, because they are code-like content. Never for labels or data captions.
- Japanese and Korean fall back to Hiragino Sans, Apple SD Gothic Neo, or Noto Sans. Headings use `word-break: keep-all` (Korean) and `line-break: strict` (Japanese) so words do not split.
- All fonts are self-hosted by `next/font` at build time. No runtime font requests.

### Hierarchy

- One `h1` per page in `display-xl` (40px on mobile, 72px on wide screens).
- Section headings in `display-lg`; sub-headings in `display-md`.
- Body in `body-md`; hero and lead paragraphs in `body-lg`.

### Principles

- Sentence case everywhere. No uppercase eyebrow labels.
- Never accent a single word in a headline with color, italics, or a gradient.
- Keep paragraphs under 70 characters per line.

## Layout

### Spacing and container

- Container `max-w-6xl` (1152px) with 16px gutters on mobile and 24px from `sm`.
- Sections separate with whitespace (about 112px on desktop) and an occasional `line` rule, not with backgrounds.

### Alignment

- Left-aligned text throughout. Centered text only inside small elements such as the 404 page.

### Whitespace philosophy

- Let screenshots and the search instrument carry visual weight; text blocks stay narrow.

## Elevation and depth

- Depth comes from `surface` on `paper` plus a 1px `line` border. Shadows are rare and soft (header menu popover only).
- The contour-line texture appears behind the hero search instrument only, drawn in `line` color and faded with a mask.

## Shapes

- Buttons and language links are pills (`rounded.pill`).
- Panels and screenshot frames use `rounded.xl` or `rounded.lg`.
- The ribbon is a clip-path shape: a rectangle with a V-notch at the bottom.

## Components

**`site-header`**: 64px sticky bar, translucent `paper` with backdrop blur and a bottom `line` rule. Logo and wordmark at left, links (Features, Privacy, Install, Docs, GitHub) and language links from `lg`; below `lg` a `<details>` menu holds both. Includes a skip link to `#main`.

**`button-primary`**: pill, `teal` background, `teal-ink` text, 12px by 24px padding, optional leading icon. One per viewport. Links to the store listing when configured, otherwise to the latest GitHub release.

**`button-secondary`**: pill, `surface` background, 1px `line` border, `ink` text. Sits beside the primary button.

**`search-instrument`**: the signature component. A `surface` panel with the ribbon tucked into its top-left corner, a labeled search input whose query renders in `search-query` type, an `aria-live` result count, suggestion chips, and result rows (folder path in `ink-soft`, title, URL in `url` type) with `<mark>` highlights. Auto-types one query on load; with reduced motion it shows the final state immediately.

**`tabs`**: ARIA tablist with a roving tabindex and arrow, Home, and End keys. Used for the product tour (Find, Organize, Clean up, AI) and the install steps (Chrome, Edge, Firefox).

**`screenshot-frame`**: browser-style frame around 1280x800 store screenshots. `<picture>` swaps in the dark screenshot under `prefers-color-scheme: dark`. Only the first tour image loads eagerly.

**`data-boundary`**: diagram of the browser as a boundary holding bookmarks, settings, and API keys, with dashed opt-in paths to "the AI provider you choose" and "websites you check", and a crossed-out vendor server with no path. Vertical on mobile.

**`install-steps`**: numbered steps, the only place numbered markers appear, because installation is a real sequence.

**`faq-item`**: native `<details>` and `<summary>` separated by `line` rules.

**`site-footer`**: `sunken` background, five columns (brand, Product, Project, Contact, Legal). Contact shows the role addresses from config.

**`long-form`** (privacy and support pages): title, date, an "At a glance" summary, a sticky table of contents on wide screens, and sections at a 70-character measure.

## Do's and don'ts

### Do

- Read values from `@bookmark-scout/config` (URLs, contact addresses, store links, license, dates) and copy from `messages/`. Keep content lists in typed modules under `apps/website/lib/content/`.
- Keep every string in English, Japanese, and Korean with identical keys.
- Use real product screenshots and the real feature set from `apps/docs/content/docs/status.mdx`.
- Keep visible focus rings and respect `prefers-reduced-motion`.

### Don't

- No identical rounded feature-card grids, emoji icons, gradient text, or gradient background washes.
- No uppercase eyebrow labels, middle-dot meta strings, or arrows appended to button text.
- No third-party requests other than the configured analytics script; no remote badge images or fonts.
- No claims the extension does not support in a given browser (Firefox has a smaller feature set).
- No more than one orchestrated animation per page.

## Responsive behavior

### Breakpoints

- Tailwind defaults: `sm` 640px, `md` 768px, `lg` 1024px.
- Header links and language links appear inline from `lg`.

### Touch targets

- Buttons, tabs, chips, and language links keep at least 40px of hit area.

### Collapsing strategy

- Everything stacks to one column below `lg`. The search query shrinks to 26px; the tour places the capability list under the screenshot; the data-boundary diagram turns vertical.
- No horizontal scrolling at 320px.

### Image behavior

- Screenshots scale to the container width with `width` and `height` set to avoid layout shift.

## Iteration guide

1. Change tokens in `apps/website/app/globals.css` and mirror them in `apps/docs/src/app/global.css` and this file.
2. Add copy to `apps/website/messages/` (all three locales) before adding a component.
3. Run `bunx nx run website:verify` and `bunx nx run website:test:e2e`, then check 375px and 1280px in light and dark.

## Known gaps

- Screenshots are English only.
- Whether Edge applies the bookmarks-page override has not been checked, so the site makes no Edge claim about it.
