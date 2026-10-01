# project

2026-10-01, whole-project migration of `apps/extension` from Radix UI to Base UI (`@base-ui/react` 1.8.0), transformation engine throughout. Verdict: every Radix wrapper and app import is migrated; 0 wrappers remain on Radix.

## Changed

### Strategy

- `shadcn info` reports `style: default`, `base: radix`, Tailwind v4 (via `@use "tailwindcss"` in SCSS). `default` is a legacy style with no `base-*` counterpart, so the radix goldens (`https://ui.shadcn.com/r/styles/default/<component>.json`) were used only to classify each wrapper; the transformation engine was then applied to the user's own files, keeping their classes and applying the class-mapping renames. No `shadcn add --overwrite`, no retargeting to another style.
- Classification: identical or formatting-only drift: button, label, separator, collapsible, scroll-area, tabs. Older registry versions: checkbox, popover, select, dropdown-menu. Customized: accordion, dialog, sheet, slider, switch, tooltip, sidebar, toast. Radix type import only: command (cmdk).
- Order (one commit each, bottom-up): button, label, separator, checkbox, switch, collapsible, scroll-area, slider, accordion, tabs, popover, tooltip, dialog, sheet, command, select, dropdown-menu, data-table-view-options, sidebar, toast. Follow-ups: details Open link (button), shared tool-card helper (dialog), select chevron glyph (select).

### Dependency swap

- Added `@base-ui/react@^1.8.0` to `apps/extension/package.json` (first commit).
- Removed (last commit): from the root `package.json` `@radix-ui/react-accordion`, `-checkbox`, `-collapsible`, `-dialog`, `-dropdown-menu`, `-label`, `-popover`, `-select`, `-separator`, `-slot`, `-switch`, `-toast`, `-tooltip`; from `apps/extension/package.json` `@radix-ui/react-slider`, `-tabs`. `@radix-ui/react-scroll-area` was used but never declared (transitive).
- `bun.lockb` updated with `bun add`/`bun remove`; `bun install --frozen-lockfile` passes. Radix packages remain in the lockfile only as transitive dependencies of cmdk and of the docs app's Fumadocs.

### App-code sweep (consumer-props.md)

- `asChild` to `render`: dialog trigger (`ManagerShortcutsHelp`), popover triggers (faceted and date filters), dropdown triggers (row menu, column header, view options), tooltip triggers (toolbar, sidebar). The details "Open link" became a styled `<a>` instead of a Base UI button rendered as a link.
- Accordion `type="multiple"` to `multiple` (`PopupPage`).
- Checkbox `checked="indeterminate"` to `indeterminate` (`columns.tsx`).
- Select: `items` added where labels differ from values, `null` guarded in every `onValueChange`, empty ids mapped to `null` so placeholders show.
- TooltipProvider `delayDuration` to `delay`.
- Dialog `onCloseAutoFocus` to `finalFocus` (`PopupPage`).
- Dropdown checkbox `onSelect={preventDefault}` removed; group labels wrapped in `DropdownMenuGroup`.
- Toast action `altText` removed (4 call sites).
- Class selectors: `data-[state=active]` (options tabs), `data-[state=open]` (column header button, reorganize chevrons, sidebar) rewritten; tailwind accordion keyframes use `--accordion-panel-height`.
- Tests: `bookmark-table-registry.test.ts` renders menu items in a Base UI `Menu.Root`; E2E shared helpers `toastRegion()` (region name `... (F6)`, optional localized label) and `toolCard()` (scoped to the tools sidebar); the tooltip spec selector; three literal region names now go through `toastRegion()`.
- Docs and comments: README stack tables (all templates and translations), docs status page, `apps/extension/AGENTS.md`, and three code comments that described Radix behavior.

### Leftover scan

`grep -rn "radix-ui\|@radix-ui" apps/extension/src apps/extension/tests apps/extension/package.json package.json` returns nothing. 0 wrappers in `src/components/ui` import Radix.

### Verification (NX_DAEMON=false)

