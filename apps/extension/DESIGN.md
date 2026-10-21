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
  footer-notice: "28px line above the hint bar (two lines when the teal action does not fit beside the text), 1px top line, meta type in ink-soft, 14px icon, one teal text action, 24px ghost dismiss; text cut short before the keys it names, never the keys"
  shortcut-recorder: "32px mono input, centered keys, teal border while recording, inline danger-text error under it, fixed reset slot"
  chip: "24px, rounded.pill, 1px line, meta type; selected chip uses teal-wash and teal text"
  button: "primary teal fill with teal-ink text; secondary surface with 1px line; ghost no fill; destructive danger fill; heights 28, 32, 36"
  badge: "20px, rounded.sm, meta type; neutral sunken, or a semantic wash with its text color"
  notice: "1px semantic line on its wash, icon plus text, rounded.lg; never a gradient"
  checklist: "rows in one 1px-line rounded.md box with dividers; 16px pass, fail, warning, or unknown icon with a screen-reader label, label column in ink-soft, value, requirement in meta type when not passed"
  empty-state: "lucide icon in ink-soft, one sentence, one action button; no emoji"
  skeleton: "sunken bars at row height; pulse disabled under reduced motion"
  dialog: "surface, 1px line, rounded.xl, title in section-title, footer actions right-aligned"
  toast: "surface, 1px line, rounded.lg, semantic icon; progress bar in teal"
  quick-save-notification: "in a web page, in the top layer: 360px max, fixed 16px from the top inline-end corner (top right in left-to-right languages), surface, 1px line, rounded.lg, one soft shadow, semantic icon, title, path in meta type, outline Undo (teal Retry or Open AI settings, then outline Save without AI, after a failed AI quick save), chip alternatives, 2px teal countdown bar"
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
| `--destructive`, `--destructive-text` | `danger`. Light theme: one color for fill and text. Dark theme: `--destructive` stays dark enough for white text on it, and `--destructive-text` is lighter so red text stays readable. Use `text-destructive-text` for text, never `text-destructive` |

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

- Instrument Sans for all UI text. JetBrains Mono for URLs, keycaps, and code. Bricolage Grotesque only for the fixed, translated Options `page-title` (`settings_title`); the manager and popup have no display type. `tests/unit/font-coverage.test.ts` guards the display consumer and every locale's title: review font coverage before adding another display heading or user-controlled display text.
- Fonts are bundled as local woff2 subsets, because the extension makes no remote font requests. Instrument Sans and JetBrains Mono retain Latin and Latin Extended for arbitrary bookmark text and URLs; Bricolage Grotesque needs only Latin for the current translated title. Other scripts use system fonts. Japanese, Korean, Simplified Chinese, and Traditional Chinese each list their own system fonts first (`:root:lang(...)` in `src/styles/theme.css`), because Han characters take each language's glyph shapes from the font. Add a stack there for a new language whose script needs one; Vietnamese does, because Instrument Sans has no Vietnamese subset. Korean also sets `word-break: keep-all` there, so lines break between words rather than inside one (with `overflow-wrap: break-word` for a word longer than its line).
- Body and row titles are 14px; metadata, counts, and URLs are 12px. Avoid sizes below 11px.
- Sentence case everywhere. No uppercase labels, letter-spaced eyebrows, colored headings, or gradient text.

## Layout

