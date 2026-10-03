# AGENTS.md

## Scope

This file applies to work under `apps/extension`.

Use it together with the repository root `AGENTS.md`. If there is a conflict, this file takes precedence for the extension app.

## Mission

This app is the primary product surface in the repository. Agents should treat it as production code with real user data, browser compatibility constraints, and privacy-sensitive AI features.

The standard for changes here is higher than "make it work." Changes should be maintainable, compatible with the current architecture, and safe across supported browsers.

## App overview

`apps/extension` is a browser extension built with:

- WXT
- React
- TypeScript
- Zustand
- shadcn/ui components on Base UI (`@base-ui/react`) primitives
- browser bookmark, tab, storage, and context-menu APIs

Primary target:

- Chrome

Secondary targets:

- Firefox
- Edge

Agents should assume Chrome is the default runtime path, but should not make Chrome-only assumptions when the code clearly supports other browsers.

## Local repository map

### Core runtime and bootstrapping

- `src/entrypoints/`: background, popup, sidepanel, options, bookmarks page, and other runtime entrypoints

### UI

- `src/components/`: reusable product UI and page composition
- `src/components/ui/`: lower-level UI primitives and shared controls
- `src/styles/`: style-specific files

### Interaction and state

- `src/hooks/`: UI behavior, drag-and-drop, filtering, and page interactions
- `src/stores/`: Zustand stores for shared state

### Business logic and platform integration

- `src/services/`: bookmark operations, AI provider integration, prompt configuration, import/export, and background-oriented logic
- `src/lib/`: storage, schema, helpers, logging, and lower-level utilities
- `src/types/`: domain and integration types

### Static and localized assets

- `public/_locales/`: extension locale files for `en`, `ja`, and `ko`
- `config/`: app config, one TOML file per domain (setting defaults with their bounds in `config/settings/`), loaded once by `src/lib/app-config.ts`, whose header explains how to add a file

Do not edit generated output or build artifacts under:

- `.wxt/`
- `dist/`

unless the task explicitly concerns generated artifacts or debugging generated output.

## Commands

### Primary commands

- dev server, Chrome: `nx run extension:dev`
- dev server, Firefox: `nx run extension:dev:firefox`
- dev server, Edge: `nx run extension:dev:edge`
- lint: `nx run extension:lint`
- build Chrome: `nx run extension:build:chrome`
- build Firefox: `nx run extension:build:firefox`
- build Edge: `nx run extension:build:edge`
- unit tests: `nx run extension:test:unit`
- Chromium end-to-end tests: `nx run extension:test:e2e`
- Edge end-to-end tests: `nx run extension:test:e2e:edge`
- Firefox end-to-end smoke tests: `nx run extension:test:e2e:firefox`

Equivalent scripts also exist in `apps/extension/package.json` when working directly in this app.

## Verification rules

### Baseline

For nearly any source change, run:

- `nx run extension:lint`
- `nx run extension:typecheck`

### Build validation

Also run one or more build targets when the change affects:

- runtime entrypoints
- provider wiring
- settings or configuration
- browser API integration
- manifest-adjacent behavior
- packaging or output structure
- code that may behave differently across browser targets

Relevant commands:

- `nx run extension:build:chrome`
- `nx run extension:build:firefox`
- `nx run extension:build:edge`

If a change is plausibly browser-specific, prefer validating the specific browser target involved rather than only Chrome.

### Automated tests

