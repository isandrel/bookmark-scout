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
- `scripts/generate-readme.ts`: repository utility script
- `README.md`: public project overview and setup
- `CONTRIBUTING.md`: contribution workflow and coding expectations
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
- `public/_locales/`: extension translations for `en`, `ja`, and `ko`

#### `apps/website`

This is the public-facing marketing site.

Important subareas:

- `app/`: Next.js App Router routes, metadata, sitemap, and layouts
- `app/[locale]/`: localized pages and layouts
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
- extension end-to-end tests: `nx run extension:test:e2e`
- extension Edge end-to-end tests: `nx run extension:test:e2e:edge`
- extension Firefox end-to-end smoke tests: `nx run extension:test:e2e:firefox`
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
- `nx run docs:build`, then `bun run --cwd apps/docs verify`

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

Automated extension coverage includes sorting unit tests and Chromium end-to-end tests for popup search, folder creation, bookmark management, settings synchronization, maintenance tools, reports, import/export, offline AI context export, export privacy review, import preview, keyboard shortcuts, saved searches, context-menu saves, popup and side panel drag-and-drop moves, manager column resizing, route-mocked and real-local-server dead-link, metadata, and site icon requests, and mocked-provider AI auto-tagging, summarization, page reading, request logging, opt-in, and provider-error paths (tests titled `[mocked provider contract]`), plus the Ask AI agent with a mocked streaming tool call and its error path, the prompt library, named AI services and the popup service switcher, live settings (language switch and a second Options tab), and dialog motion (no backdrop flash on close). The same suite also runs in Microsoft Edge against the Edge build. Firefox runs a smaller smoke suite (popup search and folder creation, saved site icons in the popup, side panel page, opening the manager from the popup and side panel, manager, settings save, JSON export and import, statistics and privacy reports) against the Firefox build; context menus, drag and drop, network and AI tools, and the browser favicon cache are not covered there. The Edge and Firefox CI jobs are required checks, and the `Website and Docs` job builds, verifies, and browser-tests the marketing site and docs. Live network behavior and real provider compatibility are not covered; do not represent lint or build success as test coverage.

## AI maintainer runbook

Use this section for repo maintenance tasks such as release publishing, CI repair, Dependabot triage, and GitHub Actions verification.

### Release publishing

- Do not publish a release tag unless the user explicitly asks for release publication.
- Before pushing a release tag, confirm:
  - `main` is clean and synced: `git status --short --branch`
  - no PRs are open: `gh pr list --state open`
  - latest relevant Actions for current `main` are green
  - the remote tag does not already exist: `git ls-remote --tags origin vX.Y.Z`
  - `apps/extension/package.json` `version` equals `X.Y.Z`; WXT writes it into the manifest and the release workflow rejects mismatched tags
- If a local release tag points to an older commit, move it to the current passing `main` before pushing: `git tag -f vX.Y.Z HEAD`.
- Push the tag to trigger `Release Extension`: `git push origin vX.Y.Z`.
- Watch the workflow and verify uploaded release assets: `gh run watch <run-id> --exit-status` and `gh release view vX.Y.Z`.
- Expected release assets are Chrome `.crx`, Chrome `.zip`, Firefox `.zip`, Edge `.zip`, and the Firefox review sources `.zip`.

### GitHub Actions troubleshooting

- Inspect logs before changing code:
  - list recent runs: `gh run list --limit 20`
  - inspect failed logs: `gh run view <run-id> --log-failed`
  - watch reruns: `gh run watch <run-id> --exit-status`
