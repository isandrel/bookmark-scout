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
  - The accordion height variable is `--accordion-panel-height`.
  - `DropdownMenu` radio items need `closeOnClick` to close the menu.
  - A `Collapsible` that settings search must open has to be controlled.
  - Base UI `Combobox` is the searchable select.
  - `Select` values can be `null`, and `Select` renders a hidden input after its trigger, so use `gap-*` rather than `space-x-*` around it.
  - Base UI `Button` sets `role=button`; render links as a styled `<a>`.
  - A dialog scrolls to whatever it focuses when it opens. If fields are disabled while loading, focus falls to a footer button; focus the dialog itself instead.
  - Closing dialogs flashed their backdrop for one frame. The fix sets `--tw-animation-fill-mode: forwards` on `[data-closed]` (PR #518).
- **Radix-era motion classes.** shadcn's dialog classes such as `data-open:slide-in-from-left-1/2` and `slide-in-from-top-[48%]` assume Radix's translate-based centering. Once animations really ran, dialogs slid in from the left. Remove them so dialogs fade and zoom in place, and audit every `slide-*` and `zoom-*` class copied from Radix-era shadcn.
- **No `scrollIntoView` in the popup or side panel.** It also scrolls the document and cuts off the header. Set `list.scrollTop = list.scrollHeight` on the scroll container. Chat-style views are `flex h-full min-h-0 flex-col` with a `min-h-0 flex-1 overflow-y-auto` list; check them at real popup sizes, where the composer once sat off-screen.
- **Legacy stylesheets.** Delete old rules that fight the new tokens (for example `popup.scss` hover and lift rules) but keep their class names on the elements: E2E specs use them as hooks.
- **Formatting:** `biome check --write` across the app reformatted about 60 unrelated files. Format only the files you touched. Biome rejects `aria-label` on a plain `div`; give it a role or use a semantic element.
- **Type check:** `bunx nx run extension:typecheck` (runs `wxt prepare` first). `main` is clean and CI runs it, so any error is yours.
- **Hover transforms break geometry tests.** Rows that scale on hover changed a measurement by 0.07px and failed `popup-guards` on `main`. Move the pointer away (`page.mouse.move(0, 0)`) and let transitions settle before measuring; do not loosen tolerances.

## Settings UX the user expects

- Settings autosave and apply live. No "saved" toast or status text; show failures only.
- Controls never move under the cursor. Reserve fixed space for the per-row reset button (it once appeared and pushed the switch left), and test that the switch does not move.
- Counts use a −/value/+ stepper that also accepts typing, not a slider. Out-of-range values snap to the nearest allowed value on blur, and an empty field means "No limit". Sliders are only for 0–1 values.
- Group related on/off settings into checklists. Show Verify and Refresh results inline under their buttons, not in a corner toast.
- When making settings apply live, find every read-once site: `getSettings()` in one-shot effects, module-level constants, and background startup. Guard the hook's initial async read so it cannot overwrite a newer value the storage watcher already delivered. Panels that watch storage from another tab keep text the user is still typing. `<html lang>` follows the language.
- A language change re-renders the page and does not remount it. Remounting closed the Tools sidebar and reset open forms. Memos that depend on `t()` carry a `biome-ignore lint/correctness/useExhaustiveDependencies` comment explaining the language dependency.
- Tests that waited for a "saved" message read storage with `expect.poll` instead.

## Visual checks

- Keep one screenshot step file per surface under `~/.cache/bookmark-scout-qa/<topic>/` (for example `popup.ts`, `manager.ts`, `options.ts`) and run them with the `extension-exploratory-qa` runner.
- Set the theme by writing `bookmark-scout-settings` in `chrome.storage.sync` from `sw.evaluate`; capture light, dark, and a narrow width.
- Also capture keyboard focus and a short page. Two bugs showed only there: a row-actions overlay covering the focus ring's right edge (fixed with a 2px inset), and an Options footer floating mid-screen on short pages (fixed with a full-height column).
- The popup's width comes from settings (`src/hooks/use-popup-size.ts`), not the viewport. To see the 300px layout, set the popup size in settings; a 300px viewport alone does not.
- When the user sends a screen recording, extract frames and build a contact sheet, then sample densely around the bug:
  ```bash
  ffmpeg -i rec.mov -vf "fps=1,scale=1280:-1" f%02d.png
  ffmpeg -i f%02d.png -vf "scale=640:-1,tile=4x6" -frames:v 1 sheet.png
  ffmpeg -ss 18.6 -t 1.4 -i rec.mov -vf fps=20 burst%02d.png
  ```

## Planning a redesign from references

Use the `feature-research-planning` skill. Specific to UI work: read reference repositories with `gh api repos/<owner>/<repo>/contents/<path>` (decode the base64 `content`) rather than web fetching, and inventory the current surfaces with a read-only subagent in parallel. The inventory alone found real bugs (animations silently off, two drifted token files) before any design work. `DESIGN.md` follows the Stitch DESIGN.md format: nine sections, YAML tokens referenced as `{colors.x}`.