- **Popup** (400x600 by default, adjustable from 300x300 to 800x600): search field, then a 24px line naming the page to save (`CurrentPageLine`, hidden under 400px of height and while the page is unknown) and, when the page is already bookmarked, a second one naming where ("Already saved in"; a save into another folder still goes ahead, and its toast says it is another copy), then recent folders as wrapping chips beside their label, then the AI suggestion block when present, then the tree, then a footer notice when one applies, then the hint bar. 8px gutters. The tree scrolls, and so does the AI suggestion block, which takes at most a share of the height (`config/ui/popup-suggestions.toml`) so the tree and hint bar stay on screen. The popup and side panel open in this final layout: before the first frame the page waits, at most `preload_wait_ms` (`config/ui/page-open.toml`), for what decides the layout (settings, whether AI is set up, the current page and where it is already saved, recent folders, the shortcut notice), and only the tree may arrive later, replacing its skeleton in place under the hint bar.
- **Side panel:** the popup layout at full height; the hint bar stays at the bottom.
- **Manager:** the folder sidebar (256px), the table, and the tools sidebar (320px). Each sidebar collapses with `inert`. Narrower than `sidebar_overlay_below_width` (768px, `config/ui/layout.toml`), the sidebars open over the table as drawers (`paper`, a shadow, and a black 40% scrim that closes them on click), closed when the page loads; picking a folder closes the folder drawer, and Escape closes either, giving focus back to its button. Panels are `surface` on `paper`, separated by 1px lines. The header holds the folders toggle, the folder path, **Copy link to this folder** (a ghost `Link2` icon button), **Bookmark history** (a ghost `History` icon button), the shortcuts help (hidden below 640px, where `?` still opens it), and the tools toggle. The path takes the room the buttons leave; the shortcuts help, Organize, and tools buttons sit in one group that never shrinks, so nothing overlaps at any width. A path longer than `max_folders` (`config/ui/manager-breadcrumb.toml`) shows its first folder, a ghost ⋯ button whose menu lists the folders in between, and its last folders. The table toolbar wraps: the filters come first, and the view controls (saved searches, **Browser order**, **View**) go to their own line when the filters need the room. Defaults are for someone who has only used the browser's star: the page opens on the bookmarks bar, the table shows **Title**, **URL**, and **Date Added** (`default_columns`) in the browser's order (the **Sort Order** setting's default) 50 rows a page (`config/ui/manager-table.toml`), and one search box matches titles and addresses. Table rows are 32px like the tree rows beside them (cells padded 4px by 12px, a 40px header row), so a folder of 40 items fits on one screen. Until the user sizes them, **Title** and **URL** share the width the other columns leave, Title a bit more (`fill` in `config/ui/manager-table.toml`), and never go below their default widths; the dates keep a compact fixed default, and a width the user drags is kept on this device and wins over the share. The pinned actions column holds the ⋯ menu and, while the row is hovered or holds focus, the four move buttons (24px ghost icon buttons) in room the column reserves for them, so they never cover the date or any other cell. The rarer address and folder filters wait behind a ghost **More filters** button, which stays open while one of them is in use. While the table is not in the browser's order, muted text before **Browser order** names the order ("Order: Title, sorted ascending"); the button is pressed while it is, and inert when the setting's order already is. The footer counts items in words ("12 items", or "2 of 12 selected"). The address carries the folder and the search (`?id=`, `?q=`; `src/lib/manager-url.ts`), and the tab title reads most specific first, like every extension page: the search or the folder, then **Bookmarks**, then the extension name (`Work - Bookmarks - Bookmark Scout`). The table is an ARIA grid with one tab stop (roving tabindex, arrow keys between rows), selected as in Chrome's manager: a click selects a row, Ctrl or Cmd adds one, and Shift extends from the anchor. A selected row is `teal-wash` (`bg-accent`, also behind the pinned actions cell), a focused row has a 2px inset teal ring, and a double click opens it. The selection's actions bar follows the pagination, sticky at the bottom of the scroll area, so selecting never moves the rows; rows keep its height (plus the scroll area's bottom padding) as their bottom scroll margin (`--selection-bar-height`), so a row the keys move to never ends up under it. When the focused row is deleted or moved away, focus goes to the next row, else the previous one, else the table's frame, as in Chrome. Right-click menus (`ContextMenu` in `src/components/ui/context-menu.tsx`, styled as dropdown menus) on rows and tree folders list bookmark actions from the action registry (`src/services/actions.ts`) in the sections `config/ui/actions.toml` gives the item menu (edit, clipboard, open, then Delete, drawn in the destructive color because its risk is `destructive`) with a 1px separator between them; the row's ⋯ menu shows the same list. When the commands the user kept in Options do not apply to what was clicked, the menu shows one disabled **No actions available** item instead of opening empty, and Options keeps one command that works on any single item (`[item_menu] keep_one_of`). The header's ⋮ **Organize** menu (ghost icon button, after the shortcuts button) and the table's empty-space menu hold the folder-menu actions the same file lists; the empty-space area (and drop area) fills the room below the rows down to the pagination. Actions name their icon (`ActionIconName`), mapped to Lucide components in `src/components/ui/table/action-icons.ts`. Adding a bookmark or folder reuses the edit dialog. Rows and tree folders drag with the browser's own drag and drop (`use-manager-drag-drop.ts`): the drop target shows a 2px `primary` line above or below a row when the drop goes beside it, or a `teal-wash` fill with a 2px `primary` ring when it goes into a folder (the `data-drop-zone` styles in `theme.css`); zone sizes are shared with the popup tree in `config/ui/drag-drop.toml`, and a tree folder has the same zones (beside it on its top and bottom edges, a 2px `primary` line; into it in the middle and on an open folder's bottom edge). The folder tree is an ARIA tree like the popup's: flat `treeitem` rows (32px, indented 12px per level up to 6 levels, `config/ui/manager-tree.toml`; deeper rows indent no further and show their depth in a small muted number before the chevron) with their level, position, and set size, one tab stop, the same keys (`TREE_KEY_BINDINGS`), a selected row in `teal-wash`, and a focused row with a 2px inset ring. A focused folder also answers the table rows' Delete, rename (F2, or Enter on a Mac, where Cmd+O and Space open it), open, and Ctrl/Cmd+C, X, and V keys. The chevron is mouse-only, since the arrow keys open and close rows. When Chrome keeps bookmarks both in the account and only on this device, the top-level folders sit under two headings (**In your account**, **Only on this device**; medium weight, muted, no icon), the second closed at first, as in Chrome.
- **Tools sidebar:** sections and tools in the order of `config/ui/tools-sidebar.toml` (cleaning up first, AI last, then Data). A card that can run on a folder or on all bookmarks starts on its Default Scope setting, which is **All Bookmarks** for every tool but AI Folder Reorganization (`config/settings/*.toml`), and on **All Bookmarks** at the manager's top level (`top_level_scope`); the export card starts on `export_scope` (**All Bookmarks**).
- **Options:** opens on **Essentials** (`config/ui/essentials.toml`, `getEssentialsCategory`): the few settings most people change, drawn with the same rows, keys, and stored values as in their own tabs, then an `options-panel` "AI is optional" whose **Set up AI** button opens the AI tab. In the category list, a small muted **Advanced** label (meta type, not a tab) sits above every other category; **For developers** (local AI agents) comes last. Search reads only the categories, so it lists each setting once, in its own tab. Search and a vertical category list on the left (categories and their titled sections are one table, `buildCategories` in `src/lib/settings-schema.ts`; each section has an `h3` heading, the tool sections reuse the Tools sidebar titles, and AI services, the activity log, and the prompt library are panels placed by their section). A tool section carries its Enable switch beside the heading and folds to a one-line note while it is off. Technical settings go in the section's `SettingsAdvancedFold` (a dashed, closed fold whose button lists what is inside; only for 3 or more settings), which opens for a search match or a changed value. Related settings share one row (`getSettingsFieldGroups`): a `checklist` of on/off options, a `pair` of numbers side by side (popup size, tags per bookmark, bookmarks per folder), or a `switch` row whose numbers and choices sit under the switch and are disabled while it is off (recent folders, site icons) (wrapping into rows above the settings below 640px), the settings for the selected category on the right, and a sticky footer holding **Back up settings**, **Restore settings**, **Export Bookmarks**, **Reset All**, and a failed-save message when there is one. **Reset All** asks first in a `ConfirmDialog` that says it resets the synced and the device-only settings, and its toast offers Undo. Settings save as they change; there is no Save button and no success message. Each row keeps a fixed slot for its reset button, so a control never moves when the button appears or disappears. Whole numbers use a − / value / + stepper that also takes typing and clamps to the range on commit; a slider is used only for fractional values such as a confidence. A choice of up to three short options is a segmented control, one click to change; longer lists, or labels too long in the current language, stay a dropdown. Related on/off settings appear together as one checklist row with a single reset. Results of an action on the page, such as Refresh Models or Verify Service, show inline under the button that ran it, not as a toast. While the action runs again, the last result stays in place, dimmed (`aria-busy`), until the new one replaces it, and the button keeps the width of its longer label (`SteadyLabel`: idle and busy labels share one grid cell), so nothing below or beside it moves. The page reserves the scrollbar's room (`scrollbar-gutter: stable` on its `<html>`), so switching between a long and a short tab does not shift it sideways.
- **Welcome page** (`welcome.html`, `WelcomePage`, opened once after install): a centered 672px column on the page background: the 48px extension icon beside the heading and one intro line, then the steps as numbered rows in one bordered card (a 28px `accent` number circle, a semibold title, the text in `ink-soft`; the shortcut step shows the keys as `Kbd` caps and, in Chrome and Edge until quick save has the browser's bookmark keys, a `link` button **Use Ctrl+D instead** that opens the shortcut steps in Settings, as the popup's quick save tip does), then a one-line note with an icon, then **Open settings** (`outline`) and **Read the guide** (a link styled as a `ghost` button). The heading uses the body font: the display font is Latin-only.
- Spacing uses a 4px unit. Rows are 32px, controls are 28, 32, or 36px, and the search field is 40px.
- No horizontal scroll at the popup's 300px minimum or at 320px page width.