- Every workflow job checks out the repository and then runs `.github/actions/setup-workspace`, which installs the Bun version pinned by `packageManager` in `package.json` and runs `bun install --frozen-lockfile`; bump Bun there, not in workflows. Failed browser tests upload their traces through `.github/actions/upload-playwright-failures`.
- The website and docs both deploy to Cloudflare Pages through the reusable `deploy-pages.yml` (build, `<app>:verify`, `wrangler pages deploy --branch`, one concurrency group per app), called by `deploy-website.yml` and `deploy-docs.yml` with the `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PROJECT_NAME_WEBSITE`, and `CLOUDFLARE_PROJECT_NAME_DOCS` secrets. If a deploy fails with a transient Cloudflare API error, rerun the failed job before patching code.
- If `bun install --frozen-lockfile` fails, run `bun install`, commit the updated `bun.lock`, then verify `bun install --frozen-lockfile`.
- CI skips jobs a pull request cannot affect. The rules live in `.github/ci-scopes.toml` as glob patterns: `ignore` (for example every `*.md`, `.agents/`, `backlog/`, `store/`), `shared` (workspace files that run every scope), and named `[scopes]` (`extension`, `sites`). A file that matches no pattern runs every scope. `scripts/ci-scopes.ts` applies the rules in the `Detect changes` job, and `scripts/ci-scopes.test.ts` covers them; extend the TOML, not the workflow, when paths change. Skipped jobs still report as passed, so required checks never block, and pushes to `main` always run everything.
- The Chromium and Edge suites run as matrix shards (`Chromium E2E (i/N)`, `Edge E2E (i/N)`, N from the matrix size in `ci.yml`), each on the worker count from `apps/extension/playwright.config.ts`, with the unit tests in `Extension Unit Tests`. The required checks `Extension Tests` and `Edge E2E` are summary jobs (`.github/actions/require-jobs`) that pass when the extension scope is off, fail when scope detection produced no output, and otherwise fail unless every shard passed. Shard failure diagnostics upload as `playwright-failures-<browser>-<shard>`. The browser jobs do not wait for Lint.
- CI, CodeQL, Dependency Review, and the labeler cancel a pull request's older run when a new push arrives; runs on `main`, releases, and deploys are never cancelled. The extension Playwright config retries a failed test once on CI only, so a test that passes on retry is reported as flaky: fix it rather than raising retries.
- Old failed workflow runs remain in GitHub history. Judge repository health by the latest runs for the current `main` SHA, not by historical failures.

### Dependency automation

- Each workspace declares what it imports or runs in its own `package.json`: the extension's runtime, build, and test packages live in `apps/extension/package.json`. The root `package.json` holds only workspace tooling (Nx, Biome, TypeScript, Husky, lint-staged) and what the root `scripts/` and `.agents/skills/` scripts import. Add a dependency with `bun add` from that app's folder.
- Installs are isolated (`bunfig.toml`, `linker = "isolated"`): a workspace resolves only its declared packages, so an import that works only through another workspace's dependency fails. Declare the package in the importing app instead of adding it to the root. After the first isolated install in a checkout that had hoisted `node_modules`, delete `apps/website/.next` and `apps/docs/.next`, because Turbopack's stale cache fails with `Cannot find module '@vercel/turbopack/postcss'`. Leave `globalStore` off. With it, packages resolve from the Bun cache outside the checkout, and the extension type check (`next-themes` loses `@types/react`) and the website's Turbopack build (`@vercel/turbopack/postcss`) both fail.
- Declaring `react` in a workspace turns on Biome's React rules there. `apps/extension/biome.json` turns off `noArrayIndexKey` and `noChildrenProp` until the existing findings are fixed.
- Treat the root text lockfile `bun.lock` as the workspace lockfile source of truth. It replaced the binary `bun.lockb` so Dependabot can update it and conflicts can be read and merged.
- Keep `bun.lock` at `"lockfileVersion": 1`. Dependabot's bundled Bun reads only format 1 and fails every Bun update on format 2 (dependabot/dependabot-core#16071). Bun 1.4 writes 2 only for a brand-new lockfile and keeps an existing version, and the two formats differ only in that number, so if a regenerated lockfile says 2, change it back to 1. `scripts/lockfile.test.ts` fails otherwise. Raise its limit once Dependabot ships Bun 1.4.
- Dependabot runs weekly with a cooldown and groups updates (`.github/dependabot.yml`): the AI SDK packages, Next.js and the docs framework, build and test tooling, the remaining minor and patch updates, and all GitHub Actions. Add a related package family to a group rather than letting it open one PR per package.
- Avoid app-local `bun.lock` files unless an app truly installs independently in its workflow.
- If a workflow installs from the root, use `bun install --frozen-lockfile` and the workspace script, such as `bun run build:website`.
- Duplicate app-level Bun Dependabot entries can produce `Dependabot::Bun::FileUpdater::NoChangeError`; prefer a single root Bun updater unless the app has a separate lockfile and install workflow.
- After merging Dependabot PRs, check whether `bun.lock` needs a follow-up refresh and whether path-filtered deploy workflows were triggered.
- If a Dependabot Bun PR still fails `bun install --frozen-lockfile`, repair it with `.agents/skills/repo-maintenance/scripts/fix-dependabot-lockfile.sh <pr>`.

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

### Extension

If you change user-visible extension copy, update:

- `apps/extension/public/_locales/en/messages.json`
- `apps/extension/public/_locales/ja/messages.json`
- `apps/extension/public/_locales/ko/messages.json`

### Website

If you change localized website copy, update the relevant files in:

