---
name: extension-ui-change
description: Restyle or redesign Bookmark Scout extension surfaces (popup, side panel, bookmarks manager, options, Tools sidebar) without breaking tests, themes, or locales. Use when changing design tokens, Tailwind or theme CSS, shadcn/Base UI primitives, layout, motion, or settings UX in apps/extension, or when the user sends a screenshot or recording of a UI bug. Covers the phased PR plan, token audits, Base UI quirks, visual checks, and the settings behavior the user expects.
---

# Extension UI change

Read `apps/extension/DESIGN.md` and the UI section of `apps/extension/AGENTS.md` first. Tokens, fonts, and animations live only in `apps/extension/src/styles/theme.css`, which every entrypoint imports.

## Workflow

1. **Reproduce on current `main` first.** A user screenshot of "wrong UX" once came from an installed build that was a version behind. Build (`bunx nx run extension:build:chrome`) and capture the screen in a disposable profile (`extension-exploratory-qa` skill) before changing code.
2. **Move test selectors before restyling.** Point E2E specs at `data-slot`, `data-testid`, or semantic classes (`.folder-item`, `.bookmark-item`) in a first PR, so the restyle PRs do not also rewrite tests.
3. **Ship one PR per phase** (tokens and foundations, then one surface per PR: popup, manager, options, Tools). Each PR updates `DESIGN.md` in the same change when the build deviates from it (for example, filter chips that wrap instead of scrolling sideways).
4. **Audit raw palette classes** and replace them with tokens, then check AA contrast in light and dark:
   ```bash
   rg -o "\b(text|bg|border|ring|fill|stroke|from|to|via)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}" apps/extension/src
   ```
5. **New copy goes into `en`, `ja`, and `ko`** in the same change; `tests/unit/locale-messages.test.ts` enforces key and placeholder parity.
6. **Visual check:** screenshots of every touched surface in light, dark, and a narrow width (see "Visual checks" below), then lint, unit, the three builds, and `bunx nx run extension:test:e2e`.

## Gotchas

