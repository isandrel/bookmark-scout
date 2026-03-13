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
- shadcn/ui and Radix primitives
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
- `config/settings.default.toml`: default settings template

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

Equivalent scripts also exist in `apps/extension/package.json` when working directly in this app.

## Verification rules

### Baseline

For nearly any source change, run:

- `nx run extension:lint`

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

### Bookmark operations

- centralize bookmark reads, writes, moves, deletes, and reorganizations
- avoid scattering raw browser bookmark API calls across many UI components
- preserve confirmation and safety behavior for destructive operations

### Browser-specific behavior

- be careful with cross-browser API assumptions
- do not introduce a fix that works only for Chrome if the existing code clearly supports Firefox or Edge
- keep background, sidepanel, popup, and options flows consistent with their runtime boundaries

## AI and provider guidance

The extension includes AI-assisted bookmark organization and recommendation features. These areas require extra care.

Rules:

- AI features must remain opt-in
- preserve the default disabled state for AI features unless the task explicitly changes product behavior
- keep provider creation and model wiring centralized in existing AI service files
- do not embed provider-specific logic deep inside UI components unless the current architecture already does so for a narrow reason
- preserve clear disclosure around what user bookmark data is sent to external providers

When working in AI-related files, check whether the logic already belongs in:

- `src/services/ai-client.ts`
- `src/services/ai-models.ts`
- `src/services/ai-prompts.ts`
- `src/services/ai-recommendation.ts`
- `src/services/ai-reorganization.ts`

## UI and UX guidance

- reuse existing UI primitives under `src/components/ui/` before creating new ones
- follow current patterns for dialogs, sheets, toasts, tables, filtering, and drag-and-drop
- maintain the existing product feel instead of introducing a separate design language for small enhancements
- keep component APIs small and understandable

If a component becomes a container for too much logic, split responsibilities rather than continuing to grow it.

## Localization

Any new or changed user-facing extension string must be reflected in:

- `public/_locales/en/messages.json`
- `public/_locales/ja/messages.json`
- `public/_locales/ko/messages.json`

Do not leave new extension copy localized in only one language without explicitly noting the gap.

## Formatting and type discipline

Follow local Biome rules and established code style:

- 2-space indentation
- single quotes
- trailing commas
- line width 100

Type rules:

- prefer `type` over `interface` unless interface behavior is required
- avoid `any`
- keep runtime and type boundaries explicit when working with browser APIs and provider payloads

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