## Elevation and depth

- Depth comes from the surface ladder (`paper` to `surface` to `sunken`) and 1px `line` borders.
- Menus (dropdown and right-click) stack above toasts, so a long menu is never covered by the toasts at the bottom right; a menu taller than the room it has scrolls.
- Popovers, menus, and dialogs are the only elements with a shadow: one soft shadow so they separate from the page under them. The quick save notification, drawn over web pages, has the same kind of shadow.
- Dragged rows lift with the same shadow and a 2px teal drop indicator. Never blue or other hard-coded colors.

## Shapes

- `rounded.sm` for marks, keycaps, and badges. `rounded.md` for rows, inputs, and buttons. `rounded.lg` for cards, notices, and toasts. `rounded.xl` for dialogs. `rounded.pill` for chips and switches only.
- Icons are lucide at 16px in rows and buttons and 14px in badges and metadata, at 1.75 stroke.

## Components

**`search-field`** (`BookmarkSearch`): sunken fill, Search icon, placeholder in `ink-soft`, and a keycap hint (`/`, which focuses the field) at the end that hides while typing. One 24px ghost icon button (`SlidersHorizontal`, **More search options**, teal while any option is on) opens a menu of checkbox items for Match Case, Match Whole Word, and Advanced pattern search (regex); closing it returns focus to the field. Search history opens as a listbox under the field on click or `Alt+↓`; a plain `↓` always moves into the tree. The text stops before that button, and when the field is too narrow for the full placeholder it shows a short one and drops the keycap hint, and no placeholder at all when even the short one would be cut off (the 300px popup with AI on). Ghost icon buttons follow the field on the same row: expand or collapse all results (while searching), **Open bookmark manager** (`LibraryBig`; opens `bookmarks.html` in a new tab, and is the only way into the manager in Firefox), the theme toggle, and the AI buttons when AI is on and its default service is set up. When the row is too narrow to leave `min_text_width_px` (`config/ui/popup-search.toml`) for typing beside every button it can show, the buttons wrap to a second row under the field, aligned to the end (`data-stacked` on `search-row`); the check counts the buttons a search adds (expand all, clear) before they appear, so the layout never moves while typing. With AI on this is the 300px to 400px popup.

