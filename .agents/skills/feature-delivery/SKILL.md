---
name: feature-delivery
description: Deliver one Bookmark Scout feature or fix end to end as a single agent, from a clean worktree to a merged pull request and a cleaned-up checkout. Covers the worktree and branch, the order of work (config, code, messages, tests, docs, disclosures), verification, commit and PR with auto-merge, merging one PR at a time, and removing the branch and worktree right after the merge. Use whenever you start, continue, or finish a change that will become a PR, including when the user says "continue", "auto complete", or "ship it"; for several agents at once, use parallel-agent-delivery instead.
---

# Feature delivery (one agent, end to end)

This is the path every change follows. The area skills hold the details: `extension-ui-change`, `extension-ai-feature`, `extension-background-jobs`, `extension-stored-data`, `website-docs-delivery`, `mcp-bridge-change`, and `privacy-disclosure-sync`. This file only orders the steps and links to them.

## 1. Start clean

- **Worktree.** Work in a worktree under `.claude/worktrees/<name>`, on a branch made from a fresh `origin/main`. Never edit the main checkout, whose `apps/extension/dist` the maintainer's browser loads.
  ```bash
  git fetch -q origin && git worktree add .claude/worktrees/<name> -b <type>/<topic> origin/main
  ```
  Then run `bun install --frozen-lockfile` in it.
- **Plan.** For broad work, write a plan (`feature-research-planning`), with one PR per phase. Plans and scratch files never go in the repository: plans live in `plans/`, which is git-ignored, and scratch files in `~/.cache/bookmark-scout-<topic>/`.
- **Read first.** Read the nested `AGENTS.md`, and the `DESIGN.md` before UI work.

## 2. Build it the way the maintainer reviews it

Follow "Configurable, extensible, customizable, maintainable" in the root `AGENTS.md`:

- **No literals in source.** Numbers and strings go in a TOML file, read once by its owning module. Settings go in `config/settings/`. Values every app shares go in `config/project.toml`.
- **No fallbacks.** Parse stored data with zod and fail clearly; do not add `?? default`.
- **New cases are table entries.** Use `TOOL_DEFINITIONS`, `ACTIONS`, `JOB_ADAPTERS`, the permission catalog, and `config/browsers/profiles.toml`, not `if` chains or browser checks.
- **Check for an existing helper.** Search `lib/`, `hooks/`, `services/`, `components/ui/`, and the test helpers (`tests/e2e/*-helpers.ts`, `tests/e2e/ai-provider-mock.ts`) before writing one. Merge copies that must change together.
- **Every user-visible string in every locale.** The extension uses `_locales`, the website its message files, and the docs the `*.<tag>.mdx` pages. Shortcuts and setting defaults come from config (`<Shortcut>`, `<SettingDefault>`), never typed by hand.
- **Disclosures in the same PR.** When what is stored or sent changes, update them in the same PR (`privacy-disclosure-sync`).
- **Keep the guidance current.** Update the coverage map, `DESIGN.md`, the docs, and the skill whose area changed. Add a lesson to the skill it belongs in.

## 3. Verify the smallest set that proves it

Run these from the worktree, and report exact commands and counts:

```bash
bunx nx run-many -t lint typecheck test:unit build:chrome build:firefox build:edge -p extension
```

- **Extension E2E:**
  - Chromium: `bunx playwright test --config playwright.config.ts --project=chromium [spec]`, run from `apps/extension` after `bun run build:chrome`. Run the full suite before the PR.
  - Firefox: `SE_OFFLINE=true bunx playwright test --config playwright.config.ts --project=firefox`, after `bun run build:firefox`.
  - Edge: CI only.
- **New E2E tests:** repeat them with `--repeat-each=3`. A rerun that passes says nothing about a flaky test.
- **Sizes and imports:**
  - Startup: `tests/e2e/startup-code.spec.ts`.
  - Distribution: `bunx wxt zip -b <browser>`, then `bun scripts/check-distribution-size.ts <browser>`.
  - Unresolved auto-imports: `bun .agents/skills/extension-feature-test/scripts/scan-unresolved-imports.ts apps/extension dist/chrome-mv3`.
- **Docs, website, and scripts** (see their `AGENTS.md`):
  - `nx run-many -t types:check lint build -p docs`, then `bun run --cwd apps/docs verify`. A stale `.next` type error goes away after the build.
  - `nx run-many -t lint verify -p website`.
  - `bun test scripts`.
- **Biome:** run it from `apps/extension` for extension files. A `biome.json` above the repository makes a run from the root fail with "nested root configuration".

## 4. Commit, PR, merge

- **Commits.** Use Conventional Commits with the emoji prefix (`✨ feat(extension): ...`), with no attribution lines. Stage only intended files, and check `git status` for stray folders first.
- **Push and open the PR.** Push right after the first commit. Open the PR with a summary, the privacy impact, the tests, and the exact verification. Then run `gh pr merge <n> --squash --auto`.
- **One PR at a time.** Only the next PR in line is updated (`repo-maintenance`).
  - When a PR goes DIRTY, merge `origin/main` into it and resolve: keep both sides' locale keys, take the higher budget with a dated reason, and union the docs rows.
  - Re-verify, then push. Never force-push a branch that has a PR.
- **CI failures.** Read the failed job's log (`gh api repos/<o>/<r>/actions/jobs/<id>/logs --allow-escape-sequences`). Fix the cause, or rerun only a known flake. CodeQL findings block the merge even in tests.

## 5. Clean up right after the merge

As soon as your PR shows MERGED, before starting the next one:

```bash
git -C <main-checkout> fetch -q origin --prune
git -C <main-checkout> pull -q --ff-only origin main
git worktree remove .claude/worktrees/<name>     # or reuse it: git switch -c <next> origin/main
git branch -D <type>/<topic>
git push origin --delete <type>/<topic>          # skip if GitHub already deleted it
(cd <main-checkout>/apps/extension && bun run build:chrome)  # refresh the build the maintainer loads
```

- **Your branches only.** Remove only the branches and worktrees you made for merged PRs.
- **Bulk cleanup** of other branches uses `repo-maintenance/scripts/cleanup-branches.sh` (dry run first, with a ref backup).
- **Never delete** `apps/extension/dist`, unpushed work, or a stash you did not make.

Then free what the runs left on this machine (all git-ignored, none of it the maintainer's):

- `bun run clean` lists what a run regenerates (test results, coverage reports and builds) in this checkout and every worktree, and removes it with `--apply`; it also reports the shared caches with how to trim each. The items below are what it does not cover.
- Release zips `wxt zip` wrote for the size check: `rm -f apps/extension/dist/bookmark-scout-v*.zip` (in the main checkout only the zips; never `dist/chrome-mv3`).
- Test browsers a killed or timed-out run left running: `pgrep -fl "Chrome for Testing|chrome-headless-shell|geckodriver|marionette"`, then stop only those test processes, never the maintainer's own Chrome or Firefox.
- `~/.cache/bookmark-scout-<topic>/` scratch (helper scripts, logs, PR bodies) once the topic's last PR merged. Keep `~/.cache/selenium` (the cached geckodriver) and the ref backups `cleanup-branches.sh` writes.

## 6. Report

Say what changed, which commands ran with their results, what was not run and why, and what is still to do. Do not stop at a report while work remains that the user asked for.
