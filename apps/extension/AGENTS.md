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

- `public/_locales/`: extension locale files, one folder per language (the list is `[locales] extension` in `config/project.toml`)
- `config/`: app config, one TOML file per domain (setting defaults with their bounds in `config/settings/`, one file per Options tab), loaded once by `src/lib/app-config.ts`, whose header explains how to add a file

Extension TOML modules are parsed by `build/toml-config.ts` through `?bookmark-scout-config`; parser-free `src/lib/config/runtime.ts` retains namespace checks, strict schemas, single ownership, and deep freeze. Bun scripts keep the raw `src/lib/config/loader.ts` API. A new data plugin must be registered in both `wxt.config.ts` and `vitest.config.ts`: WXT's Vitest integration does not inherit user Vite plugins.

Build-only helpers and budgets live in `build/`, outside the runtime config glob. Extension lint and `tsconfig.build.json` check them and the packaging checker separately from browser source; retain the required ambient type declarations when a helper imports application schemas. Production locale compaction and verified logo deduplication operate on copied output only; translation/catalog/SVG source files remain maintainable.

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
- AI features against a real provider: `nx run extension:test:live` (`tests/live/README.md`; skipped without the `BS_LIVE_AI_*` variables)
- latency and scrolling measurements on a large library: `nx run extension:test:perf` (`tests/perf/README.md`; run it before and after a change meant to make something faster, and quote both numbers)

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
- The end-to-end target builds Chrome and installs Playwright Chromium and its platform dependencies automatically. Tests run in parallel (`fullyParallel`): locally on half the cores, at most 4 workers, and on CI on 2 workers per shard, with one retry on CI only. Set `PW_WORKERS` (a count or a percentage) or pass `--workers` to change it; the defaults live in `playwright.config.ts`. CI runs the unit tests in their own job and the Chromium and Edge suites as three shards each, summarized by the required `Extension Tests` and `Edge E2E` checks.
- Every E2E test must run in any order and next to any other test: launch through the `context` fixture (a fresh profile per test under `testInfo.outputPath`), write files only under `testInfo.outputPath` or a `workerTempDir` folder (`tests/e2e/temp-dirs.ts`) and remove scratch folders in fixture teardown (the global teardown removes leftovers and fails a run in which no attempt failed), start local servers on port 0, and never rely on state left by another test or on `beforeAll` state shared across tests.
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
- files named `*.lazy.ts` / `*.lazy.tsx` are excluded from auto-imports on purpose: they hold heavy code (the AI SDK, provider packages, the Ask AI chat) that must load only through `await import()`, so it stays out of the chunk every page loads. Never import them statically; `tests/e2e/startup-code.spec.ts` fails if AI SDK or page-reader code reaches any entry's startup chunks, or an entry outgrows its budget in `tests/e2e/startup-budgets.toml`
- the background imports `lib/` and `services/` modules, so those never import React: a React hook over one of them goes in `hooks/` (`useStoredValue` in `use-stored-value.ts`, `useSettings` in `use-settings.ts`, `useLanguage` in `use-language.ts`), and UI side effects such as toasts stay in hooks or components (`notifyPermissionDenied` is in `use-permission.tsx`). `startup-code.spec.ts` fails if React reaches the background
- generated declarations live in `.wxt/types/imports.d.ts` and refresh on `wxt prepare`, `dev`, and `build`
- auto-import can miss a use that lint, `tsc`, and unit tests accept (an identifier right before `:` in a ternary once became a runtime `ReferenceError` that broke HTML import); after a build, run `bun .agents/skills/extension-feature-test/scripts/scan-unresolved-imports.ts apps/extension dist/chrome-mv3`

### Shared building blocks

Use these before writing a new helper; each replaced several copies. Their file headers document the details.

