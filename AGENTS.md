# AGENTS.md

## Mission

This file defines the default operating rules for coding agents working anywhere in the Bookmark Scout repository. It is intended to keep changes accurate, reviewable, and consistent with the repository's actual architecture and workflow.

Bookmark Scout is a product repository, not a scratchpad. Agents should optimize for production-quality changes, low regression risk, and clear verification.

## Scope and precedence

This root file applies to the whole monorepo unless a more specific `AGENTS.md` exists in a subdirectory. Subtree files refine this guidance for their local area:

- `apps/extension/AGENTS.md`
- `apps/website/AGENTS.md`
- `apps/docs/AGENTS.md`

When working inside one of those apps, read the nested file and follow it over this root file where the guidance is more specific.

## Product summary

Bookmark Scout is a bookmark management product organized as a Bun + Nx monorepo with three primary applications:

- `apps/extension`: the main product, implemented as a browser extension using WXT, React, TypeScript, Zustand, and shadcn/ui.
- `apps/website`: the public marketing site built with Next.js and localized with `next-intl`.
- `apps/docs`: the documentation site built with Next.js, Fumadocs, and MDX.

In most tasks, the extension is the highest-priority product surface. The website and docs exist to support discovery, onboarding, and documentation of the extension.

## Engineering intent

Agents working in this repository should behave like careful maintainers, not opportunistic patch generators.

Default expectations:

- prefer minimal, targeted, high-confidence changes
- preserve existing architecture before introducing new abstractions
- keep user-visible behavior consistent unless the task explicitly changes it
- keep implementation and docs aligned
- verify changes with the smallest relevant command set first
- state uncertainty explicitly rather than guessing about behavior

### Configurable, extensible, customizable, maintainable

The maintainer reviews every change against these four words. Each has a concrete meaning here:

- **Configurable:** tunable values (limits, timeouts, sizes, counts, retry policies, default URLs, model or provider defaults) live in config, never inline. Extension settings go in `apps/extension/config/settings/` with a comment and are validated by one config module (`src/lib/app-config.ts`); project and site values (URLs, contact addresses, store links, dates) come from `config/project.toml` (identity shared by every app and the README) and `config/web.toml` (website and docs hosting) through `@bookmark-scout/config`, whose `site` model builds every URL (`site.url.page(locale, route)`, `site.repo.file(path)`, `site.docs.url(path)`). Only true protocol constants stay in code.
- **Layered, single source of truth:** every value is defined once, at the lowest level that owns it, and every other place derives it (import, generate, or validate against it) instead of copying it. A test or loader check should fail when a copy drifts.
  1. **Workspace** (`config/`): project identity shared by every app and the README: name, slug, description, repository, license, locales, supported browsers, store links, contact addresses, legal dates. Site-only hosting and analytics values live beside it and are read by the website and docs only.
  2. **App** (`apps/<app>/config/`): that app's defaults and tunables, split into files by domain (for the extension: user-setting defaults with their bounds, AI, network, UI, limits, data). One loader per app reads every file once, validates it strictly (unknown keys and two files claiming the same key are errors), and is the only code that touches the raw files. App config may reference workspace values but never redefines them.
  3. **User** (browser storage): only values the user can change in Settings, stored as overrides of the app defaults and validated against the same schema.

  Generated outputs (README version numbers, the website's provider list, manifest fields, release asset names) are produced from these sources, never typed by hand.

  Keyboard shortcuts are defined once, in `apps/extension/config/ui/shortcuts.toml` (the extension's keys, the manifest's suggested command keys, and the browser keys the docs name), and formatted by `@bookmark-scout/config/shortcuts` for every surface. Never type a shortcut by hand in the docs, website, README, or store listings: docs pages use `<Shortcut id="commands.quick-save" />`, website messages use `{{SHORTCUT:<id>}}` (or `{{SHORTCUT_MAC:<id>}}` and `{{SHORTCUT_OTHER:<id>}}` for one platform), the Markdown templates in every language use `{{ shortcuts["<id>"].both }}` (or `.mac` and `.other`), and the store listings, which are pasted by hand, are checked against the config. Where text names both platforms, it labels each: the Mac keys come first and the Windows and Linux keys follow in plain parentheses at the same size (never `<sub>`, `<small>`, or a smaller or softer style), "⌥⇧S on Mac (Alt+Shift+S on Windows and Linux)": the order is `[display] primary` in `shortcuts.toml`, and each surface words the labels in every language, a label per platform plus a `pair` template (`shortcutNotes` in the website messages, which the READMEs reuse; `shortcut.notes` in the docs copy). `scripts/shortcut-mentions.test.ts` fails on a hand-typed key, an unknown id, a configured shortcut missing from the docs' keyboard shortcuts guide, or a store listing or checklist line that names the Windows and Linux keys first or leaves out either platform's label.
- **Extensible:** prefer data-driven rules over lists of special cases, so a new case is a new entry, not new code. Match by pattern, not by file name: CI scoping ignores `**/*.md`, not a list of notes files (`.github/ci-scopes.toml`). Providers, prompts, tools, and presets are table entries with one shared code path.
- **Customizable:** when users will reasonably want a different value or behavior, expose it as a setting with a sensible default instead of choosing for them. Let users save several named variants where one is not enough (for example the prompt library), and keep stored data as ids rather than display text so it renders in the current language.
- **Maintainable:** no hard-coded strings either. User-visible text, units, and labels go through `t()` (extension) or message files (website) in every locale; repeated marker strings become one named constant. Keep one obvious home for each concern, and update the matching `DESIGN.md`, docs, and skill when the shape changes.
- **No duplicates:** search `lib/`, `hooks/`, `services/`, and `components/ui/` for an existing helper before writing one, and merge copies of logic that must change together into one function, component, or data table. Similar-looking code with different reasons to change can stay separate.

## Repository map

### Workspace root

Key root files and directories:

- `package.json`: root workspace scripts, Bun entrypoints, and Nx command orchestration
- `bunfig.toml`: Bun install settings (isolated linker)
- `nx.json`: Nx workspace configuration
- `packages/config`: shared configuration package used by multiple apps
- `packages/mcp-bridge`: `bookmark-scout-mcp`, the local MCP server and native messaging host that let local AI agents use the extension's bookmark actions (settings in its `config/bridge.toml`; the message shapes the extension shares are `src/protocol.ts`)
- `scripts/generate-markdown.ts`: generates `README.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md`, and `i18n/` from `templates/` (see "Documentation policy")
- `templates/`: the MiniJinja templates for those documents, at the same paths as their outputs (`templates/i18n/ja/README.md`), with shared macros in `templates/_partials/` and engine settings in `templates/minijinja.toml`
- `README.md`: the user-facing overview: what Bookmark Scout does, install, privacy, and help (plain language, no developer detail)
- `DEVELOPMENT.md`: developer overview: feature status, tech stack, release builds, project structure, and pointers to CONTRIBUTING.md and the MCP bridge
- `CONTRIBUTING.md`: contribution workflow and coding expectations
- `i18n/<tag>/`: `README.md` and `CONTRIBUTING.md` in each other language, one folder per BCP 47 tag (generated)
- `CHANGELOG.md`: release-facing change history
- `SECURITY.md`: security reporting guidance

### Application map

#### `apps/extension`

This is the primary product and the most sensitive surface for behavior regressions.

Important subareas:

- `src/entrypoints/`: background, popup, sidepanel, bookmarks page, options page, and other runtime entrypoints
- `src/components/`: reusable UI and page-level components
- `src/components/ui/`: shared UI primitives
- `src/hooks/`: bookmark interaction logic and component hooks
- `src/services/`: bookmark operations, AI integrations, prompt logic, browser integrations, import/export, and reorganization logic
- `src/stores/`: Zustand state containers
- `src/lib/`: storage, schema, logging, helpers, and lower-level utilities
- `public/_locales/`: extension translations, one folder per language listed in `[locales] extension` of `config/project.toml`

#### `apps/website`

This is the public-facing marketing site.

Important subareas:

- `app/`: Next.js App Router routes, metadata, sitemap, and layouts
- `app/(default)/` and `app/[locale]/`: the default language at unprefixed URLs and every other language under `/<tag>/`, both rendering the shared page components
- `components/`: website-specific UI
- `messages/`: locale message files
- `i18n/`: locale routing and request setup

#### `apps/docs`

This is the documentation site.

Important subareas:

- `content/docs/`: documentation source in MDX
- `src/app/`: docs app routes and shell
- `src/lib/`: content-source and helper logic
- `source.config.ts`: Fumadocs and MDX source configuration

## Monorepo working rules

- Determine the target app before editing code.
- Avoid mixing unrelated app changes in one task unless the request clearly spans multiple surfaces.
- If a task affects shared behavior or documentation across apps, update each affected app intentionally rather than applying root-level changes that only partially solve the problem.
- Prefer app-local commands and verification before workspace-wide commands.
- In replaceable environments, keep source checkouts/worktrees and Git backups in the declared persistent workspace; temporary-directory logs alone do not preserve unpushed commits (see `parallel-agent-delivery`).
- Avoid broad refactors across the monorepo unless the user explicitly asks for them.

## Setup and common commands

Use Bun for everything: `bun install`, `bun add`, `bun run`, and `bunx`. Never use `npm`, `npx`, `yarn`, or `pnpm`, including in docs, scripts, and CI.

### Workspace-level commands

- install dependencies: `bun install`
- start extension dev server: `bun run dev`
- start website dev server: `bun run dev:website`
- start docs dev server: `bun run dev:docs`
- build extension: `bun run build`
- build website: `bun run build:website`
- build docs: `bun run build:docs`
- build all apps: `bun run build:all`
- lint workspace: `bun run lint`

### Targeted Nx commands

- extension lint: `nx run extension:lint`
- extension type check: `nx run extension:typecheck`
- extension Chrome build: `nx run extension:build:chrome`
- extension Firefox build: `nx run extension:build:firefox`
- extension Edge build: `nx run extension:build:edge`
- extension unit tests: `nx run extension:test:unit`
- extension end-to-end coverage: `nx run extension:test:e2e:coverage` (the Chromium suite on a build with inline source maps in `apps/extension/dist-coverage`, V8 coverage of the pages through monocart; HTML in `apps/extension/coverage/e2e`, table with `bun scripts/coverage-summary.ts e2e`; on demand, not a check)
- extension unit tests with coverage: `nx run extension:test:coverage` (fails under the floors in `apps/extension/build/unit-coverage.toml`; CI runs this and posts the table in the job summary, with the HTML report as the `unit-coverage` artifact)
- extension end-to-end tests: `nx run extension:test:e2e`
- extension Edge end-to-end tests: `nx run extension:test:e2e:edge`
- extension Firefox end-to-end smoke tests: `nx run extension:test:e2e:firefox`
- extension performance measurements: `nx run extension:test:perf`
- extension AI features against a real provider: `nx run extension:test:live` (on demand; skipped without the `BS_LIVE_AI_*` variables)
- MCP bridge end to end with the extension: `nx run extension:test:e2e:bridge`
- website build: `nx run website:build`
- docs build: `nx run docs:build`

Use the smallest command set that exercises the code you changed.

### Nx cache

Nx caches `lint`, `typecheck`, `test:unit`, the extension `build:*` targets, and the website and docs builds (`targetDefaults` in `nx.json`; outputs in each `project.json`, or the `"nx"` field of `apps/docs/package.json`). The cache is shared by every checkout and worktree of the repository (under `~/.nx`), and a hit restores only the declared outputs, so a cached target that writes files must list all of them in `outputs`, and anything else it reads (an environment variable, a file outside its project) in `inputs`. Pass `--skip-nx-cache` to force a run. `.nxignore` keeps the Nx daemon from watching agent worktrees under `.claude/`.

## Verification policy

Verification is required for substantive changes. At a minimum, run the narrowest relevant validation command for the affected area and report what you ran.

### Extension changes

Minimum:

- `nx run extension:lint`
- `nx run extension:typecheck`

Also run build targets when the change affects runtime behavior, entrypoints, browser-specific behavior, packaging, configuration, or imports that cross extension runtime boundaries:

- `nx run extension:build:chrome`
- `nx run extension:build:firefox`
- `nx run extension:build:edge`

When the changed behavior is covered by the extension test suite, also run the narrowest relevant target:

- unit tests: `nx run extension:test:unit`
- Chromium end-to-end tests: `nx run extension:test:e2e`
- for browser-specific changes, the Firefox target: `nx run extension:test:e2e:firefox`

Run Chromium and Firefox end-to-end tests locally. Edge (`nx run extension:test:e2e:edge`) runs in CI as the required `Edge E2E` check; run it locally only when Edge is installed and the change is Edge-specific, and do not list "Edge not run locally" as a risk.

### Website changes

- `nx run website:lint`
- `nx run website:verify` (builds and checks the static export)
- `nx run website:test:e2e` when pages, components, or interaction change

### Docs changes

- `nx run docs:types:check`
- `nx run docs:lint` (Biome format and lint; CI fails on unformatted docs code, such as `src/lib/copy*.ts`)
- `nx run docs:build`, then `bun run --cwd apps/docs verify`

### MCP bridge changes

- `bun run --cwd packages/mcp-bridge typecheck`
- `bun test packages/mcp-bridge` (the integration tests start `native-host` and `serve` as real processes, with the test playing the extension and the MCP client)
- `nx run extension:test:e2e:bridge` when the bridge or the extension's side of it changes: the compiled binary as Chromium's native host and an MCP client driving `serve` (the `Bridge E2E` CI job; on macOS, set `BOOKMARK_SCOUT_MCP_BIN` to a copy of the binary outside `~/Documents`, which the browser cannot run from without a privacy prompt)
- distribution (npm `dist/cli.js` built by `build:npm`, `server.json` for the MCP registry, `claude-plugin/`, and the manual **MCP bridge binaries** workflow) is prepared in the repository and published only by the maintainer (`packages/mcp-bridge/README.md`); `src/distribution.test.ts` keeps the versions, names, and URLs in step
- when the message shapes in `src/protocol.ts` change, the extension side too (`PROTOCOL_VERSION` goes up when old and new ends could no longer talk)

### Shared or cross-app changes

- `bun run lint`
- `bun run build:all`

### Verification reporting

When reporting completion:

- state exactly which commands were run
- distinguish lint/build validation from tests
- mention commands you could not run
- mention residual risk when verification is partial

### Current repository constraint

The current coverage map lives in the `extension-feature-test` skill; keep it current when tests change. Live network behavior is not covered, and real provider compatibility only by the on-demand live AI suite (`test:live`), never by a pull request check, so do not represent lint or build success as test coverage.

## Maintenance and dependencies

Releases, CI repair, GitHub Actions, deploys, Dependabot, and lockfile work follow the `repo-maintenance` skill (release tags: `extension-store-release`). Do not publish a release tag, bump the version, or write a release section in `CHANGELOG.md` unless the user explicitly asks for a release; "continue" is not such a request. Rules that apply to everyday changes:

- Each workspace declares what it imports or runs in its own `package.json`; add a dependency with `bun add` from that app's folder. The root `package.json` holds only workspace tooling (Nx, Biome, TypeScript, Husky, lint-staged) and what the root `scripts/` and `.agents/skills/` scripts import.
- Installs are isolated (`bunfig.toml`, `linker = "isolated"`): a workspace resolves only its declared packages, so declare a package in the importing app instead of relying on another workspace or the root.
- TypeScript is split by what each workspace runs: the extension, docs, and `packages/mcp-bridge` use TypeScript 7 (native `tsc`); the root, website, and `packages/config` stay on 6 because Nx and typescript-eslint need the programmatic API. `scripts/typescript-versions.test.ts` pins each major.
- Declaring `react` in a workspace turns on Biome's React rules there, such as `noArrayIndexKey` (key list items by a value from the data) and `noChildrenProp` (tests that render components are `.test.tsx`).
- `bun.lock` is the single workspace lockfile and must stay at `"lockfileVersion": 1`; `scripts/lockfile.test.ts` enforces it.

## Coding standards

### General language rules

- use TypeScript for new code
- prefer `type` over `interface` unless interface behavior is required
- avoid `any`; if necessary, keep the unsafe boundary narrow and intentional
- preserve existing import style and local conventions unless there is a concrete reason to change them

### React and UI rules

- use functional components and hooks
- keep presentational logic in components and move non-trivial business logic into hooks, services, stores, or lib helpers
- reuse existing primitives and patterns before introducing new base components
- avoid unnecessary state duplication between components and stores

### Formatting rules

Follow the repository's existing formatter and linter configuration rather than personal preference. In the extension app, Biome currently enforces:

- 2-space indentation
- single quotes
- trailing commas
- line width 100

Do not perform unrelated formatting churn.

### Dependency policy

- do not add dependencies casually
- prefer existing workspace libraries and utilities
- if a new dependency is justified, keep the reason concrete and task-specific
- avoid dependency swaps or framework changes unless explicitly requested

## Architectural guidance

### Preserve the current layering

This repository already has an implicit layering model. Agents should work with it rather than flattening it.

Preferred direction:

- pages and entrypoints assemble behavior
- components render UI
- hooks manage reusable UI behavior
- services encapsulate provider logic, browser integrations, and business workflows
- stores manage shared state
- lib contains utilities, storage, schema, and low-level helpers

If the logic already belongs to an established layer, extend that layer instead of creating a parallel path.

### Extension-specific architecture

- keep runtime entrypoints thin
- centralize bookmark and browser API operations instead of scattering them in UI code
- keep AI provider logic centralized
- avoid putting persistent settings or cross-screen logic in leaf components

### Website and docs architecture

- preserve App Router patterns already in use
- preserve localization patterns already in use
- avoid introducing alternate content pipelines or routing models without strong justification

## Internationalization rules

Bookmark Scout already supports multiple locales and agents must preserve that support.

Languages appear in one order everywhere: the order of `[locales] supported` (and `extension`) in `config/project.toml`, most speakers first with English first as the source language. The website and docs language menus, hreflang alternates and sitemaps, the README and CONTRIBUTING switchers, the docs pages' `<Languages />` lists, and the extension's Language setting all derive it; a new language goes in at its place by speaker count. The config loader, `scripts/language-order.test.ts`, each site's `verify` script, and the extension's `locale-messages.test.ts` fail on another order, so never sort or hand-type a language list.

### Extension

If you change user-visible extension copy, update:

- every `apps/extension/public/_locales/<locale>/messages.json` (adding a language: the `i18n-add-language` skill)

### Website

If you change localized website copy, update the matching file for every language in `[locales] supported` of `config/project.toml`: `apps/website/messages/<locale>.json`, or the same file under `messages/privacy/` or `messages/support/`.

### Docs

The docs serve every locale in `config/project.toml` and fall back to the English page where a translation is missing (`apps/docs/AGENTS.md`, Languages). When you change an English page that has translations (`<page>.<tag>.mdx`), update them or call out that they are now stale. Docs UI copy lives per locale in `apps/docs/src/lib/copy.ts`.

Do not silently leave one locale updated and others stale unless the user explicitly asked for a partial change and the limitation is called out.

## Security and privacy rules

This repository includes AI-backed functionality and user bookmark data. Treat privacy and secret handling as first-class constraints.

- never commit API keys, OAuth tokens, or credentials
- never add fake example secrets that look real
- treat bookmark titles, URLs, provider selections, and settings as sensitive user data
- avoid logging sensitive data unless there is a strong existing pattern and a concrete debugging need
- preserve explicit user control for enabling AI features and selecting providers
- do not weaken existing consent, disclosure, or privacy messaging
- every storage item, IndexedDB database, and declared permission must be named in `store/privacy-disclosures.md` or `store/permissions.md` and the docs permissions pages; `scripts/disclosure-sync.test.ts` fails otherwise
- when a change alters what data leaves the device, update `store/privacy-policy.md`, `store/privacy-disclosures.md`, `store/permissions.md`, the docs `privacy.mdx` and `permissions.mdx`, and every `apps/website/messages/privacy/<locale>.json` in the same change (the full list and order: the `privacy-disclosure-sync` skill)

## Documentation policy

Update documentation when the change affects:

- installation or setup steps
- product capabilities
- browser support
- privacy expectations
- configuration requirements
- user-facing workflows

Relevant locations include:

- `README.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md` (English only), and their translations in `i18n/<tag>/`, which are generated locally: edit the template at the same path under `templates/` (or `config/`), and the pre-commit hook runs `bun run generate:markdown` (alias `generate:readme`) and stages the output. `[markdown]` in `config/project.toml` lists the documents and the languages each has (every language in `[locales] supported` unless `[markdown.languages]` lists fewer), and the language switcher follows the order of `[locales] supported`; adding a language or a document is config plus a template, and a configured document and language without a template, or a template no entry names, fails the run. The README is for non-technical users in every language: plain words, no developer terms, and developer detail goes in `DEVELOPMENT.md` or `CONTRIBUTING.md`. Templates are MiniJinja (`minijinja-js`, settings in `templates/minijinja.toml`, which `minijinja-cli` reads too) and never type a value: the generator passes plain data, such as `{{ site.name }}`, `{{ site.repo.url }}`, `{{ docs_url }}` and `{{ pages.privacy }}` (in the document's language), `{{ versions.react }}` (the installed major version or `0.minor`; `{{ workspace_versions["apps/extension"].typescript }}` for packages whose major differs by workspace), `{{ contact.support }}`, `{{ screenshots.popup.dark }}`, `{{ shortcuts["<id>"].both }}`, and `{{ links.CONTRIBUTING }}` and `{{ root }}` for relative links that work from `i18n/<tag>/`. Macros in `templates/_partials/markdown.md.j2` render the language switcher, the badges, and the store buttons and install lines that follow the live listings (`{{ md.store_badges("Add to {browser}") }}`, `{{ md.store_links("...") }}`). An undefined variable fails the run, and `--dump-context <document> <language>` prints a template's context. Each translation starts with `{# source: <hash> #}`, the English template it was translated from; `--check` warns when the English template has changed since, and `--stale` lists those translations with the hash to record once they are updated. Anchors in translations follow the translated headings (GitHub's slugs); `scripts/generate-markdown.test.ts` checks every relative link, anchor, and switcher link. Run it by hand if hooks are skipped; the Lint job runs `bun run generate:markdown --check`, which fails when an output is missing or differs from its template. No workflow regenerates them. The website privacy policy and `store/privacy-policy.md` link to the docs permissions page, which quotes each browser prompt, not to the README.
- `apps/docs/content/docs/`
- website content under `apps/website/app/`

If code and docs diverge during a task, fix both when reasonable or call out the mismatch explicitly.

## Change discipline

- keep diffs scoped and reviewable
- do not rename or move files without a concrete benefit
- do not perform repo-wide cleanup unless requested
- do not overwrite or revert user changes you did not make
- mention unrelated issues separately instead of folding them into the same task
- prefer additive or local edits over broad rewrites when both solve the problem
- plans (`plans/`) and Backlog.md tasks (`backlog/`) are local agent working state and are git-ignored; never commit them
- keep temporary scripts, screenshots, logs, and one-off reports out of the repository; put them in `~/.cache/bookmark-scout-<topic>/`. Session scratchpads get wiped and are shared between parallel agents, so use them only for throwaway output. Third-party tools and skills sometimes write reports into the working tree (a migration skill once committed `.migration/`); check `git status` for new top-level folders before committing
- script repository files (TOML, JSON, Markdown) with Bun and the workspace's libraries (`smol-toml` for TOML), not the system `python3`, which may lack `tomllib`; one Python edit to the README generator overwrote the READMEs
- after changing a generator or its templates, run it and check `git diff --exit-code` on its output before trusting it; the README templates once lagged months behind their output
- commit messages and pull request titles follow `config/commits.toml` ("<emoji> <type>(<scope>): <summary>"); the `commit-msg` hook and the `PR title` CI job check them with `scripts/check-commit-message.ts`
- do not add CI jobs that commit generated files back; generate locally (pre-commit hook) and let CI fail on drift
- put one-time infrastructure setup (hosting projects, domains, DNS, secrets) in a local, idempotent script with `--dry-run`, not in CI

## Default agent workflow

The `feature-delivery` skill is this workflow in full, from a fresh worktree to a merged PR and the branch and worktree removed right after the merge.

1. identify the target app and read the relevant local files
2. read the matching nested `AGENTS.md` if one exists
3. understand the current implementation before proposing structural changes
4. make the smallest change that cleanly solves the request
5. run targeted verification
6. report files changed, commands run, and remaining risks or gaps

## Design system

Each app keeps its design file next to its `AGENTS.md`: `apps/extension/DESIGN.md`, `apps/website/DESIGN.md`, and `apps/docs/DESIGN.md` (tokens, typography, components, do's and don'ts, in the DESIGN.md format). The root `DESIGN.md` holds only the shared brand and links to them. Read the app's design file before changing its UI, and update it when tokens or shared components change.

## Agent skills

Reusable agent workflows live in `.agents/skills/<name>/SKILL.md` (open Agent Skills layout: `SKILL.md` plus optional `scripts/`, `references/`, `assets/`). Rules go in `AGENTS.md` files and workflows in skills; never add vendor-specific instruction files such as `CLAUDE.md`, `.cursorrules`, or `GEMINI.md`. Tool-specific folders such as `.claude/` are git-ignored. To let Claude Code discover these skills, link them locally: `mkdir -p .claude && ln -s ../.agents/skills .claude/skills`.

Current skills: `feature-delivery`, `extension-feature-test`, `extension-live-smoke`, `extension-exploratory-qa`, `repo-maintenance`, `parallel-agent-delivery`, `extension-ui-change`, `extension-ai-feature`, `extension-bookmark-actions`, `extension-stored-data`, `extension-performance`, `extension-background-jobs`, `mcp-bridge-change`, `website-docs-delivery`, `extension-store-release`, `extension-cws-submission`, `feature-research-planning`, `session-learnings`, `i18n-add-language`, `privacy-disclosure-sync`. Each `SKILL.md` description says when to use it.

Update a skill when a session teaches a lesson that future agents would otherwise relearn. `scripts/skills-index.test.ts` fails when the list above and `.agents/skills/` differ, or a skill's front matter does not name its folder.

## When to add or update nested AGENTS.md files

Use nested `AGENTS.md` files when a subtree needs local rules that are stable, repeated, and more specific than the root guidance. In this repository, the nested app files should remain the authoritative place for app-specific rules.

The root file should stay focused on monorepo-wide coordination, shared standards, and cross-app expectations.
