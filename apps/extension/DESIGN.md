---
version: alpha
name: Bookmark Scout extension
description: The extension is the product itself, so it reads like a fast, quiet tool rather than a page. Paper, ink, and a single compass-teal accent from the shared brand carry every surface. The popup and side panel behave like a command palette, with one search field, dense 32px rows, keycap hints, and a teal-washed active row. The manager and options pages use the same tokens at page scale. Depth comes from a ladder of surface shades and 1px lines, not shadows, and the marker-pen highlight is the only bright color in normal use.

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
  danger: "#b42318"
  danger-wash: "#fdecea"
  warning: "#8a5a00"
  warning-wash: "#fdf3dc"
  success: "#1d7a4a"
  success-wash: "#e3f4ea"
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
  dark-danger: "#ff8f85"
  dark-danger-wash: "#3a1d24"
  dark-warning: "#f0b44c"
  dark-warning-wash: "#33291a"
  dark-success: "#5fd49a"
  dark-success-wash: "#15322a"

typography:
  page-title:
    fontFamily: "Bricolage Grotesque, Instrument Sans, Hiragino Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: -0.015em
  section-title:
    fontFamily: "Instrument Sans, Hiragino Sans, Apple SD Gothic Neo, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Instrument Sans, Hiragino Sans, Apple SD Gothic Neo, Noto Sans JP, Noto Sans KR, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  row-title:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 450
    lineHeight: 1.3
  meta:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  url:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  keycap:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1

rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  pill: 9999px

spacing:
  unit: 4px
  popup-gutter: 8px
  page-gutter: 24px
  row-height: 32px
  search-height: 40px
  control-sm: 28px
  control-md: 32px
  control-lg: 36px
  popup-default: "400x600px"
  popup-min: "300x300px"
  manager-folder-sidebar: 256px
  manager-tools-sidebar: 320px

components:
  search-field: "40px, sunken fill, 1px line, Search icon at the start, keycap hint at the end, teal focus ring"
  tree-row: "32px, rounded.md, chevron slot, icon, row-title, meta count; hover sunken, active teal-wash, focus-visible teal ring"
  row-actions: "icon buttons overlaid at the row end, shown on hover and focus-within, on the row's own fill"
  keycap: "20px high, sunken fill, 1px line, rounded.sm, keycap type"
  hint-bar: "popup footer, 28px, meta type, keycaps plus verbs for the shortcuts that exist"
  chip: "24px, rounded.pill, 1px line, meta type; selected chip uses teal-wash and teal text"
  button: "primary teal fill with teal-ink text; secondary surface with 1px line; ghost no fill; destructive danger fill; heights 28, 32, 36"
  badge: "20px, rounded.sm, meta type; neutral sunken, or a semantic wash with its text color"
  notice: "1px semantic line on its wash, icon plus text, rounded.lg; never a gradient"
  empty-state: "lucide icon in ink-soft, one sentence, one action button; no emoji"
  skeleton: "sunken bars at row height; pulse disabled under reduced motion"
  dialog: "surface, 1px line, rounded.xl, title in section-title, footer actions right-aligned"
  toast: "surface, 1px line, rounded.lg, semantic icon; progress bar in teal"
---

## Overview

The extension is the product. Most visits are a few seconds long: open the popup, type a few letters, open or file a bookmark, close it. The design serves that loop first. The popup and side panel behave like a command palette, with the search field always focused, the results as dense keyboard-navigable rows, and shortcuts shown as keycaps. The bookmark manager and options pages are slower, longer sessions, and use the same tokens with more room.

The shared brand (palette, type, voice, the ribbon) is in the root [`DESIGN.md`](../../DESIGN.md); this file does not repeat its rationale. The interaction patterns borrow from command-palette tools: a ladder of surface shades instead of shadows, hairline borders, one accent color reserved for action, focus, and selection, and keycaps for shortcuts. The palette stays Bookmark Scout's own, in both light and dark.

The source of truth for tokens is `src/styles/theme.css`, which every entrypoint imports. Components are shadcn/ui on Base UI primitives in `src/components/ui/`.

## Colors

The brand tokens map onto the shadcn variables in `:root` and `.dark`:

| shadcn variable | Brand token |
| --- | --- |
| `--background` | `surface` in the popup and side panel; `paper` on the manager and options pages |
| `--foreground`, `--card-foreground`, `--popover-foreground` | `ink` |
| `--card`, `--popover` | `surface` |
| `--muted`, `--secondary` | `sunken` |
| `--muted-foreground` | `ink-soft` |
| `--accent`, `--accent-foreground` | `teal-wash`, `ink` (hover and active rows) |
| `--primary`, `--ring` | `teal` |
| `--primary-foreground` | `teal-ink` |
| `--border`, `--input` | `line` |
| `--destructive`, `--destructive-text` | `danger` (fill and text use the same token in both themes) |