**`tree-row`** (`FolderRow`, `BookmarkRow`, inside `PopupTree`): a 32px row (a bookmark row grows with a larger favicon size so icons never touch) in this order: chevron slot (16px), icon (favicon or folder), title, then a count in metadata type. Hover is `sunken`, keyboard-active is `teal-wash` with a teal icon, and focus-visible adds a 2px teal ring inset. Children indent by the chevron slot plus its gap (`config/ui/popup-tree-view.toml`). The tree renders only the rows on screen (`flattenVisibleTree` and TanStack Virtual), so expanding everything or scrolling a library of thousands of bookmarks stays fast; rows are ARIA `treeitem`s with their level, position, and set size, and a folder opens and closes without animation, as in other large trees. A bookmark row's native tooltip (`title` on the row, `bookmarkRowTooltip`) is its whole title and then its address; a folder row's is its whole name. The title text inside sets none, so the row's own tooltip shows wherever the pointer rests; a plain attribute keeps the virtualized rows cheap. While the tree is sorted by date or name, its visible order is not the browser's, so a drag only moves items into other folders (a folder row, or the folder of a bookmark row elsewhere); rows of the item's own folder take no drop, and for the length of the drag a hint (`tree-drag-hint`, meta type on `sunken`, 1px top line) takes the `hint-bar`'s place below the tree, so no row moves or hides under the pointer. Drops beside rows reorder only under **Folders First** (`treeShowsBrowserOrder`). In the side panel, a link dragged in from a web page drops into a folder row (the same `teal-wash` fill and 2px `primary` ring) and is bookmarked there. The **Drag and Drop in the Tree** setting (`treeDragAndDrop`) turns off both kinds of drop in the popup and side panel. Do not wrap tree rows in a component that tracks animations per row, such as Base UI's Accordion or Collapsible: each one queried `getAnimations()` after opening, which froze the popup for minutes on a large library.

**`row-actions`**: icon buttons (24px) overlaid at the row's end on the row's current fill, shown on hover and focus-within, and never reserving width when hidden. The manager table is the exception: its move buttons sit in the pinned actions column's own room, because an overlay there covered the Date Added text. Each one has an `aria-label` and a tooltip.

**`keycap`**: shortcut glyphs in a 20px sunken box with a 1px line. Use the platform's modifier (⌘ on macOS, Ctrl elsewhere) and print keys as the keyboard does: Apple platforms show ⌥, ⇧, and ⌫ where others show Alt, Shift, and Backspace (`shortcutKeyCaps`). Arrow and Enter keys are drawn as 12px lucide icons (the bundled fonts lack some arrows, which then fell back to a smaller system glyph); the glyph stays as screen-reader text. Used in the hint bar, tooltips, and the shortcuts help dialog. The extension knows the platform, so it never shows both forms of a shortcut; static copy that has to name both modifiers puts the Mac one first ("Cmd/Ctrl-click"), as the docs, website, and store listings do (`[display]` in `config/ui/shortcuts.toml`).

**`path-label`** (`PathLabel`, `src/components/ui/path-label.tsx`): a folder path on one line that truncates in the middle: the parent folders shrink to an ellipsis first and the last folder stays whole (up to three quarters of the width), with the full path as the native tooltip. Used for the manager's Folder filter options and chips, where end truncation made sibling paths look the same.

**`hint-bar`**: the popup footer: `/ search`, `↑↓ navigate`, `←→ close or open folder`, and `↵ open`, or `↵ save here` while a folder row (in the tree or the folder matches) is focused. While the search box has focus and folders match, it shows `↵ Save to <folder>` first, naming the first match (its folder name truncates, and it never drops out at narrow widths), then `↑↓`; the search box names that hint as its description.

**`folder-matches`** (`FolderMatchesPanel`): "Save to folder" while searching, between the AI suggestions and the tree: the folders whose names match (`findFolderMatches`, `src/lib/folder-match.ts`), best first, one 32px row each with the name and then its parents in `ink-soft`, which truncate first. Rows are tree rows for the keyboard, so ArrowDown from the search box lands on the best match and Enter saves there. The first row is the combobox's default option: it is highlighted (`data-active`, the accent wash) while the search box has focus, and Enter in the search box saves there, after applying the typed text at once; Enter while an IME is composing, or held down, never saves. While the pointer is over the list or focus is in it, the rows keep the order they were shown in (`holdFolderMatchOrder`), so a save that makes a folder recent does not move the row under the pointer; the new ranking shows once both leave, or as soon as the search text changes. The list takes at most a share of the popup height (`config/ui/popup-folder-matches.toml`) and scrolls beyond it; Settings > Search turns it off, sets how many rows it shows, and turns typo matching on or off. It only shows shortcuts that exist in `use-popup-shortcuts.ts`.

**`chip`**: recent folders and saved searches. 24px, pill, 1px line; the selected chip uses `teal-wash`. A recent folder chip shows the folder's name; when two chips share a name, each adds the closest parents that tell them apart in `ink-soft` after the name (`labelRecentFolders`), and its accessible name says the same ("Add to "Work / Inbox""). Its tooltip always has the full path.

**`button`**: `default` is teal, `outline` is surface with a line, `ghost` has no fill, `destructive` is danger. Sizes are `sm` (28px), `default` (32px), and `lg` (36px); icon sizes are 24px and 28px. Do not override heights per call site.

**`checkbox`** (`Checkbox`): a 16px box with a 1px primary line, filled when checked. A partly selected group, such as the table's select-all, is indeterminate and shows a dash, never a check.

**`badge`**: counts and states in a table or result. Neutral badges are `sunken`; semantic badges use their wash with their text color.

**`notice`**: warnings and errors inside dialogs and tool results: an icon, one or two sentences, and an optional action, on the semantic wash with a 1px semantic line.