| Check | Baseline (origin/main, before) | After migration |
| --- | --- | --- |
| `nx run extension:lint` | 0 errors, 8 warnings | 0 errors, 8 warnings (same pre-existing warnings) |
| `nx run extension:test:unit` | 40 files, 350 tests passed | 40 files, 350 tests passed |
| `nx run extension:build:chrome` / `firefox` / `edge` | pass | pass |
| `tsc --noEmit` (not a project target) | 17 pre-existing errors in 6 files | same 17, no new errors |
| `nx run extension:test:e2e` | 193 passed (5.5 min) | 193 passed (5.5 min) |
| `bun install --frozen-lockfile` | pass | pass |

Changed or helper-affected specs (`bookmark-manager-table`, `bookmark-workflows`, `popup-tree-actions`, `settings-behavior`, `tool-reports`, `toast-undo-stack`) were also run three times with `--repeat-each=3`: 132 passed, no flakes.

Visual check: built Chrome output driven with the `extension-exploratory-qa` runner in a disposable profile, light and dark themes, popup (tree, delete dialog, undo toast stack), manager (table, row menu, details dialog, View options, help tooltip, rows-per-page select, deletion toast), and options (tabs, select, switches, sliders). The same steps ran against an `origin/main` build for comparison; screenshots are in `~/.cache/bookmark-scout-qa/base-ui/{after,before}/shots`. Everything matched except two flagged differences: the Bookmark Details dialog opens scrolled to its focused footer button (dialog report), and the rows-per-page group sits 8 px further left (select report). No console or page errors.

## Left alone

- cmdk (`command.tsx` parts), react-day-picker (`calendar.tsx`): not Radix. No vaul, sonner, or recharts wrappers exist in the extension.
- `use-toast.ts`: unchanged; its reducer still owns the toast stacking policy.
- `apps/website`, `apps/docs` code: no Radix imports.
- FLAG (not fixed): `apps/extension/components.json` still has `"style": "default"`, which the shadcn CLI reads as `base: radix`. A future `shadcn add <component>` will deliver Radix variants. Choose a Base UI style (and accept its look) or add components by hand.
- FLAG (pre-existing, not fixed): `tailwind.config.ts` and `tailwindcss-animate` are not loaded by the Tailwind v4 pipeline (no `@config`/`@plugin` in the SCSS entries), so `animate-in`, `fade-*`, `zoom-*`, `slide-*`, `animate-accordion-*`, and `animate-toast-progress` produce no CSS. There were no enter/exit animations before the migration and there are none after; the selectors were renamed so the intent survives if the plugin is wired up later.

## Behavior changes

Flagged, not patched (details in each component report):

- tabs: manual activation (arrow keys move focus, Enter/Space selects); Radix selected on focus.
- dropdown-menu: checkbox/radio items stay open on click by default; keyboard focus loops.
- accordion: no built-in arrow-key navigation (the popup tree has its own).
- scroll-area: scrollbar always visible when content overflows (Radix showed it on hover).
- separator: always `role="separator"` (Radix's default was decorative).
- label: double click selects text (Radix prevented it).
- tooltip: no `role="tooltip"` element; skip-delay window 400 ms (was 300 ms).
- dialog/sheet: unmount a frame after closing; opening scrolls to the initially focused element (Bookmark Details opens scrolled down).
- select: `onValueChange` can emit `null`; collision padding 5 px; hidden input shifts `space-x-*` rows by 8 px.
- button: defaults to `type="button"`.
- toast: focus shortcut F6 (was F8) and region name "Notifications (F6)"; no per-toast "Notification" prefix; polite instead of assertive announcements; the X button is `aria-hidden` until the stack is hovered or focused; viewport portalled to `<body>`.

Preserved on purpose (user asked to keep toast behavior): toast actions close their toast; toasts keep `role="status"` (Base UI uses `role="dialog"`, which would also have tripped the keyboard-shortcut overlay check).

## Verify by hand

- Popup (light and dark): search, expand folders with keys, delete with and without confirmation, Undo from a stack of toasts, F6 into toasts.
- Manager: row menu, column header menu, View options, filters (popovers), date filter, rows-per-page select, details dialog and "Open link", help tooltip, bulk move select, tools dialogs and Escape.
- Options: tabs (note manual activation), every select, switches, sliders, AI provider fields, Japanese and Korean UI.
- Firefox and Edge: load the built extension and repeat a quick popup and manager pass (only Chromium runs E2E).