- Run `nx run extension:test:unit` for sorting strategy changes.
- Run `nx run extension:test:e2e` for changes to popup, settings, bookmark management, maintenance, reports, or import/export workflows covered by browser tests.
- The end-to-end target builds Chrome and installs Playwright Chromium and its platform dependencies automatically. CI runs `bun run test` on pushes and pull requests.
- Dead-link, metadata, and site icon requests have deterministic route-mocked Chromium E2E coverage, plus a real local HTTP server (no CORS headers) test that runs against a copy of the build with the optional website access pre-granted (`grantWebHostAccess` fixture option). `grantPermissions: [...]` does the same for optional API permissions such as `tabs` or `contextMenus`; the harness opens the popup as a tab, which gets no `activeTab`, so tests that save the current page grant `tabs`. Chrome grants a permission without a warning (`contextMenus`) without a prompt, so that request can run for real. The real browser permission prompt cannot be answered headlessly; the declined path is covered with a stubbed `permissions.request`. Provider-backed AI tools are covered by `[mocked provider contract]` unit and E2E tests with stubbed providers and synthetic keys; these do not prove live provider compatibility. Live network behavior and real providers remain manually verified.
- Edge and Firefox: `nx run extension:test:e2e:edge` runs the same Playwright suite (Playwright project `edge`) in the installed Microsoft Edge against `dist/edge-mv3`; install Edge first (`bunx playwright install msedge`). `nx run extension:test:e2e:firefox` runs the smoke suite in `tests/e2e-firefox/` against `dist/firefox-mv2`; it needs Firefox and drives it through geckodriver with `selenium-webdriver` because Playwright cannot open `moz-extension://` pages (Selenium Manager downloads geckodriver if needed). Run the Edge or Firefox target when a change is browser-specific. CI runs both as required checks (`Edge E2E` and `Firefox E2E smoke`).
- Do not hard-code one browser's permanent folder names (Edge says "Favorites bar" and "Other favorites"); read them from `chrome.bookmarks` as `otherBookmarksTitle` in `tests/e2e/popup-helpers.ts` does. A negative assertion on a missing title passes vacuously.

## Architectural expectations

### Keep entrypoints thin

Entrypoints should bootstrap runtime behavior, not absorb large amounts of business logic. If an entrypoint starts accumulating domain behavior, move that logic into the appropriate service, hook, store, or helper.

### Respect the current layering

Preferred responsibilities:

- `components/`: rendering and composition
- `hooks/`: reusable interaction logic
- `services/`: business workflows, browser integration, AI provider logic, import/export, and prompt orchestration
- `stores/`: shared client-side state
- `lib/`: utilities, schemas, storage, helpers, and low-level abstractions

Do not duplicate the same workflow across component code and service code. Extend the existing layer where the behavior already belongs.

### Auto-imports

WXT auto-imports every export from `components/**`, `hooks/`, `utils/`, `lib/`, `services/`, and `stores/` (configured in `wxt.config.ts`), plus WXT APIs such as `browser`, `storage`, and `defineBackground`.

- do not add explicit imports for these exports; `@/types`, third-party packages, and assets still use explicit imports
- export names must be unique across the scanned directories; `wxt prepare` warns on duplicates
- do not add `index.ts` barrels in scanned directories; they are excluded from scanning
- generated declarations live in `.wxt/types/imports.d.ts` and refresh on `wxt prepare`, `dev`, and `build`
- auto-import can miss a use that lint, `tsc`, and unit tests accept (an identifier right before `:` in a ternary once became a runtime `ReferenceError` that broke HTML import); after a build, run `bun .agents/skills/extension-feature-test/scripts/scan-unresolved-imports.ts apps/extension dist/chrome-mv3`

### Shared building blocks

Use these before writing a new helper; each replaced several copies. Their file headers document the details.