- `apps/website/messages/en.json`
- `apps/website/messages/ja.json`
- `apps/website/messages/ko.json`

Do not silently leave one locale updated and others stale unless the user explicitly asked for a partial change and the limitation is called out.

## Security and privacy rules

This repository includes AI-backed functionality and user bookmark data. Treat privacy and secret handling as first-class constraints.

- never commit API keys, OAuth tokens, or credentials
- never add fake example secrets that look real
- treat bookmark titles, URLs, provider selections, and settings as sensitive user data
- avoid logging sensitive data unless there is a strong existing pattern and a concrete debugging need
- preserve explicit user control for enabling AI features and selecting providers
- do not weaken existing consent, disclosure, or privacy messaging
- when a change alters what data leaves the device, update `store/privacy-policy.md`, `store/privacy-disclosures.md`, `store/permissions.md`, the docs `privacy.mdx` and `permissions.mdx`, and `apps/website/messages/privacy/{en,ja,ko}.json` in the same change

## Documentation policy

Update documentation when the change affects:

- installation or setup steps
- product capabilities
- browser support
- privacy expectations
- configuration requirements
- user-facing workflows

Relevant locations include:

- `README.md` and `translations/README.{ja,ko}.md`, which are generated locally: edit `templates/README*.md` (or `config/`), and the pre-commit hook runs `bun run generate:readme` and stages the output. Templates use placeholders for config values (`{{SITE_URL}}`), library versions (`{{VERSION:react}}`, the installed major version or `0.minor`), and the supported-browser badges (`{{BROWSER_BADGES:<label>}}`); an unknown placeholder fails the run. Run it by hand if hooks are skipped; the Lint job fails when the READMEs and templates differ. No workflow regenerates them.
- `CONTRIBUTING.md`
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
- keep temporary scripts, screenshots, logs, and one-off reports out of the repository; put them in `~/.cache/bookmark-scout-<topic>/`. Session scratchpads get wiped and are shared between parallel agents, so use them only for throwaway output. Third-party tools and skills sometimes write reports into the working tree (a migration skill once committed `.migration/`); check `git status` for new top-level folders before committing
- script repository files (TOML, JSON, Markdown) with Bun and the workspace's libraries (`smol-toml` for TOML), not the system `python3`, which may lack `tomllib`; one Python edit to the README generator overwrote the READMEs
- after changing a generator or its templates, run it and check `git diff --exit-code` on its output before trusting it; the README templates once lagged months behind their output
- do not add CI jobs that commit generated files back; generate locally (pre-commit hook) and let CI fail on drift
- put one-time infrastructure setup (hosting projects, domains, DNS, secrets) in a local, idempotent script with `--dry-run`, not in CI

## Default agent workflow

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

- `extension-feature-test`: turning behaviors into unit and E2E coverage, with lessons from past audits.
- `extension-live-smoke`: read-only checks of an installed extension with Computer Use, and its tool limits.
- `extension-exploratory-qa`: hands-on QA of the built extension in a disposable Playwright profile, with a bundled runner script.
- `repo-maintenance`: landing a PR queue under the strict up-to-date ruleset, Dependabot lockfile repair, red-main recovery, and branch cleanup, with bundled scripts.
- `parallel-agent-delivery`: splitting work across parallel agents and landing auto-merged PRs safely.
- `extension-ui-change`: restyling extension surfaces with the phased PR plan, token audits, Base UI quirks, visual checks, and expected settings UX.
- `extension-ai-feature`: adding AI providers, tools, and limits end to end: config, storage, logging, disclosures, and provider gotchas.
- `website-docs-delivery`: verifying, screenshot-reviewing, and deploying the website and docs, with next-intl, Playwright, image pipeline, hosting cutover, and Cloudflare Pages traps, plus a marketing and SEO review reference.
- `extension-store-release`: getting the builds, manifests, release assets, and listings ready for the Chrome Web Store, Firefox Add-ons, and Edge Add-ons, without submitting.
- `feature-research-planning`: research-first planning for a new capability or redesign: map the code, research libraries and patterns online, present options with a recommended default.
- `session-learnings`: mining past agent sessions into portable skill and `AGENTS.md` updates, with a transcript digest script.

Update a skill when a session teaches a lesson that future agents would otherwise relearn.

## When to add or update nested AGENTS.md files

Use nested `AGENTS.md` files when a subtree needs local rules that are stable, repeated, and more specific than the root guidance. In this repository, the nested app files should remain the authoritative place for app-specific rules.

The root file should stay focused on monorepo-wide coordination, shared standards, and cross-app expectations.