- `teal` is the only action color: the primary button, links, the focus ring, the selected row's icon, and toggles that are on. Never use it as a section background.
- `teal-wash` marks the active or selected row. Row text on it stays `ink`, because teal text on the wash is under 4.5:1.
- `marker` highlights search matches (`<mark>`) with `marker-ink` text. It is the only bright fill in normal use.
- `violet` marks AI features only: the Sparkles icon and the AI suggestion label. It is never a fill or a gradient.
- `danger`, `warning`, and `success` appear only in results, notices, badges, and toasts, each as text or a 1px line on its own wash. They never color chrome or icons in navigation.
- Folder icons are `ink-soft`. The active row's icon turns `teal`.
- The ribbon gradient appears only in the extension icon.
- Theme follows the `theme` setting (light, dark, or system) through the class next-themes sets on `<html>`.

All text pairs meet WCAG AA in both themes: teal on surface is 5.1:1 in light and 7.3:1 in dark, and ink-soft on sunken is 6.0:1.

## Typography

- Instrument Sans for all UI text. JetBrains Mono for URLs, keycaps, and code. Bricolage Grotesque only for the `page-title` on the manager and options pages; the popup has no display type.
- Fonts are bundled as local woff2 subsets, because the extension makes no remote font requests. Japanese and Korean fall back to system fonts.
- Body and row titles are 14px; metadata, counts, and URLs are 12px. Avoid sizes below 11px.
- Sentence case everywhere. No uppercase labels, letter-spaced eyebrows, colored headings, or gradient text.

## Layout

- **Popup** (400x600 by default, adjustable from 300x300 to 800x600): search field, then recent folders as wrapping chips beside their label, then the AI suggestion block when present, then the tree, then the hint bar. 8px gutters. Only the tree scrolls.
- **Side panel:** the popup layout at full height; the hint bar stays at the bottom.
- **Manager:** the folder sidebar (256px), the table, and the tools sidebar (320px). Each sidebar collapses with `inert`. Panels are `surface` on `paper`, separated by 1px lines.
- **Options:** search and a vertical category list on the left (wrapping into rows above the settings below 640px), the settings for the selected category on the right, and a sticky footer holding export, import, reset, and a failed-save message when there is one. Settings save as they change; there is no Save button and no success message. Each row keeps a fixed slot for its reset button, so a control never moves when the button appears or disappears. Whole numbers use a − / value / + stepper that also takes typing and clamps to the range on commit; a slider is used only for fractional values such as a confidence. Related on/off settings appear together as one checklist row with a single reset. Results of an action on the page, such as Refresh Models or Verify Service, show inline under the button that ran it, not as a toast.
- Spacing uses a 4px unit. Rows are 32px, controls are 28, 32, or 36px, and the search field is 40px.
- No horizontal scroll at the popup's 300px minimum or at 320px page width.

## Elevation and depth

- Depth comes from the surface ladder (`paper` to `surface` to `sunken`) and 1px `line` borders.
- Popovers, menus, and dialogs are the only elements with a shadow: one soft shadow so they separate from the page under them.
- Dragged rows lift with the same shadow and a 2px teal drop indicator. Never blue or other hard-coded colors.

## Shapes

- `rounded.sm` for marks, keycaps, and badges. `rounded.md` for rows, inputs, and buttons. `rounded.lg` for cards, notices, and toasts. `rounded.xl` for dialogs. `rounded.pill` for chips and switches only.
- Icons are lucide at 16px in rows and buttons and 14px in badges and metadata, at 1.75 stroke.

## Components

**`search-field`** (`BookmarkSearch`): sunken fill, Search icon, placeholder in `ink-soft`, and a keycap hint (`/`, which focuses the field) at the end that hides while typing. Option toggles (case, whole word, regex) are 24px ghost icon buttons with `aria-pressed`. Search history opens as a listbox under the field.

**`tree-row`** (`FolderItem`, `BookmarkItem`): a 32px row in this order: chevron slot (16px), icon (favicon or folder), title, then a count in metadata type. Hover is `sunken`, keyboard-active is `teal-wash` with a teal icon, and focus-visible adds a 2px teal ring inset. Children indent by the chevron slot plus its gap.

**`row-actions`**: icon buttons (24px) overlaid at the row's end on the row's current fill, shown on hover and focus-within, and never reserving width when hidden. Each one has an `aria-label` and a tooltip.

**`keycap`**: shortcut glyphs in a 20px sunken box with a 1px line. Use the platform's modifier (⌘ on macOS, Ctrl elsewhere). Used in the hint bar, tooltips, and the shortcuts help dialog.

