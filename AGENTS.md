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

## Repository map

### Workspace root

Key root files and directories:

- `package.json`: root workspace scripts, Bun entrypoints, and Nx command orchestration
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
- extension Chrome build: `nx run extension:build:chrome`
- extension Firefox build: `nx run extension:build:firefox`
- extension Edge build: `nx run extension:build:edge`
- website build: `nx run website:build`
- docs build: `nx run docs:build`

Use the smallest command set that exercises the code you changed.

## Verification policy

Verification is required for substantive changes. At a minimum, run the narrowest relevant validation command for the affected area and report what you ran.

### Extension changes

Minimum:

- `nx run extension:lint`

Also run build targets when the change affects runtime behavior, entrypoints, browser-specific behavior, packaging, configuration, or imports that cross extension runtime boundaries:

- `nx run extension:build:chrome`
- `nx run extension:build:firefox`
- `nx run extension:build:edge`

### Website changes

- `nx run website:build`

### Docs changes

- `nx run docs:build`

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

This repository does not currently expose a dedicated automated unit or integration test suite in the normal workspace scripts. Do not represent lint or build success as test coverage.

## AI maintainer runbook

Use this section for repo maintenance tasks such as release publishing, CI repair, Dependabot triage, and GitHub Actions verification.

### Release publishing

- Do not publish a release tag unless the user explicitly asks for release publication.
- Before pushing a release tag, confirm:
  - `main` is clean and synced: `rtk git status --short --branch`
  - no PRs are open: `rtk gh pr list --state open`
  - latest relevant Actions for current `main` are green
  - the remote tag does not already exist: `rtk git ls-remote --tags origin vX.Y.Z`
- If a local release tag points to an older commit, move it to the current passing `main` before pushing: `rtk git tag -f vX.Y.Z HEAD`.
- Push the tag to trigger `Release Extension`: `rtk git push origin vX.Y.Z`.
- Watch the workflow and verify uploaded release assets: `rtk gh run watch <run-id> --exit-status` and `rtk gh release view vX.Y.Z`.
- Expected release assets are Chrome `.crx`, Chrome `.zip`, Firefox `.zip`, and Edge `.zip`.

### GitHub Actions troubleshooting

- Inspect logs before changing code:
  - list recent runs: `rtk gh run list --limit 20`
  - inspect failed logs: `rtk gh run view <run-id> --log-failed`
  - watch reruns: `rtk gh run watch <run-id> --exit-status`
- If a GitHub Pages deployment fails after build/upload with `Deployment failed, try again later`, treat it as likely transient and rerun the failed job before patching code.
- If `bun install --frozen-lockfile` fails, run `rtk bun install`, commit the updated `bun.lockb`, then verify `rtk bun install --frozen-lockfile`.
- Old failed workflow runs remain in GitHub history. Judge repository health by the latest runs for the current `main` SHA, not by historical failures.

### Dependency automation

- Treat root `bun.lockb` as the workspace lockfile source of truth.
- Avoid app-local `bun.lock` files unless an app truly installs independently in its workflow.
- If a workflow installs from the root, use `bun install --frozen-lockfile` and the workspace script, such as `bun run build:website`.
- Duplicate app-level Bun Dependabot entries can produce `Dependabot::Bun::FileUpdater::NoChangeError`; prefer a single root Bun updater unless the app has a separate lockfile and install workflow.
- After merging Dependabot PRs, check whether `bun.lockb` needs a follow-up refresh and whether path-filtered deploy workflows were triggered.

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

## Documentation policy

Update documentation when the change affects:

- installation or setup steps
- product capabilities
- browser support
- privacy expectations
- configuration requirements
- user-facing workflows

Relevant locations include:

- `README.md`
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

## Default agent workflow

1. identify the target app and read the relevant local files
2. read the matching nested `AGENTS.md` if one exists
3. understand the current implementation before proposing structural changes
4. make the smallest change that cleanly solves the request
5. run targeted verification
6. report files changed, commands run, and remaining risks or gaps

## When to add or update nested AGENTS.md files

Use nested `AGENTS.md` files when a subtree needs local rules that are stable, repeated, and more specific than the root guidance. In this repository, the nested app files should remain the authoritative place for app-specific rules.

The root file should stay focused on monorepo-wide coordination, shared standards, and cross-app expectations.