**`checklist`** (`BuiltinAIDeviceCheck`, "Check this computer" for the built-in AI): a fold like **More settings**, then rows in one bordered `rounded.md` box with 1px dividers, each a 16px state icon (pass `CircleCheck` in `success`, fail `CircleX` in `destructive-text`, warning `CircleAlert` in `warning`, unknown `CircleHelp` in `ink-soft`) with a screen-reader label naming the state, the label in `ink-soft` in a fixed column (stacked above the value under 640px), the value, and the requirement in meta type under any row that does not pass. Advice and its outline buttons follow below the box, never inside it.

**`empty-state`**: a 24px lucide icon in `ink-soft`, one sentence that says what is empty, and one action that fixes it ("Clear search", "Add bookmark"). No emoji.

**`loading`**: skeleton rows at row height for lists and tables; a spinner only inside a button that is running a task.

**`error-state`**: what failed and a Retry button, in `danger` text. Every page has a localized error boundary.

**`searchable-select`** (`src/components/ui/searchable-select.tsx`): a select whose popup starts with a search box, for lists too long to scan, such as the AI provider picker. Options can be grouped under small labels. A group too long to scan can wait for a search (`searchOnlyGroups`; the selected option stays listed), with one meta-type line under the list saying how many more a search finds (`searchOnlyHint`): the Add service picker shows featured, local, and custom providers, and the models.dev catalog once the user types.

**`ai-intro`** (`AIIntroPanel`): an `options-panel` at the top of Options > AI, above the AI Features switch, while the default AI service is not set up: "AI is optional", the next steps, then four short points with 16px violet icons (what AI does, what it needs, what it may cost, what is sent), and a **Read the AI guide** link to the docs. Where Chrome can run its built-in model (`canOfferBuiltinAI`), the box starts with **Free on this computer** (`builtin-ai-suggestion`): a 16px violet Laptop icon, the title in medium weight, one muted sentence, and a small **Use built-in AI** button, on the `accent` wash with a 1px primary line; it adds the service as the default and goes once one exists. The service editor puts **Get an API key from <provider>** (a `url-link` with an external-link icon) under the key field for providers whose file has a `key_url`.

**`builtin-ai-status`** (`BuiltinAIModelStatus`): the built-in model's service editor shows only the name field and this block: a `notice`-style box per state (success "Ready", info "not on this computer yet" with the download size, what Chrome needs, and a default **Download the model** button, info "Downloading the model" with a 6px `primary` progress bar and percentage, warning for a computer that cannot run it, a policy that turned it off, or a browser without it), then a muted list of what it does not do, the languages it reads best, and that nothing leaves the computer. The service row shows a Laptop icon in place of a provider logo.

**`ai-setup-notice`** (`AISetupNotice`): a `footer-notice`-style line in the popup and side panel while AI Features is on but the folder suggestions' service is missing, has no API key, or is the built-in model before its download ("Download the built-in AI model in Settings"; the popup never starts the download) (`useAISetup`): a violet Sparkles icon, "AI is on but not set up yet", `·`, and a teal **Finish AI setup** that opens Options > AI. The AI buttons in the search row stay hidden until the service is set up, and the line takes the quick save notices' place, so the footer shows one line. AI tool cards in the Tools sidebar say the same and stay disabled.

