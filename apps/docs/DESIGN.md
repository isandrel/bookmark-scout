---
version: alpha
name: Bookmark Scout Docs
description: The documentation site wears the Bookmark Scout brand on top of a stock Fumadocs layout. Paper, ink, and a compass-teal primary replace the neutral theme through the --color-fd-* variables; Bricolage Grotesque sets titles and sidebar sections; the ribbon appears only in the logo and on the docs home's task finder. Reading comes first, so the page body stays plain and fast.

colors:
  paper: "#f4f7fb"
  surface: "#ffffff"
  sunken: "#e9eef5"
  ink: "#0f2135"
  ink-soft: "#4a5b70"
  line: "#d6dfea"
  teal: "#0b7a80"
  teal-ink: "#ffffff"
  teal-wash: "#e1eff1"
  violet: "#5b3fd6"
  marker: "#ffe27a"
  marker-ink: "#1b1600"
  dark-paper: "#0d1b2a"
  dark-surface: "#132638"
  dark-sunken: "#0a1622"
  dark-ink: "#e8eff6"
  dark-ink-soft: "#9fb2c6"
  dark-line: "#23394f"
  dark-teal: "#3cc4c9"
  dark-teal-ink: "#04252a"
  dark-teal-wash: "#143347"
  dark-violet: "#a08bff"
  dark-marker: "#f5cf4a"
  ribbon: "linear-gradient(160deg, #2bb3b1 0%, #4f6ce0 48%, #8a3fd1 100%)"

typography:
  page-title:
    fontFamily: "Bricolage Grotesque, Instrument Sans, Hiragino Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: "clamp(2rem, 1.4rem + 2.4vw, 2.75rem)"
    fontWeight: 750
    lineHeight: 1.05
    letterSpacing: -0.025em
  heading:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontWeight: 600
    letterSpacing: -0.015em
  finder-query:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
  sidebar-section:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 700
  body:
    fontFamily: "Instrument Sans, Hiragino Sans, Apple SD Gothic Neo, Noto Sans JP, Noto Sans KR, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.7
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 14px

rounded:
  sm: 2px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px

spacing:
  gutter-mobile: 16px
  gutter-desktop: 24px
  page-max: 900px
  sidebar: 268px

components:
  nav-title: "icon.png at 26px plus the plain site name in the display face; no emoji"
  page-actions: "MarkdownCopyButton and ViewOptionsPopover under the description, above a line rule"
  task-finder: "docs home only; surface panel, ribbon tucked top-left, finder-query input, chips, grouped page list, marker highlights"
  screenshot: "ImageZoom inside a surface frame; light or dark capture by theme"
  steps: "Fumadocs Steps for real sequences only"
  tabs: "Fumadocs Tabs for per-browser instructions"
  callout: "Fumadocs Callout for Firefox limits and data warnings"
  config-links: "Contact, ReleaseLink, SiteLink, RepoLink, StoreListing, StoreAvailability, License, PrivacyEffectiveDate"
---

## Overview

The docs site is where people install Bookmark Scout and learn its tasks, so it is a reading surface first. It keeps Fumadocs' layout, search, sidebar, table of contents, and MDX components, and changes only the theme: the shared brand's paper, ink, teal, and type. One element carries the brand's character: the task finder on the docs home, a bookmark-style search over the docs' own pages.

The shared brand (palette, type, voice, the ribbon) is described in the root [`DESIGN.md`](../../DESIGN.md); this file does not repeat its rationale. The source of truth for the docs tokens is `apps/docs/src/app/global.css`; content structure is in `content/docs/meta.json`.

## Colors

The brand tokens are declared as `--bs-*` variables in `:root` and `.dark`, then mapped onto the Fumadocs variables after `fumadocs-ui/css/neutral.css` and `preset.css` load, so the brand values win:

| Fumadocs variable | Brand token |
| --- | --- |
| `--color-fd-background` | `paper` |
| `--color-fd-foreground`, `-card-foreground`, `-popover-foreground` | `ink` |
| `--color-fd-muted`, `--color-fd-secondary` | `sunken` |
| `--color-fd-muted-foreground` | `ink-soft` |
| `--color-fd-card`, `--color-fd-popover` | `surface` |
| `--color-fd-border` | `line` |
| `--color-fd-primary`, `--color-fd-ring`, `--color-fd-info` | `teal` (info callouts too) |
| `--color-fd-primary-foreground` | `teal-ink` |
| `--color-fd-accent` | `teal-wash` (hover and active rows) |

- `teal` is the only action color: links, the active sidebar item, the primary button, focus outlines.
- `teal-wash` is a docs-only token: a quiet tint for hover and selected states, where full teal would be too loud.
- `marker` highlights finder matches (`<mark>`) and text selection.
- `violet` is not used in the docs UI. The `ribbon` gradient appears only in the logo and the `.bs-ribbon` shape.
- Neutral.css tints the dark sidebar grey; `#nd-sidebar` overrides keep it on the navy scale.
- Theme follows the system setting by default, with Fumadocs' light and dark toggle.

## Typography