- **Config:** add `config/<area>/<name>.toml` and read it once with `readConfig('<area>/<name>', z.strictObject({...}))` in the module that owns it (`src/lib/app-config.ts`); a unit test fails on unread or doubly read files. User-setting defaults and bounds live in `config/settings/**` and are defined once in `src/lib/settings-schema.ts`.
- **Storage:** `defineStoredValue` and `useStoredValue` (`src/lib/stored-value.ts`) for every stored key, registered in `STORAGE_KEYS` (`src/lib/storage-keys.ts`); `useSettings`/`useSetting` share one subscription per page.
- **Bookmark changes:** `applyBookmarkChanges` (`src/services/bookmarks.ts`) applies reviewed edits, removals, and moves (a move's `expect` can include the `parentId` it had in the preview, and its target can create missing folders with `createPath`), skips items that changed since the preview, and returns counts (including `foldersCreated`) plus a single-use `undo()`.
- **Network:** `fetchHtmlPage` (`src/services/bookmark-network-tools.ts`) for any page fetch with a timeout and byte cap.
- **Permissions:** every permission is listed once in `src/lib/permission-catalog.ts` (required or optional per browser, plus each feature's API permissions, origins, Firefox data collection categories, and copy keys); `manifest.config.ts` builds the manifests from it. Check with `hasPermission(feature)`, request with `requestPermission(feature)` as the first call in a click handler (Firefox rejects a request after any `await`), and react with `watchPermissions` (`src/services/permissions.ts`). In pages use `usePermission`, `usePermissionGate` (explanation `PermissionDialog`, denial toast, `tryFirst` for work that may already be allowed), and `useEffectiveSetting` (`src/hooks/use-permission.tsx`). A setting that needs a permission goes in `SETTING_PERMISSIONS` (`src/lib/settings-schema.ts`): Options requests it when turned on, and the feature counts as off while the permission is missing, without rewriting the synced value. A new optional permission is a catalog entry, not new code.
- **AI prompts and tools:** `getPromptVariables`/`buildPrompt` (`src/services/prompt-config.ts`) for both preview and runtime; `getToolOptions`/`getToolScopeCapability` (`src/services/tool-options.ts`).
- **Tools sidebar:** add a tool as an entry in `TOOL_DEFINITIONS` (`src/components/bookmarks/tools/tool-definitions.ts`); `createToolRun` (`tool-run.ts`) and `useToolRun` (`src/hooks/use-tool-run.tsx`) own scanning, review, apply, partial outcomes, and undo, and `ReviewApplyDialog` is the shared review dialog. `createUndoOffer` (`tool-run.ts`) is the one undo the toast and the review share: it runs at most once, never after it expires, and hides Undo in both when used or expired.
- **Deleting bookmarks:** `useBookmarkDeletion` / `deleteBookmarksWithUndo` (`src/hooks/use-bookmark-deletion.tsx`) with `BookmarkDeleteDialog`, used by both the popup and the manager. It re-reads each item first and skips one deleted or changed (title or URL) since it was chosen, and reports `{ deleted, skipped, failed }` to `onDone`.
- **UI:** `toast.success`/`toast.error`/`toast.withUndo` and `quoteToastItemTitle` (`src/hooks/use-toast.ts`), `getErrorMessage`, `formatPercent`, `formatList` (`src/hooks/use-i18n.ts`), `Field`, `ConfirmDialog`, `MaskIcon` (`src/components/ui/`), `OptionsPanel`, `mountExtensionPage` for entry pages, `SHORTCUT_BINDINGS` with `shortcutKeyCaps` for any shortcut shown in the UI.
- **Small helpers:** `src/lib/bookmark-tree.ts` (tree walks, display titles, the bookmarks-bar folder lives in `services/bookmarks.ts`), `src/lib/units.ts`, `isPlainObject`/`isSameJson` in `src/lib/utils.ts`, `truncateText`.

### Bookmark operations

- centralize bookmark reads, writes, moves, deletes, and reorganizations
- avoid scattering raw browser bookmark API calls across many UI components
- preserve confirmation and safety behavior for destructive operations

### Browser-specific behavior

- be careful with cross-browser API assumptions
- do not introduce a fix that works only for Chrome if the existing code clearly supports Firefox or Edge
- keep background, sidepanel, popup, and options flows consistent with their runtime boundaries
- use WXT's promise-based `browser.*` API, never callback-style `chrome.*`; Firefox's `browser` is promise-only, so a renamed callback call breaks there

## AI and provider guidance

The extension includes AI-assisted bookmark organization and recommendation features. These areas require extra care.

Rules:

- AI features must remain opt-in
- preserve the default disabled state for AI features unless the task explicitly changes product behavior
- keep provider creation and model wiring centralized in existing AI service files
- do not embed provider-specific logic deep inside UI components unless the current architecture already does so for a narrow reason
- preserve clear disclosure around what user bookmark data is sent to external providers
- put AI timeouts, sizes, and limits in a file under `config/ai/` and read it with `readConfig` and a strict zod schema in the module that uses it; never hard-code them
- write local server addresses as `localhost`, never `127.0.0.1`
- follow the `extension-ai-feature` skill in `.agents/skills/` for the end-to-end checklist

Featured, local, and custom providers are defined one per file in `config/ai/providers/<id>.toml` (validated by `src/lib/config/ai-provider-schema.ts`; `order` sets the picker position and `logo` the models.dev logo id). About 200 more come from `config/provider-catalog.json`, a snapshot of the models.dev catalog (MIT; license in `public/licenses/models-dev.txt`). Regenerate it with `bun run catalog:sync` instead of editing it by hand; it also refreshes the one-color provider logos in `public/provider-logos/`, which are drawn as CSS masks. The extension never fetches models.dev at runtime. Providers left out or marked without a model list after the 2026-10-02 endpoint probe are listed with reasons in `scripts/sync-provider-catalog.ts`. Model lists and connection checks go through `src/services/ai-model-list.ts`.

When working in AI-related files, check whether the logic already belongs in:

- `src/services/ai-client.ts`: provider factories and model wiring
- `src/services/ai-models.ts`: featured providers and catalog lookup
- `src/services/ai-model-list.ts`: model lists, Verify, and error classification
- `src/services/ai-settings.ts`: named services and `getActiveAISettings` (the default service; never read the legacy `aiProvider`/`aiModel`)
- `src/services/ai-activity.ts`: the logging fetch every provider call goes through
- `src/services/ai-agent.ts` and `src/services/ai-bookmark-tools.ts`: the Ask AI agent and its read-only tools
- `src/services/page-reader.ts`: page reading
- `src/services/prompt-config.ts` and `src/lib/prompt-library-storage.ts`: prompt tasks, `buildPrompt`, and saved prompts
- `src/services/ai-recommendation.ts` and `src/services/ai-reorganization.ts`: folder suggestions and reorganization

## UI and UX guidance

- read `DESIGN.md` in this app before changing UI, and update it when tokens or shared components change
- reuse existing UI primitives under `src/components/ui/` before creating new ones
- follow current patterns for dialogs, sheets, toasts, tables, filtering, and drag-and-drop
- follow the tokens, components, and do's and don'ts in `DESIGN.md` instead of introducing a separate design language
- keep component APIs small and understandable
- keep theme tokens, Tailwind setup, and animations in `src/styles/theme.css`, the one stylesheet every entrypoint imports
- give tests a `data-slot`, `data-testid`, or semantic class hook (`.folder-item`, `.bookmark-item`) instead of selecting on Tailwind utility classes, so restyling does not break E2E specs
- primitives are shadcn on Base UI; `components.json` still says `"style": "default"`, which makes `bunx shadcn add` install Radix code, so port new components to `@base-ui/react` by hand
- settings autosave and apply live with no success toast or status text; show failures only. A language change re-renders the page and must not remount it
- follow the `extension-ui-change` skill in `.agents/skills/` for redesign and restyle work

If a component becomes a container for too much logic, split responsibilities rather than continuing to grow it.

## Localization

Any new or changed user-facing extension string must be reflected in:

- `public/_locales/en/messages.json`
- `public/_locales/ja/messages.json`
- `public/_locales/ko/messages.json`

Do not leave new extension copy localized in only one language without explicitly noting the gap.

- Keep the custom translation hook (`src/hooks/use-i18n.ts`). `@wxt-dev/i18n` follows only the browser language and would remove the in-app Language setting (auto, en, ja, ko).
- Thrown errors that reach the UI, units, and log source names shown to users need locale keys too, not English literals.
- Reuse an existing key when the same concept already has one (prompt tasks reuse the tool title keys such as `tools_autoTagging`); near-duplicate keys drift apart ("Auto Tagging" versus "Auto-Tagging").

## Formatting and type discipline

Follow local Biome rules and established code style:

- 2-space indentation
- single quotes
- trailing commas
- line width 100

Format only the files you touched; `biome check --write` across the app reformats dozens of unrelated files.

Type rules:

- prefer `type` over `interface` unless interface behavior is required
- avoid `any`
- keep runtime and type boundaries explicit when working with browser APIs and provider payloads
- a `tsconfig.json` change also needs an E2E run: Playwright loads the extension's tsconfig itself and failed on a value `tsc` accepted (`"baseUrl": null`)
- run `nx run extension:typecheck` (it runs `wxt prepare` first); `main` type-checks clean and the CI Lint job runs it, so do not add errors or silence them with casts that hide a real mismatch

## Security and privacy

- never hardcode API keys or tokens
- treat bookmarks, bookmark titles, URLs, and provider settings as sensitive data
- avoid logging sensitive bookmark content
- preserve explicit consent and settings control for AI features
- do not weaken destructive-action protections around moves, deletes, exports, or reorganizations

## Change discipline

- keep changes narrowly scoped to the requested behavior
- do not edit generated output directories
- do not reformat unrelated files
- update user-facing copy or docs when the behavior materially changes
- if a fix requires a broader cleanup than expected, call that out explicitly rather than silently broadening scope