- **Tailwind v4 never loaded `tailwind.config.ts`.** All `animate-*` classes were silent no-ops until `@import 'tw-animate-css'` went into `theme.css`. Put Tailwind setup in CSS (`@theme`, `@custom-variant`, `@import`), not in a JS config.
- **Remote fonts are blocked by the extension CSP.** Fontsource `url()`s stop resolving once the CSS is inlined, so `theme.css` declares `@font-face` rules by hand (Latin subsets) pointing at bundled files. Font licenses go in `public/licenses/`, and the Dependency Review license allowlist (`.github/workflows/dependency-review.yml`) must include the font's license (for example OFL-1.1) or the PR is blocked.
- **Primitives are shadcn on Base UI (`@base-ui/react`), not Radix.** `apps/extension/components.json` still has `"style": "default"`, which the shadcn CLI treats as Radix, so `bunx shadcn add` installs Radix code. Port new components to Base UI by hand. Base UI specifics seen so far:
  - Collapsible, Accordion, and other animated parts wait for their animations with `getAnimations()` after every open. Never render one per row of a long list: a tree of 1,500 Accordion items froze the popup for minutes when expanded (the tree is now `PopupTree`, virtualized, with no per-row animation). Measure list changes with `nx run extension:test:perf`.
  - Under `prefers-reduced-motion`, `theme.css` gives every transition a 0.01ms duration, and `transition-property` defaults to `all`, so any style change (a moved row's `transform`) lands one frame late. Put `transition-none` on elements positioned by script, such as virtual list rows, or measurements and drags taken right after a change hit the old position.
  - `DropdownMenu` radio items need `closeOnClick` to close the menu.
  - A `Collapsible` that settings search must open has to be controlled.
  - Base UI `Combobox` is the searchable select.
  - `Select` values can be `null`, and `Select` renders a hidden input after its trigger, so use `gap-*` rather than `space-x-*` around it.
  - Once a `Select` has opened, its `[role=listbox]` stays in the page inside a hidden `data-closed` popup. Code that asks "is a menu or dialog open" must use `hasOpenOverlay` (`src/lib/keyboard-shortcuts.ts`), which skips hidden, inert, and closed overlays; a plain selector count disabled every manager shortcut after Rows per page was changed (PR #641).
  - Base UI `Button` sets `role=button`; render links as a styled `<a>`.
  - A dialog scrolls to whatever it focuses when it opens. If fields are disabled while loading, focus falls to a footer button; focus the dialog itself instead.
  - Closing dialogs flashed their backdrop for one frame. The fix sets `--tw-animation-fill-mode: forwards` on `[data-closed]` (PR #518).
- **Radix-era motion classes.** shadcn's dialog classes such as `data-open:slide-in-from-left-1/2` and `slide-in-from-top-[48%]` assume Radix's translate-based centering. Once animations really ran, dialogs slid in from the left. Remove them so dialogs fade and zoom in place, and audit every `slide-*` and `zoom-*` class copied from Radix-era shadcn.
- **No `scrollIntoView` in the popup or side panel.** It also scrolls the document and cuts off the header. Set `list.scrollTop = list.scrollHeight` on the scroll container. Chat-style views are `flex h-full min-h-0 flex-col` with a `min-h-0 flex-1 overflow-y-auto` list; check them at real popup sizes, where the composer once sat off-screen.
- **Legacy stylesheets.** Delete old rules that fight the new tokens (for example `popup.scss` hover and lift rules) but keep their class names on the elements: E2E specs use them as hooks.
- **Formatting:** `biome check --write` across the app reformatted about 60 unrelated files. Format only the files you touched. Biome rejects `aria-label` on a plain `div`; give it a role or use a semantic element.
- **Type check:** `bunx nx run extension:typecheck` (runs `wxt prepare` first). `main` is clean and CI runs it, so any error is yours.
- **Shortcuts live in config.** A new or changed key goes in `config/ui/shortcuts.toml` (manifest command keys in `[commands]`, the browser's own keys in `[browser]`), read through `SHORTCUT_BINDINGS` and printed with `shortcutKeyCaps`, whose rules (`@bookmark-scout/config/shortcuts`) the docs, website, and README share. Only the standard ARIA tree, grid, and combobox keys stay in code. Then add the row to `apps/docs/content/docs/guides/keyboard-shortcuts*.mdx` in every language; `scripts/shortcut-mentions.test.ts` fails until you do. Never type keys in docs, website, README, or store text; the `website-docs-delivery` skill has the placeholders.
- **Hover transforms break geometry tests.** Rows that scale on hover changed a measurement by 0.07px and failed `popup-guards` on `main`. Move the pointer away (`page.mouse.move(0, 0)`) and let transitions settle before measuring; do not loosen tolerances.

## Settings UX the user expects

- Settings autosave and apply live. No "saved" toast or status text; show failures only.
- Controls never move under the cursor. Reserve fixed space for the per-row reset button (it once appeared and pushed the switch left), and test that the switch does not move.
- Counts use a −/value/+ stepper that also accepts typing, not a slider. Out-of-range values snap to the nearest allowed value on blur, and an empty field means "No limit". Sliders are only for 0–1 values.
- Group related on/off settings into checklists. Show Verify and Refresh results inline under their buttons, not in a corner toast.
- When making settings apply live, find every read-once site: `getSettings()` in one-shot effects, module-level constants, and background startup. Guard the hook's initial async read so it cannot overwrite a newer value the storage watcher already delivered. Panels that watch storage from another tab keep text the user is still typing. `<html lang>` follows the language.
- A language change re-renders the page and does not remount it. Remounting closed the Tools sidebar and reset open forms. Memos that depend on `t()` carry a `biome-ignore lint/correctness/useExhaustiveDependencies` comment explaining the language dependency, and a `React.memo` component that shows text calls `useLanguageRevision()` (as `FolderTree.tsx` and `ToolsSidebar.tsx` do), or it keeps the old language (CI caught it on PR #621).
- Tests that waited for a "saved" message read storage with `expect.poll` instead.

## Visual checks

- Keep one screenshot step file per surface under `~/.cache/bookmark-scout-qa/<topic>/` (for example `popup.ts`, `manager.ts`, `options.ts`) and run them with the `extension-exploratory-qa` runner.
- Set the theme with `setSettings(sw, { theme })` from `apps/extension/tests/e2e/storage.ts` (it writes the registry key and the `{ v, data }` envelope); capture light, dark, and a narrow width.
- Also capture keyboard focus and a short page. Two bugs showed only there: a row-actions overlay covering the focus ring's right edge (fixed with a 2px inset), and an Options footer floating mid-screen on short pages (fixed with a full-height column).
- The popup's width comes from settings (`src/hooks/use-popup-size.ts`), not the viewport. To see the 300px layout, set the popup size in settings; a 300px viewport alone does not. Check the short popup too: a new 28px notice line pushed the tree out of a 300px-tall popup, so optional notices hide below 400px of height. A fit check for a row must count controls that appear only once the user types (Expand all, Clear), or the row reflows mid-typing (`min_text_width_px` in `config/ui/popup-search.toml`, PR #645).
- In the manager, seed a 15-level folder and capture 600 and 420px widths. QA found the toolbar covering the filter, header buttons overlapping, and tree names squeezed to nothing past about 12 levels; the fixes are drawers below `sidebar_overlay_below_width` (`config/ui/layout.toml`), `max_indent_levels` (`manager-tree.toml`), and `max_folders` in the breadcrumb (`manager-breadcrumb.toml`), checked with bounding boxes in `bookmark-manager-layout.spec.ts`.
- Sticky bars must not move content under the pointer or cover focus: a selection bar that appeared on the first click shifted rows so the second click of a double click hit another row (PR #622), and focused rows need `scroll-margin-bottom` equal to the bar's height (PR #641).
- After a confirmed destructive dialog, move focus to the next row, else the previous one (`rowAfterRemoval`); otherwise it falls to `<body>` and keyboard users lose their place.
- When the user sends a screen recording, extract frames and build a contact sheet, then sample densely around the bug:
  ```bash
  ffmpeg -i rec.mov -vf "fps=1,scale=1280:-1" f%02d.png
  ffmpeg -i f%02d.png -vf "scale=640:-1,tile=4x6" -frames:v 1 sheet.png
  ffmpeg -ss 18.6 -t 1.4 -i rec.mov -vf fps=20 burst%02d.png
  ```

## UI drawn inside web pages

The quick save notification (`src/entrypoints/quick-save-toast/toast.ts`) is drawn into arbitrary sites, which style it in ways extension pages never do (PR #642):
- Attach it to `<html>`, not `<body>`, and put it in the top layer (`popover="manual"` and `showPopover()`, chosen by feature detection). A `filter`, `transform`, `will-change`, or `contain` on `body` makes it the containing block for `position: fixed`; the notification once rendered at y = -1451.
- After inserting, measure: the box must be inside the viewport (`visible_tolerance_px` in `config/ui/quick-save.toml`) and `elementFromPoint` at its center must hit it. If not, remove it and fall back to the badge and popup.
- `:host { all: initial }` does not reset `direction`, and `zoom` or `filter` on `<html>` still reach the element. Reset with inline `!important`, take the direction from the app language (`languageDirection`), and undo page zoom (`counterZoom`). Firefox still applies a `filter` on `<html>` to top-layer elements; that is accepted.
- Bind each result to the page that asked for it (a random token per document plus the URL without its fragment, `isBoundPage`), or a late AI answer lands on the next page.
- Test pages to keep: right-to-left, `zoom: 2`, `filter: invert(1)`, a transformed `body`, and a strict CSP (checked by hand in Firefox).

## Planning a redesign from references

Use the `feature-research-planning` skill. Specific to UI work: read reference repositories with `gh api repos/<owner>/<repo>/contents/<path>` (decode the base64 `content`) rather than web fetching, and inventory the current surfaces with a read-only subagent in parallel. The inventory alone found real bugs (animations silently off, two drifted token files) before any design work. `DESIGN.md` follows the Stitch DESIGN.md format: nine sections, YAML tokens referenced as `{colors.x}`.