**`hint-bar`**: the popup footer: `/ search`, `↑↓ navigate`, `←→ close or open folder`, and `↵ open`, or `↵ save here` while a folder row is active. It only shows shortcuts that exist in `use-popup-shortcuts.ts`.

**`chip`**: recent folders and saved searches. 24px, pill, 1px line; the selected chip uses `teal-wash`.

**`button`**: `default` is teal, `outline` is surface with a line, `ghost` has no fill, `destructive` is danger. Sizes are `sm` (28px), `default` (32px), and `lg` (36px); icon sizes are 24px and 28px. Do not override heights per call site.

**`badge`**: counts and states in a table or result. Neutral badges are `sunken`; semantic badges use their wash with their text color.

**`notice`**: warnings and errors inside dialogs and tool results: an icon, one or two sentences, and an optional action, on the semantic wash with a 1px semantic line.

**`empty-state`**: a 24px lucide icon in `ink-soft`, one sentence that says what is empty, and one action that fixes it ("Clear search", "Add bookmark"). No emoji.

**`loading`**: skeleton rows at row height for lists and tables; a spinner only inside a button that is running a task.

**`error-state`**: what failed and a Retry button, in `danger` text. Every page has a localized error boundary.

**`searchable-select`** (`src/components/ui/searchable-select.tsx`): a select whose popup starts with a search box, for lists too long to scan, such as the AI provider picker. Options can be grouped under small labels.

**`dialog`**, **`toast`**, **`table`**: the existing primitives in `src/components/ui/`, themed by tokens only. Dialogs open in place with a fade and a slight zoom; they do not slide in from an edge.

**`confirm-dialog`** (`ConfirmDialog`): a dialog that asks before an action. It has a title, an optional explanation, and Cancel beside a confirm button, which is `destructive` by default. Use it for every "Delete …?" prompt instead of assembling a dialog by hand.

**`field`** (`Field`): a label with its description and an inline error, wired to the control through ids and `aria-*`. The `stacked` layout is for dialogs and editors, and the `setting` layout is for an Options row with the control and its reset button on the right.

**`options-panel`** (`OptionsPanel`): a boxed Options section with a heading, a description, optional actions on the right, and the content below, such as AI services, AI activity, or the prompt library.

**`mask-icon`** (`MaskIcon`): a one-color image, such as a provider logo, drawn as a CSS mask in the current text color.

## Do's and don'ts

### Do

- Keep the popup keyboard-first: focus starts in search, and arrows, Enter, and Escape always work.
- Use tokens through Tailwind theme colors (`bg-accent`, `text-muted-foreground`, `border-border`). Add a token in `theme.css` before reaching for a palette color.
- Use one icon color per surface: `ink-soft` for navigation, `teal` for active, violet only for AI.
- Give every icon-only button an `aria-label`, and every test target a `data-slot`, `data-testid`, or semantic class.
- Respect `prefers-reduced-motion`. Motion is 150 to 200ms fades and small scales on popovers, menus, dialogs, and the accordion; nothing else animates.

### Don't

- No hard-coded Tailwind palette colors (`text-amber-500`, `bg-indigo-100`, `rgb(...)`) in components.
- No gradients outside the extension icon. No gradient text or gradient headers.
- No emoji as icons, no uppercase section labels, no rainbow tool icons.
- No card grids for lists of tools or results; use rows with a 1px line between them.
- No second accent color for actions, and no shadows on cards or rows.
- No per-call-site button heights such as `h-5` or `h-10`.

## Responsive behavior

- The popup reflows from 300px to 800px wide: chips wrap onto another line, row titles truncate, row actions overlay instead of wrapping, and the hint bar drops its last hint below 360px.
- Below 1100px the manager keeps one sidebar open so the table has room; below 768px both sidebars collapse.
- Options wraps the category list into rows above the settings below 640px.

## Iteration guide

1. Change tokens in `src/styles/theme.css`, then update this file. Brand token changes also update the root `DESIGN.md` and the website and docs design files.
2. Build new UI from `src/components/ui/` primitives and the components above.
3. Put user-facing copy in `public/_locales/{en,ja,ko}/messages.json`.
4. Run `nx run extension:lint`, the three build targets, `nx run extension:test:unit`, and the E2E targets. Check the popup at 300px and 400px and the manager at 1400px, in light and dark.

## Known gaps

- This file describes the target system. The extension is moving to it in phases: tokens and fonts, then popup and side panel, then manager, then options. Until a phase lands, its surface still uses stock shadcn zinc and the hard-coded colors listed in the don'ts.
- Store screenshots are not regenerated automatically when the UI changes.