**`quick-save-notification`** (`src/entrypoints/quick-save-toast/toast.ts`): what a quick save shortcut shows inside the web page, drawn without React in a closed shadow root, so neither the page's CSS nor its scripts reach it. The page has none of the extension's CSS, so the file repeats the color tokens above (light, and dark for the `theme` setting or, on System, the page's `prefers-color-scheme`) in a constructed stylesheet that page CSP does not block, and the fonts fall back to the system stack because a page cannot load the bundled ones. Layout: a 16px semantic icon (success check, ink-soft info for "Already in" and for a notification a newer quick save replaced, danger alert, teal spinner while AI chooses), the title ("Saved to React") in 14px 600, the path in meta type, an optional note, then an outline **Undo**; after a failed AI quick save a teal **Retry** (or **Open AI settings** when AI is not set up) and an outline **Save without AI**, which saves the same page by the Quick save setting; then **Move to** and the alternatives as 24px pill chips. A button pressed in an older tab's notification after a newer quick save says "A newer quick save replaced this one" instead of acting, since only the last quick save is kept. It is the one floating element with a shadow outside dialogs, because it sits over arbitrary pages. Placement: the host hangs off `<html>` and opens as a manual popover in the top layer where the browser has one, so a `filter`, `transform`, `will-change`, or `contain` on the page's `<body>` cannot hold it in place, and in Chromium the page's `<html>` filter cannot recolor it (Firefox still applies a root filter to the top layer); inline `!important` styles reset what the page could still pass down (`direction`, `writing-mode`, `filter`, `transform`, and `zoom`, which is set to cancel a `zoom` on `<html>`), and its direction comes from the app language, never the page. After drawing, it checks it is inside the viewport and on top at its center (`visible_tolerance_px`); when not, it removes itself and the badge and popup show the result. A view goes only to the document that showed the quick save first and only while the tab shows the same address, so an AI quick save the tab navigated away from also ends in the popup. A 2px teal bar counts down the auto-close (`config/ui/quick-save.toml`); hover and focus pause it, and reduced motion hides it and stops the spinner. It is a polite `role="status"` region named "Bookmark Scout", never takes focus, `Esc` closes it, and only trusted clicks act. The popup shows the same content and buttons as **`QuickSaveResultPanel`** when the page could not show it, with the page's title in meta type under its heading, since the popup is not on that page.

**`folder-setting`** (`FolderSettingSelect`): a setting of type `folder`, drawn as a `searchable-select` of every folder by its path ("Bookmarks bar / Work"), with **Not chosen** first; a chosen folder that was deleted stays listed as **Deleted folder**.

**`sortable-list`** (`SortableList`, `src/components/ui/sortable-list.tsx`, rules in `src/lib/sortable.ts`): an ordered list that reorders by drag and drop (Pragmatic drag and drop), after Atlassian's guidelines. Each movable item starts with a 28px ghost handle (`GripVertical`, grab cursor) that drags the item and is also a menu button (it opens on click, not on press, so a press can start a drag) with **Move to top**, **Move up**, **Move down**, and **Move to bottom**, so every move also works from the keyboard. While dragging, the item stays at 40% opacity, a small `card` preview with its name follows the pointer, and Atlassian's `DropIndicator` (`pragmatic-drag-and-drop-react-drop-indicator`, recoloured to `primary` through its `--ds-border-selected` token) draws a 2px line with a ring terminal in the gap it will land in, only where the drop would change the order; the window auto-scrolls near its edges (`pragmatic-drag-and-drop-auto-scroll`). The moved item flashes `teal-wash` for `flash_ms` (`config/ui/sortable-list.toml`; a held tint with reduced motion) and the move is announced in a live region ("Edit moved to position 1 of 6"). Items that keep their place (`isMovable`, such as hidden menu commands) show an empty handle slot and take no drops; the others reorder only among themselves. Inside a list that already offers the same moves another way (the manager's **View** menu, whose columns keep their arrow buttons), `moveMenu={false}` makes the handle a drag grip only (`sortable-grip`, not focusable); a list that scrolls by itself (`scrollable`) auto-scrolls near its edges. Used by Settings > Bookmark manager menus and AI services, and in the manager by the **View** menu's columns and the **Saved searches** list. The manager table's headers reorder the same way across a row (`DraggableTableHead` with `useColumnReorder`): the sort menu button is the drag handle and opens on click, the dragged header dims to 40%, the same line marks the left or right edge it will land on, and the header menu adds **Move left** and **Move right**. Moves of rows and folders by drag and drop in the manager are announced in the same live region, worded like the popup's move toasts.

**`file-drop-target`** (`useFileDrop`, `src/hooks/use-file-drop.ts`, on Pragmatic drag and drop's external adapter): where a page has a file button, the same file can be dropped instead, and the button stays the keyboard way. While files are dragged over the page, a target shows a 2px dashed `line` outline and a short hint, and the target under the pointer a `teal-wash` fill with a 2px `primary` ring. A whole-page target (Settings, which restores a dropped backup or settings file) shows a fixed `file-drop-overlay` inset 12px from the edges with its hint centered instead. Used by Tools > Import Bookmarks (HTML or JSON) and Settings (Restore settings). A file of another type is not passed on, and a toast says why.

**`history-dialog`** (`HistoryDialog`, `src/components/bookmarks/HistoryDialog.tsx`, view rules in `src/lib/audit-history-view.ts`): the manager's Bookmark history, opened by a ghost `History` icon button in the header (before the shortcuts help) or a result's **View in History** link. A dialog (`sm:max-w-3xl`, up to 760px tall) with a header, then a sunken search field and the filters as a `segmented-control` (All, Needs attention, Bookmark Scout, From elsewhere) with ghost Export and Clear icon buttons at the end, then the list: day headings in meta type (Today, Yesterday, then the date) that stay at the top while their rows scroll, and under each a bordered group of rows with 1px lines between them. A row is the action's 16px `ink-soft` icon (or Undo2 and Redo2 for an undo or redo), the change in 14px medium, its status, and under it the source and how many items in meta type; the time sits at the end before a chevron that turns when the row opens. A verified change shows only a 14px `success` check (its status in screen-reader text); every other status is a chip on its own wash (`warning` for partial, interrupted, needs review, and conflict; `danger` for not done). An open row shows a two-column list of facts (source, an agent's own name marked unverified, start, finish, result counts, and the read-back with its icon), an outline **Undo** while the session still has the change, or **Redo** on an undone change while it is the next one Ctrl+Y would redo (or a meta line saying why Undo is not available), teal text links to the linked undo or original, and the items as rows inside a bordered `card` list: the change's 14px icon, the title, the outcome at the end (`warning` when not done), the exact address in mono meta type, and what changed: the folder path and position before and after a move, and an old title or address struck through in `ink-soft` before the new one. Large changes list 100 items at a time. A change seen from elsewhere (Source unknown, or Detected after a gap with the interval it happened in) shows a neutral Observed chip, no result or read-back facts, and a meta line saying it cannot be undone here; an item whose earlier state was never recorded says so.

**`shortcuts-panel`** (`ShortcutsPanel`): an `options-panel` listing each browser command with its current keys and **Change shortcuts**, which opens the browser's shortcut settings (Firefox's `commands.openShortcutSettings`, or Chrome's and Edge's shortcut page, with the meta-type hint **Find Bookmark Scout on that page.** beside it, because that page lists every extension). Where the browser lets the extension set keys (`commands.update`, Firefox), each command has a `shortcut-recorder`; elsewhere its keys are keycaps, or **Not set**. In Chrome and Edge a muted paragraph under the list explains how to give quick save the browser's bookmark key (Ctrl+D, ⌘D) on the shortcut page, with an outline **Use Ctrl+D for quick save** button that opens it, and once it is set, how to undo it; the recorder refuses keys the browser keeps for itself (Firefox's Ctrl+D and Ctrl+Shift+D). Keys are re-read when the page regains focus or visibility.