- Bricolage Grotesque for `h1` to `h4`, sidebar section labels, the nav title, and the finder query. Instrument Sans for body and UI. JetBrains Mono for code only.
- Page titles use `page-title`: large, heavy, tight. Section headings stay in `ink`; headings are never colored or gradient-filled.
- Body text is 16px at 1.7 line height inside Fumadocs' prose column (at most 900px wide, about 70 to 80 characters per line).
- Ordered-list markers use the display face in teal, because they mark real sequences.
- Fonts are self-hosted by `next/font`. No runtime request to Google Fonts.

## Layout

- Fumadocs `DocsLayout`: sidebar (268px) with search, the Website link, and the page tree; the article in the middle; the table of contents on the right from `xl`.
- The page tree comes from `meta.json` separators in Diátaxis order: Get started, Guides, Reference, About, Contribute. Guides live in `content/docs/guides/` with their own `meta.json`. Legacy URLs (`/`, `/installation`, `/features`, `/status`, `/contributing`) never move.
- Every page: title, description, page actions (Copy Markdown and Open in), a line rule, the body, then Edit on GitHub and Last updated (except on the home page), then Fumadocs' previous and next links.
- The docs home: title and description, two buttons (Install, latest release), the task finder, then a short overview.

## Elevation and depth

- Depth is `surface` on `paper` with a 1px `line` border. No added shadows; Fumadocs' own popover shadows stay.

## Shapes

- Buttons and panels: `rounded.lg`; the task finder: `rounded.xl`; chips: `rounded.pill`; `<mark>`: `rounded.sm`.
- The ribbon is a clip-path rectangle with a V-notch at the bottom, used once, on the task finder.

## Components

**`nav-title`**: `public/icon.png` at 26px and the site name from config, in the display face. Header links come from `NAV_LINKS` in `src/lib/site.ts` (Website) plus `githubUrl` (GitHub icon in the sidebar footer).

**`page-actions`**: `MarkdownCopyButton` and `ViewOptionsPopover` from `fumadocs-ui/layouts/docs/page`, pointing at the page's static Markdown copy (`/llms.mdx/<slug>/content.md`) and its source on GitHub.

**`task-finder`** (`src/components/home/task-finder.tsx`): the one signature element. A `surface` panel with the ribbon in its top-left corner, a labeled search input in the display face, an `aria-live` status line, suggestion chips, and the Get started and Guides pages grouped by section. Typing filters every page by title, description, and section, highlights matches with `<mark>`, and Enter opens the first result. Page data comes from the page tree (`src/lib/doc-index.ts`), never a hand-written list.

**`screenshot`** (`<Screenshot name="manager" />`): a store screenshot in a `surface` frame with Fumadocs `ImageZoom`; the light or dark capture shows by theme. Paths come from the shared manifest in `@bookmark-scout/config` (`SCREENSHOTS`); alt text is in `src/lib/screenshots.ts`.

**Fumadocs MDX components**: `Steps` for real sequences (install, scans, imports), `Tabs` for per-browser instructions, `Callout` for Firefox limits and data warnings, tables for settings and results. `Accordion` is registered but unused, because FAQ answers are headings so they show in the table of contents and in search.

**Config components**: `Contact`, `ReleaseLink`, `SiteLink`, `RepoLink`, `StoreListing`, `StoreAvailability`, `License`, and `PrivacyEffectiveDate` render values from `@bookmark-scout/config` (`src/components/mdx/links.tsx`). `src/lib/mdx-text.ts` turns the same tags, plus Tabs, Steps, and Callout, into plain Markdown for `llms.txt`, `llms-full.txt`, and the per-page Markdown copies.

**`og-image`** (`src/app/og/docs/[...slug]/route.tsx`): 1200x630, dark navy, the icon and site name, the page title, and the description under a teal rule, with the ribbon at top right.

## Do's and don'ts

### Do

- Theme Fumadocs through `--color-fd-*` and small selectors; keep its components.
- Take every URL, address, store link, license, and date from config through the MDX components above.
- Use `Steps` only for real sequences and `Tabs` only when the reader picks one option.
- Match labels to the extension's English UI (`apps/extension/public/_locales/en/messages.json`), in bold.

### Don't

- No emoji in titles, headings, or the nav. No uppercase eyebrow labels, gradient text, or colored headings.
- No card grids on content pages, and no decorative motion.
- No third-party requests: no remote fonts, badges, or analytics.
- No feature claims beyond `status.mdx`, `store/`, and the extension source.

## Responsive behavior

- Below `md`, Fumadocs collapses the sidebar into a menu and the table of contents into a popover under the header.
- The task finder query drops from 30px to 24px and its page list goes to one column below `sm`.
- Wide tables scroll inside their own container; the page never scrolls sideways at 320px.

## Iteration guide

1. Change brand tokens in `src/app/global.css` together with the root `DESIGN.md` and `apps/website/app/globals.css`, then update this file.
2. Add or move pages in `content/docs` and the matching `meta.json`. Keep legacy URLs.
3. Run `bun run types:check` in `apps/docs`, then `bunx nx run docs:verify` (it builds first), and check 375px and 1280px in light and dark.

## Known gaps

- The docs are English only.
- Screenshots are the store captures; they are not regenerated when the UI changes.
- The Fumadocs search dialog and table of contents keep their stock styling apart from the color mapping.