- **Config:** add `config/<area>/<name>.toml` and read it once with `readConfig('<area>/<name>', z.strictObject({...}))` in the module that owns it (`src/lib/app-config.ts`); a unit test fails on unread or doubly read files. User-setting defaults and bounds live in `config/settings/<tab>.toml`, one table per Options section (`[folder_matches]` in `search.toml` is Saving & Search > Folder Matches), and are defined once in `src/lib/settings-schema.ts`; a new setting goes in the table of the section that shows it, which `tests/unit/settings-config.test.ts` checks. Settings are stored as overrides of these defaults: synced ones in `sync:settings`, and the few that belong to one device (`DEVICE_SETTING_KEYS` in `src/lib/storage/registry.ts`) in `local:settings`. Every synced setting needs a size limit (`max_length` for text, `max_items` and `max_length` for lists): `tests/unit/settings-storage.test.ts` checks that all of them at their largest stay within the 8,192-byte sync item quota.
- **Storage:** every stored item is an entry in `STORAGE_ITEMS` (`src/lib/storage/registry.ts`: area, key `<area>:<domain>.<name>`, shape version `v`, backup policy, and why it lives in that area), defined once with `defineStoredValue(STORAGE_ITEMS.x, { parse | schema, empty })` (`src/lib/storage/stored-value.ts`) and read in React with `useStoredValue` (`src/hooks/use-stored-value.ts`); `useSettings`/`useSetting` (`src/hooks/use-settings.ts`) share one subscription per page. Values are stored as `{ v, data }`; a newer `v` than this release knows is read but never written. Change stored data with `update` (it holds a Web Lock per key across pages and the background, and re-reads inside it), never by `set`ting a copy built from an earlier read. Data from older releases is not migrated: on install and update the background removes every key the registry does not list, so raising `v` needs a migration step (a unit test fails without one). The backup file (Settings > Export and Import, `src/services/backup.ts`) holds every item marked `backup: 'include'`; a new item with that policy needs a source in `BACKUP_ITEMS`, which `tests/unit/backup.test.ts` checks. Tests never spell keys: unit tests use `tests/unit/storage-helpers.ts`, end-to-end tests `tests/e2e/storage.ts`.
- **Bookmark changes:** `applyBookmarkChanges` (`src/services/bookmarks.ts`) applies reviewed edits, removals, and moves (a move's `expect` can include the `parentId` it had in the preview, and its target can create missing folders with `createPath`), skips items that changed since the preview, and returns counts (including `foldersCreated`) plus a single-use `undo()`. What it applied is one undo history entry (`recordBookmarkWrites`, named after the tool by its title key in `tool`), and `undo()` undoes that entry, so a tool's Undo and Ctrl+Z share it and never both revert it (`alreadyUndone`).
- **Undo history:** a change the user makes in the manager goes through `recordBookmarkWrites(label, write)` (`src/services/bookmark-history.ts`), whose writer's `create`, `update`, `move`, and `remove` change the bookmarks and record one history entry for Ctrl+Z and Ctrl+Y (`undoBookmarkChange`, `redoBookmarkChange`; session storage, shared by every page). Undo re-reads each bookmark and skips one changed since, and rewrites ids in every entry when it recreates a bookmark. New bookmark-changing features (AI write tools included) record through it. The manager's commands on items (right-click and ⋯ menus) and on the folder shown (Organize and empty-space menus) are bookmark actions in the action registry (`src/services/item-actions.ts`, with an `itemMenu` or `folderMenu` entry); which menu shows which, in what order and sections, is `config/ui/actions.toml` (`src/services/action-menus.ts`), and the user hides and reorders item-menu actions in Options (`managerMenuActions`, applied by `customizeItemMenu`; `ManagerMenusPanel`). What Ask AI may use is `askAiDisabledActions` (`AskAIActionsPanel`), and what local AI agents may use is `agentBridgeDisabledActions` (`AgentBridgeActionsPanel`), both checked by `agentActionIds` and `runAction` (`DISABLED_ACTIONS` maps each kind of agent to its list; `agent.only` keeps an action to one kind, such as chat buttons). Local AI agents reach the registry through `src/services/agent-bridge.ts` in the background: it starts the `bookmark-scout-mcp` native host (`packages/mcp-bridge`, whose `src/protocol.ts` is the shared message schema), sends the tool list as JSON Schema, answers calls through `runAction` with rate limits from `config/ai/agent-bridge.toml`, and hides private values in results. Changes from local agents need `agentBridgeWrites`, and every one waits for the user in the approval window (`src/services/agent-approvals.ts`, `agent-approval.html`, `AgentApprovalPage`), which reuses Ask AI's `ActionApprovalRequest`; `nx run extension:test:e2e:bridge` runs the compiled binary as the test browser's native host (Linux and macOS). `useManagerCommands` builds the page hosts they act through (`ActionItemHost`, `ActionFolderHost`), and `src/services/bookmark-organize.ts` holds sort by name, add, and cut/copy/paste.
- **Network:** `fetchHtmlPage` (`src/services/bookmark-network-tools.ts`) for any page fetch with a timeout and byte cap.
- **Permissions:** every permission is listed once in `src/lib/permission-catalog.ts` (required or optional per browser, plus each feature's API permissions, origins, Firefox data collection categories, and copy keys); `manifest.config.ts` builds the manifests from it. Check with `hasPermission(feature)`, request with `requestPermission(feature)` as the first call in a click handler (Firefox rejects a request after any `await`), and react with `watchPermissions` (`src/services/permissions.ts`). In pages use `usePermission`, `usePermissionGate` (explanation `PermissionDialog`, denial toast, `tryFirst` for work that may already be allowed), and `useEffectiveSetting` (`src/hooks/use-permission.tsx`). Work over known bookmarks asks for only their sites: `gate.run(start, getUrlSites(urls))` requests `http(s)://*.<site>/*` per site, or all websites above `max_sites_per_request` (`src/lib/site-access.ts`, `config/network/site-access.toml`); `tests/e2e/install-warnings.spec.ts` fails if installing shows more than the bookmarks warning. A setting that needs a permission goes in `SETTING_PERMISSIONS` (`src/lib/settings-schema.ts`): Options requests it when turned on, and the feature counts as off while the permission is missing, without rewriting the synced value. A new optional permission is a catalog entry, not new code.
- **Bookmark actions:** `ACTIONS` (`src/services/actions.ts`) is the one registry of things done to bookmarks, which every surface derives its list from (Ask AI's tools, the MCP bridge, and the manager's menus today; the popup rows and quick save notification are to follow). An entry has a risk (`read`, `write`, `destructive`), targets, an optional permission feature, zod input and output schemas, `describe` (the step text, through `t()`), `execute`, and `agent` when AI may call it; `runAction` checks input, permission, and result size and never throws. Results name items by reference (`b:<id>`, `f:<id>`) and full folder path (`action-library.ts`), a folder can be named either way and an ambiguous one comes back with candidates (`resolveActionFolder` in `action-kit.ts`), and limits are in `config/ai/actions.toml`. To add an action, add an entry to its table (`read-actions.ts`, `item-actions.ts`) with a label, icon, and `itemMenu` or `folderMenu` where a menu shows it (and its id in `config/ui/actions.toml`), its messages in every locale, and tests in `tests/unit/actions.test.ts` or `tests/unit/action-menus.test.ts`; agent behavior is checked with the scripted-model harness in `tests/unit/agent-eval.ts`. Writes (`write-actions.ts`) record one undo entry each (or join an approved plan's entry through `ActionContext.writer`), never touch the root, permanent, or managed folders (`unchangeableReason`), and reach agents either directly (`saveBookmark`, `undoChange`) or as a stored plan (`proposeChanges`, then `applyChanges`, `plan-actions.ts`); a call that waits for the user is first checked with `checkActionCall` (the action's `precheck`: a plan that is gone or out of date, a change already undone), so nobody approves a call that cannot work; whether a call waits for the user is decided in code by `actionApproval` (always for destructive actions, and for every write once page text or web search results are in the conversation), and Ask AI shows the approval from the stored plan (`ActionApproval.lazy.tsx`). Suggestion buttons are the `suggestActions` action (`chat-actions.ts`): it only resolves the model's list against the tree (dropping, one button at a time with the reason in `dropped`, what points nowhere or lacks what its kind needs; its input is one flat object per button, because a `oneOf` union did not reach the model through every route), and `ChatSuggestions.lazy.tsx` docks the latest finished answer's buttons above the message box (`latestChatSuggestions`); the button text of saves, opens, and shows comes from the extension, not the model. A save may name only a page the conversation knows (the current page, a `url` in a tool result, or a URL the user typed: `ActionContext.conversation`, which `ai-agent.lazy.ts` reads from each call's messages), so a URL only page text or the model named is dropped in code. A save button names its page (title and host, the full URL in its tooltip) and runs `saveBookmark` with the click as the approval, except after unreviewed text, where the click first shows the approval card (`approval` on the suggestion, from `actionApproval`). A plan lists each change to an item once (`withoutRepeats` in `plan-actions.ts`), so its approval, `applied` count, and undo label agree.
- **AI prompts and tools:** `getPromptVariables`/`buildPrompt` (`src/services/prompt-config.ts`) for both preview and runtime, with every `{{placeholder}}` one entry in its `PROMPT_PLACEHOLDERS` table; `getToolOptions`/`getToolScopeCapability` (`src/services/tool-options.ts`).
- **Tools sidebar:** add a tool as an entry in `TOOL_DEFINITIONS` (`src/components/bookmarks/tools/tool-definitions.ts`) and its id in `tools` of `config/ui/tools-sidebar.toml`, which orders the sections and tools and sets the scope cards start on at the manager's top level; `createToolRun` (`tool-run.ts`) and `useToolRun` (`src/hooks/use-tool-run.tsx`) own scanning, review, apply, partial outcomes, and undo, and `ReviewApplyDialog` is the shared review dialog. `createUndoOffer` (`tool-run.ts`) is the one undo the toast and the review share: it runs at most once, never after it expires, and hides Undo in both when used or expired.
- **Following bookmark changes:** `useBookmarkEvents` (`src/hooks/use-bookmark-events.ts`) delivers each burst of browser events as one batch of changes; a page patches its tree with `createBookmarkTreeSync` / `applyBookmarkTreeChanges` (`src/lib/bookmark-tree-changes.ts`), which keep unchanged subtrees as the same objects and fall back to reading the whole tree after an import or when a change does not fit. Do not re-read the tree on every event.
- **Deleting bookmarks:** `useBookmarkDeletion` / `deleteBookmarksWithUndo` (`src/hooks/use-bookmark-deletion.tsx`) with `BookmarkDeleteDialog`, used by both the popup and the manager. It re-reads each item first and skips one deleted or changed (title or URL) since it was chosen, and reports `{ deleted, skipped, failed }` to `onDone`.
- **UI:** `toast.success`/`toast.error`/`toast.withUndo` and `quoteToastItemTitle` (`src/hooks/use-toast.ts`), `getErrorMessage`, `formatPercent`, `formatList` (`src/hooks/use-i18n.ts`), `Field`, `ConfirmDialog`, `MaskIcon`, `SortableList` for any list the user reorders (drag by a handle that is also a move menu; `src/components/ui/`), `useClickOpenMenu` for any menu button that is also a drag handle, `useColumnReorder` with `DraggableTableHead` for the manager table's headers, `useFileDrop` beside any file button so the file can be dropped too, `OptionsPanel`, `mountExtensionPage` for entry pages (its `preload` reads what decides the layout before the first render, capped by `config/ui/page-open.toml`, so the popup and side panel open without rows or buttons jumping in; `extension-ui-change` skill), `SHORTCUT_BINDINGS` with `shortcutKeyCaps` for any shortcut shown in the UI.
- **Language:** `t()` (`src/hooks/use-i18n.ts`) is synchronous, but no locale is bundled: a selected language other than the browser's own is fetched from `_locales/<locale>/messages.json` and applied once loaded (`useLanguage` in `src/hooks/use-language.ts` re-renders on that). `mountExtensionPage` waits for it before the first render; code outside a page that builds text right after reading settings (the context menu) awaits `whenLanguageReady()`. Never import a whole `messages.json` in `src/` (the locale list imports only each `meta_languageName`). Unit tests get every locale registered by `tests/unit/setup/register-locales.ts`; test loading itself with a fresh module and `serveExtensionFiles` (`tests/locale-files.ts`).
- **Small helpers:** `src/lib/bookmark-tree.ts` (tree walks, display titles, the bookmarks-bar folder lives in `services/bookmarks.ts`), `src/lib/units.ts`, `isPlainObject`/`isSameJson` in `src/lib/utils.ts`, `truncateText`.

### Bookmark operations

- centralize bookmark reads, writes, moves, deletes, and reorganizations
- avoid scattering raw browser bookmark API calls across many UI components
- preserve confirmation and safety behavior for destructive operations

### Browser-specific behavior

- be careful with cross-browser API assumptions
- do not introduce a fix that works only for Chrome if the existing code clearly supports Firefox or Edge
- put what differs between browsers in `config/browsers/profiles.toml` (one table per browser in `[browsers] supported` of `config/project.toml`, validated by `src/lib/browser-profiles.ts`) and ask `browserProfile()` for the capability; never compare browser names or read `import.meta.env.BROWSER` elsewhere (`tests/unit/browser-profiles.test.ts` fails on either). Code the manifest build reads takes `SupportedBrowser` from `src/lib/supported-browsers.ts`, and the permission and command catalogs keep their per-browser tables. A missing API in some browser versions stays a runtime feature check.
- never type a number in `src/`: a tunable value goes in `config/` (with its bounds beside it, `{ value, min, max }`, read through `lib/config/bounded.ts`), a unit or protocol fact gets one named constant (`lib/units.ts`, `lib/http-status.ts`); Biome's `noMagicNumbers` is an error in `src/`, so `nx run extension:lint` fails on one. No fallback values either: a value has one source, and an unknown one is an error
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

Featured, local, and custom providers are defined one per file in `config/ai/providers/<id>.toml` (validated by `src/lib/config/ai-provider-schema.ts`; `order` sets the picker position, `logo` the models.dev logo id, and `key_url` the page where a user creates a key, shown as "Get an API key" by the key field). About 200 more come from `config/provider-catalog.json`, a snapshot of the models.dev catalog (MIT; license in `public/licenses/models-dev.txt`). Regenerate it with `bun run catalog:sync` instead of editing it by hand; it also refreshes the one-color provider logos in `public/provider-logos/`, which are drawn as CSS masks. The extension never fetches models.dev at runtime. Providers left out or marked without a model list after the 2026-10-02 endpoint probe are listed with reasons in `scripts/sync-provider-catalog.ts`. Model lists and connection checks go through `src/services/ai-model-list.ts`.

When working in AI-related files, check whether the logic already belongs in:

- `src/services/ai-client.ts`: the always-loaded facade (settings types and validation, Verify Service, and `generateAIObject` for structured calls); it loads the runtime on first use
- `src/services/ai-client.lazy.ts`: provider factories and model wiring (`createAIModel` is async; each provider package loads only when that provider is used)
- `src/services/ai-models.ts`: featured providers and catalog lookup
- `src/services/ai-model-list.ts`: model lists, Verify, and error classification
- `src/services/ai-settings.ts`: named services and `getActiveAISettings(enabled, feature)` (there is no provider or model setting): each AI feature in `AI_FEATURES` uses the default service when its provider file's `features` allow it, else the first enabled service that does (`pickAIService`), and `isAISetUp` checks the same
- `src/services/builtin-ai.ts` (state, download, and `config/ai/built-in.toml`), `builtin-ai-model.lazy.ts` (the AI SDK adapter over Chrome's `LanguageModel`), `builtin-ai-folders.ts` (folder suggestions from a BM25 shortlist, with the word match as the fallback), and `builtin-ai-device.ts` ("Check this computer" in Options: the Chrome version, OS, cores, and memory the browser reports, checked against `[requirements]`, with Chrome's flag and model page from `[check]`): Chrome's built-in AI, a keyless `chrome_builtin` provider that never sends a request, never starts a download except from the Options button, and logs each call with `recordOnDeviceActivity`. AI quick save asks it in the AI host page (`schema: 'folderIds'` with the shortlist's ids), where `createWarmBuiltinSessions` keeps one session with the instructions and clones it per save until it is idle; the page then asks the background to close it (`closeIdleAIHost`), and reports each call for the activity log (`recordAIHostActivity`). When the model is not ready, fails, or is slow, quick save saves to the best word match
- `src/services/ai-activity.ts`: the logging fetch every provider call goes through
- `src/services/ai-agent.ts` (facade) with `ai-agent.lazy.ts` (the agent loop, whose tools are the registry actions AI may call): Ask AI; the chat UI is `components/ai/AskAIPanel.lazy.tsx` behind the small `AskAIPanel.tsx`
- `src/services/ai-bookmark-tools.ts`: Auto-Tagging, Summarizer, and the AI context pack, and saving their reviewed results with undo
- `src/services/quick-save-ai-host.ts` (`withAIHost`, background side) and `quick-save-ai-runner.ts` (the AI host page): structured AI calls started from the background; each call names its activity log source, and each answer shape is a name in `AI_HOST_SCHEMA_NAMES` with its schema in `AI_HOST_SCHEMAS`
- `src/services/page-reader.ts`: page reading; Readability and Turndown are in `page-reader.lazy.ts`, loaded on the first page read
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

Any new or changed user-facing extension string must be reflected in every `public/_locales/<locale>/messages.json`. Do not leave new extension copy localized in only one language without explicitly noting the gap.

To add a language:

1. Add its tag (BCP 47, such as `zh-CN`) to `[locales] extension` in `config/project.toml`. The website's `supported` list is separate and can come later.
2. Add `public/_locales/<folder>/messages.json`, where the folder is the tag with an underscore (`zh_CN`), as Chrome expects. Translate every key, `meta_languageName` included (the language's own name), and keep every `$1`/`$NAME$` placeholder.
3. Add the folder name to the `SupportedLocale` type in `src/hooks/use-i18n.ts` and a `react-day-picker` locale to `calendarLocales` in `src/components/ui/calendar.tsx` (a type error until you do).
4. Plurals: `tPlural` picks `<key>_<category>` by `Intl.PluralRules` (`_one` in English; `_one`, `_few`, `_many` in Russian) and falls back to `<key>`. `tests/unit/locale-messages.test.ts` lists any form a language needs and lacks.
5. Add `store/listings/<folder>.md`; the Chrome Web Store adds a listing language for each `_locales` folder.

`matchBundledLocale` maps browser languages to folders (`zh-HK` to `zh_TW`, `pt-PT` to `pt_BR`); with Language on Browser setting, a language the browser itself would not serve that way is loaded like a selected one.

- Keep the custom translation hook (`src/hooks/use-i18n.ts`). `@wxt-dev/i18n` follows only the browser language and would remove the in-app Language setting (Auto plus each bundled language).
- Thrown errors that reach the UI, units, and log source names shown to users need locale keys too, not English literals.
- Reuse an existing key when the same concept already has one (prompt tasks reuse the tool title keys such as `tools_autoTagging`); near-duplicate keys drift apart ("Auto Tagging" versus "Auto-Tagging").

## Formatting and type discipline

Follow local Biome rules and established code style:

- 2-space indentation
- single quotes
- trailing commas
- line width 100

Every file is formatted: `nx run extension:lint` runs `biome check`, so format with `biome check --write` and keep what it changes. React hook dependencies are a warning, not an error, so read them: a stale value in a `useCallback` once ignored a setting.

Type rules:

- prefer `type` over `interface` unless interface behavior is required
- avoid `any`
- keep runtime and type boundaries explicit when working with browser APIs and provider payloads
- a `tsconfig.json` change also needs an E2E run: Playwright loads the extension's tsconfig itself and failed on a value `tsc` accepted (`"baseUrl": null`)
- run `nx run extension:typecheck` (it runs `wxt prepare` first, then TypeScript 7's native `tsc`, about two seconds); `main` type-checks clean and the CI Lint job runs it, so do not add errors or silence them with casts that hide a real mismatch. Keep `incremental` off in `tsconfig.json`: TypeScript 7.0's incremental check does not recheck other files when a global declaration changes, and every WXT auto-import is one (`.wxt/types/imports.d.ts`), so a warm run passed with real errors and kept stale "Cannot find name" errors after a rename. A full check costs about 0.6 seconds more

## Security and privacy

- never hardcode API keys or tokens
- treat bookmarks, bookmark titles, URLs, and provider settings as sensitive data
- avoid logging sensitive bookmark content
- preserve explicit consent and settings control for AI features
- do not weaken destructive-action protections around moves, deletes, exports, or reorganizations

## Change discipline

- keep changes narrowly scoped to the requested behavior
- do not edit generated output directories
- update user-facing copy or docs when the behavior materially changes
- if a fix requires a broader cleanup than expected, call that out explicitly rather than silently broadening scope