**`shortcut-recorder`** (`ShortcutRecorder`): a read-only 32px text input (so screen readers pass keys through) showing the keys in mono, centered, with the command name as its label. Focus starts recording: held modifiers show with `…`, a valid combination saves at once and is announced in a polite live region, and an invalid one shows why in `danger` text under the field (`aria-invalid`, `aria-describedby`). `Esc` cancels and leaves the field; `Tab` and `Shift+Tab` are never recorded. A fixed reset slot (the settings row's `ResetSlot`) restores the suggested keys. The rules are `readCommandShortcut` in `src/lib/command-shortcuts.ts`.

**`footer-notice`** (`QuickSaveShortcutNotice`): one 28px line above the hint bar, in the hint bar's style, for something the user can fix in one step: a 14px icon, the message (truncates first, full text in its title), `·`, a teal text button, and a ghost dismiss button at the end. Shown only after its data and the stored dismissal are both read, so it never flashes; a dismissal is stored per device in `ui.dismissed-notices`. It shows one notice at a time, in order: a quick save command has no keys (**Set it up**), then a tip naming the quick save keys that work now ("Quick save: press ⌥⇧S on any page"), which in Chrome and Edge adds **Use ⌘D instead** (the steps in Options) and is left out once quick save has those keys; the tip, being an offer, hides when the popup is under 400px tall. Each is dismissed on its own.

**`dialog`**, **`toast`**, **`table`**: the existing primitives in `src/components/ui/`, themed by tokens only. Dialogs open in place with a fade and a slight zoom; they do not slide in from an edge. The toast viewport takes no pointer events and has no size while empty; only the toasts take clicks, so the area never blocks the controls under it.

**`confirm-dialog`** (`ConfirmDialog`): a dialog that asks before an action. It has a title, an optional explanation, and Cancel beside a confirm button, which is `destructive` by default. Use it for every "Delete …?" prompt instead of assembling a dialog by hand.

**`permission-dialog`** (`PermissionDialog`, opened by `usePermissionGate`): explains an optional permission before the browser's own prompt, for features whose prompt does not say why (website access, tab access). Title, a sentence on why, a muted sentence on what is read and how to take it back, then **Not now** and **Allow access**; the browser request runs from **Allow access**. The copy comes from the feature's entry in `src/lib/permission-catalog.ts`.

**`field`** (`Field`): a label with its description and an inline error, wired to the control through ids and `aria-*`. The `stacked` layout is for dialogs and editors, and the `setting` layout is for an Options row with the control and its reset button on the right.

**`options-panel`** (`OptionsPanel`): a boxed Options section with a heading, a description, optional actions on the right, and the content below, such as AI services, AI activity, or the prompt library.

**`prompt-text-area`** (`PromptTextArea`, the prompt editor's text): a monospace textarea. Typing `{{` opens a listbox right under it (popover surface, `rounded-md`, shadow) of the task's placeholders, each with its `{{name}}` in mono, its description, and its current value in muted text; the active option uses the `accent` fill. Focus stays in the text (ARIA `aria-activedescendant`): arrows move, Enter or Tab inserts, Escape closes only the list. Unknown placeholders are listed under the text in `text-warning`, never blocking Save, and the preview shows the rules the app adds after a rule line in muted text.

**`url-link`** (`UrlLink`, `src/components/ui/url-link.tsx`): every URL shown as text, in tables, tool results, review dialogs, and details. It keeps the surrounding text style and underlines on hover. A plain click opens it where Settings > Behavior > Open links in says (`useLinkClick`, which popup tree rows share); middle-click and modifier clicks keep the browser’s behavior, and the click never reaches the row around it. A bookmarklet or unparseable URL stays plain text.

**`list-editor`** (`TokenListEditor`, `StatusCodeEditor` in `src/components/options/ListSettingEditors.tsx`): list settings are never typed as comma-separated text. Names are mono chips with a remove button, added by Enter, comma, space, or paste, with dashed one-click suggestions from `config/ui/list-settings.toml`; HTTP status codes are a checklist of common codes in 2xx, 3xx, and 4xx columns (code in mono, the protocol reason phrase muted), plus other codes as chips. These rows use the `settingWide` field layout, with the editor under the label.

**`segmented-control`** (`src/components/ui/segmented-control.tsx`): a radio group drawn as joined segments in a 32px muted track; the selected segment is a raised card with medium-weight text. Arrow keys move the choice. `fitsSegmentedControl` decides per language from `config/ui/segmented-settings.toml` (option count and label width, CJK counting double).

**`number-stepper`**: in a settings row, the stepper and its unit slot fill the same 220px column as a select, so controls on a page start at one position whether or not they have a unit. Values stored in ms or KB can be shown in seconds or MB (`display` in the setting definition), and a fraction as a percentage. In a range (`SETTING_RANGES`), each stepper is limited by the other, so a minimum cannot pass its maximum.

**`mask-icon`** (`MaskIcon`): a one-color image, such as a provider logo, drawn as a CSS mask in the current text color.

**`provider-icon`** (`ProviderIcon`, `src/components/options/ProviderIcon.tsx`): every AI provider's icon, in the Add service picker (through `searchable-select`'s `icon` fallback) and the saved services list alike: its logo as a `mask-icon` where the provider has one, otherwise a lucide icon for its kind (Server for programs on this computer, Plug for custom endpoints, Laptop for Chrome's built-in AI), or the first letter of its name, so no row has an empty icon slot.

**`chat-suggestions`** (`ChatSuggestions.lazy.tsx`): the suggestion dock of Ask AI, between the conversation and the message box (the conversation's bottom line separates them), with 8px side gutters. It holds the buttons of the latest answer only (`latestChatSuggestions`), shows once that answer is complete (never while the model writes, never above its text), and is gone when the next message is sent; earlier answers keep none. It hides while the message box has text and returns when the box is empty, unless a save waits for approval. It takes at most a share of the chat's height (`config/ui/ask-ai-suggestions.toml`) and scrolls beyond it. One wrapping list: actions first (save, open, show) as `sm` `outline` buttons with a 14px lucide icon (bookmark-plus, external-link, folder-search), then questions and options, nearest the box they fill, as `chip`s (24px pill, 1px line, meta type, 12px question or lightbulb icon; a long one wraps instead of truncating). Questions and options show the model's words as plain text; every other label is built by the extension. A **Save to** button has two lines: "Save to <folder path>", then the page as `host · “title”` in meta type and `ink-soft`, truncated at the end so the site stays visible, with the full URL as its native tooltip (`title`). After the chat has read page text or web results, a save click shows the `ask-ai-approval` card under the buttons, inside the dock (the same card Ask AI uses for its own changes: the untrusted-content note, "Save “title” to <folder>", the full URL in mono meta type, **Approve** and **Decline**); the buttons wait until it is answered, and **Decline** leaves the button usable again. A used button stays disabled. In tab order the dock comes right before the message box, and a chip that sends a message returns focus to the box. The `suggestActions` call is not listed among the answer's steps.

## Writing

Copy is written for someone who has never used a bookmark tool beyond the browser's star.

1. Keep sentences under about 20 words and use everyday words. Explain a technical term the first time it appears ("regex" becomes "Advanced pattern search (regex)").
2. Start buttons with a verb that says what happens: "Back up settings", "Allow access to this site".
3. Put the important part first and make the next step obvious: "Quick save: press ⌥⇧S on any page".
4. Errors say how to fix the problem, not only what went wrong.
5. Use sentence case for new copy only where the surrounding UI already does; do not churn existing Title Case labels just for case.
6. Every user-visible string goes through `t()` and into every `public/_locales/<locale>/messages.json`, with a real translation.

When a feature is off, say so where its settings are (the "AI is off" notice above greyed-out AI sections, `SECTION_REQUIREMENT_NOTICES`) instead of leaving switches that look active.

## Do's and don'ts

### Do

- Keep the popup keyboard-first: focus starts in search, and arrows, Enter, and Escape always work.
- Use tokens through Tailwind theme colors (`bg-accent`, `text-muted-foreground`, `border-border`). Add a token in `theme.css` before reaching for a palette color.
- Use one icon color per surface: `ink-soft` for navigation, `teal` for active, violet only for AI.
- Give every icon-only button an `aria-label`, and every test target a `data-slot`, `data-testid`, or semantic class.
- Respect `prefers-reduced-motion`. Motion is 150 to 200ms fades and small scales on popovers, menus, and dialogs, and the tree chevron's turn; nothing else animates.

### Don't

- No hard-coded Tailwind palette colors (`text-amber-500`, `bg-indigo-100`, `rgb(...)`) in components.
- No gradients outside the extension icon. No gradient text or gradient headers.
- No emoji as icons, no uppercase section labels, no rainbow tool icons.
- No card grids for lists of tools or results; use rows with a 1px line between them.
- No second accent color for actions, and no shadows on cards or rows.
- No per-call-site button heights such as `h-5` or `h-10`.

## Responsive behavior

- The popup reflows from 300px to 800px wide: chips wrap onto another line, row titles truncate, row actions overlay instead of wrapping, and the hint bar drops its last hint below 360px.
- Below the width in `config/ui/layout.toml` (`both_sidebars_min_width`, 1280px, measured in #460 as the room the table needs) the manager keeps only one sidebar open. There is no separate narrow-screen rule.
- Options wraps the category list into rows above the settings below 640px.

## Iteration guide

1. Change tokens in `src/styles/theme.css`, then update this file. Brand token changes also update the root `DESIGN.md` and the website and docs design files.
2. Build new UI from `src/components/ui/` primitives and the components above.
3. Put user-facing copy in every `public/_locales/<locale>/messages.json`, following "Writing" above.
4. Run `nx run extension:lint`, the three build targets, `nx run extension:test:unit`, and the E2E targets. Check the popup at 300px and 400px and the manager at 1400px, in light and dark.

## Known gaps

- This file describes the target system. The extension is moving to it in phases: tokens and fonts, then popup and side panel, then manager, then options. Until a phase lands, its surface still uses stock shadcn zinc and the hard-coded colors listed in the don'ts.
- Store screenshots are not regenerated automatically when the UI changes.
