---
name: feature-delivery
description: Deliver Bookmark Scout changes end to end, one or several at a time, from a clean worktree to merged pull requests and a cleaned-up checkout. Covers the worktree and branch, the order of work (config, code, messages, tests, docs, disclosures), the pre-push check, commit and PR with auto-merge, merging one PR at a time, stacked PRs with gh stack for changes that build on each other, several worktrees and the machine-wide E2E lock, locale and budget merge conflicts, and removing branches and worktrees right after the merge; references/subagents.md for running coding subagents. Use whenever you start, continue, or finish a change that will become a PR, including when the user says "continue", "auto complete", "complete all", "ship it", "fix all these", or "use subagents", and when a stacked branch has to move onto main.
---

# Feature delivery

This is the path every change follows, alone or with others in flight. The area skills hold the details: `extension-ui-change`, `extension-ai-feature`, `extension-background-jobs`, `extension-stored-data`, `extension-firefox`, `website-docs-delivery`, `mcp-bridge-change`, and `privacy-disclosure-sync`. Merging a queue of PRs is `repo-maintenance`. Running coding subagents, only when the user asks for them, is `references/subagents.md`.

## 1. Start clean

- **Worktree.** Work in a worktree under `.claude/worktrees/<name>`, on a branch made from a fresh `origin/main`. Never edit the main checkout, whose `apps/extension/dist` the maintainer's browser loads.
  ```bash
  git fetch -q origin && git worktree add .claude/worktrees/<name> -b <type>/<topic> origin/main
  ```
  Then run `bun install --frozen-lockfile` in it, and again after merging a `main` that added a dependency (a stale worktree failed with `Cannot find package '@ai-sdk/azure'`).
- **Plan.** For broad work, write a plan (`feature-research-planning`), with one PR per phase. Plans and scratch files never go in the repository: plans live in `plans/`, which is git-ignored, and scratch files in `~/.cache/bookmark-scout-<topic>/`.
- **Read first.** Read the nested `AGENTS.md`, and the `DESIGN.md` before UI work.

## 2. Build it the way the maintainer reviews it

Follow "Configurable, extensible, customizable, maintainable" in the root `AGENTS.md`:

- **No literals in source.** Numbers and strings go in a TOML file, read once by its owning module. Settings go in `config/settings/`. Values every app shares go in `config/project.toml`.
- **No fallbacks.** Parse stored data with zod and fail clearly; do not add `?? default`.
- **New cases are table entries.** Use `TOOL_DEFINITIONS`, `ACTIONS`, `JOB_ADAPTERS`, the permission catalog, and `config/browsers/profiles.toml`, not `if` chains or browser checks.
- **Check for an existing helper.** Search `lib/`, `hooks/`, `services/`, `components/ui/`, and the test helpers (`tests/e2e/*-helpers.ts`, `tests/e2e/ai-provider-mock.ts`) before writing one. Merge copies that must change together.
- **Every user-visible string in every locale.** The extension uses `_locales`, the website its message files, and the docs the `*.<tag>.mdx` pages. Shortcuts and setting defaults come from config (`<Shortcut>`, `<SettingDefault>`), never typed by hand; tests read expected values from config too.
- **Disclosures in the same PR.** When what is stored or sent changes, update them in the same PR (`privacy-disclosure-sync`).
- **Keep the guidance current.** Update the coverage map, `DESIGN.md`, the docs, and the skill whose area changed. Add a lesson to the skill it belongs in.

## 3. Verify

Report exact commands and counts. The pieces, run from the worktree:

- Extension: `bunx nx run-many -t lint typecheck test:unit build:chrome build:firefox build:edge -p extension`. E2E only through the lock below. Repeat new E2E tests with `--repeat-each=3`; a rerun that passes says nothing about a flaky test.
- Sizes: `bunx wxt zip -b <browser>`, then `bun scripts/check-distribution-size.ts <browser>`; startup sizes are `tests/e2e/startup-code.spec.ts`. Unresolved auto-imports: `bun .agents/skills/extension-feature-test/scripts/scan-unresolved-imports.ts apps/extension dist/chrome-mv3`.
- Docs: `nx run-many -t types:check lint build -p docs`, then `bun run --cwd apps/docs verify`. Website: `nx run-many -t lint verify -p website`. Scripts: `bun test scripts`.
- Biome runs from `apps/extension` for extension files; from the root a `biome.json` above the repository fails with "nested root configuration".

**Before every push of an extension PR:** `zsh .agents/skills/feature-delivery/scripts/pre-push-check.sh <abs-worktree> [--firefox] [--base <lower-branch>] [--specs <spec> ...] [--full]`. It refuses to run until the latest `origin/main` (or, for a stacked layer, `--base`) is merged in, then runs lint, types, unit and script tests, all three distribution size checks, and under the E2E lock the startup budgets, the specs the branch changed, and the `--specs` you name for the code you touched; `--full` runs the whole Chromium suite instead, for changes that reach shared UI, settings, or config. CI runs every suite on shards in about 10 minutes, so the local whole suite (about 12 minutes) is the exception, and two checks at once only queue on the lock (one wait took 11 minutes in November 2026). Running only lint and tests let three PRs fail CI in October 2026: a shortcut test that typed the old command list, a manager header that overlapped at 420px, and size budgets that two PRs passed alone but not together.

## 4. Commit, PR, merge

- **Commits.** Messages follow `config/commits.toml` (`✨ feat(extension): ...`, at most 150 characters, checked by the `commit-msg` hook), with no attribution lines. Stage only intended files, and check `git status` for stray folders first. After a merge commit already exists, commit further changes with a message (`--no-edit` then has none, and the hook rejects it).
- **Push and open the PR.** Push right after the first commit, before any PR exists (an agent stopped by a usage limit once left its only commit in a local worktree that a cleanup nearly deleted). Open the PR from `.github/pull_request_template.md` with a summary, the privacy impact, the tests, and the exact verification. Then `gh pr merge <n> --squash --auto`. Use `gh` for every GitHub operation, never browser automation.
- **Auto-merge waits only for required checks** (the list is in `repo-maintenance`; read the ruleset with `gh api`).
- **One PR at a time.** Only the next PR in line is updated (`repo-maintenance`); never run `update-branch` on your own PR unless it has a real conflict or a CI failure to fix.
- **DIRTY:** merge `origin/main` into the branch and resolve: locale files by key with `bun .agents/skills/feature-delivery/scripts/merge-locales.ts` during the conflicted merge (never `git checkout --theirs` or `--ours`, which once dropped the strings main had just added; `git checkout -m <files>` brings a conflict back), budget files by taking the larger value for each limit and re-measuring (`extension-performance`, "Startup size budgets"), the coverage map (one bullet per area, never one paragraph) and docs rows by keeping both sides. Then re-verify and push.
- **Budgets.** Size and startup limits keep about 10% headroom, so an ordinary feature does not touch them. If one fails, find what grew before raising anything; a meant growth resets that limit to about 10% above the new measurement (`extension-performance`, "Startup size budgets"). Never raise one by a few bytes: that made the next PR in the queue fail CI once `main` was merged into it, every time, until the November 2026 reset.
- **History.** Never rebase or force-push a branch with a PR (the only exception is a stack, below); merge `origin/main` into it instead. A local branch with no PR may be rebased. To squash, reset onto the merge base, never `git reset --soft origin/main` after a fetch, which silently reverts other PRs' files: `git reset --soft $(git merge-base HEAD origin/main)`, then check that `git diff --stat origin/main...HEAD` lists only your files.
- **CI failures.** Read the failed job's log (`gh api repos/{owner}/{repo}/actions/jobs/<id>/logs --allow-escape-sequences`). Fix the cause, or rerun only a known flake. CodeQL findings block the merge even in tests. Two PRs that each pass CI can still break together: after a batch lands, run an exploratory pass (`extension-exploratory-qa`) on the combined `main`.

## 5. Several changes at once

- **Dependent changes: a native stack.** GitHub's stacked PRs (generally available 2026-10-06, every plan, no setup; [docs](https://docs.github.com/en/pull-requests/get-started/about-stacked-prs)) let the next change open while the one below is in review. Each PR targets the branch below it, CI runs for every layer, and branch rules apply as for the bottom PR's base. Merging a layer merges the ones below it bottom-up, and GitHub rebases the rest onto `main` on its side.
  - `gh stack` (`gh extension install github/gh-stack`, `gh` 2.90 or later): `init` and `add` make layers, `submit` opens and links the PRs, `link <bottom> <top>` turns open PRs into a stack, `view` shows it, `merge <top> --squash` merges it. The legacy merge endpoints cannot merge a stack.
  - `gh stack rebase`, `sync`, and `push` push with `--force-with-lease`; the maintainer allows that only for stack branches the agent created and only through `gh stack`. Prefer updating a stack by merging: `origin/main` into the bottom branch, then the bottom into the next layer, each pushed normally. When a merge leaves a layer's tree identical to the verified one (`git diff --quiet HEAD~1 HEAD`), push it without rerunning the checks.
  - A PR with auto-merge on cannot join a stack ("it has auto-merge enabled"): turn it off first. Auto-merge on stacked PRs is not available to every repository yet, so the merge queue script (which follows auto-merge PRs only) leaves stacks alone: merge a stack when its checks pass and every layer is up to date, ideally once the queue is empty, because each merge to `main` makes the stack BEHIND again.
  - `gh stack` pushes the branches it links: fast-forward each local branch to its remote first (`git merge --ff-only origin/<branch>`), because the queue may have updated the lower PR's branch.
  - Verify a layer with `pre-push-check.sh --base <lower-branch>`. CI builds a stacked PR merged with the trunk (`pull/<n>/merge` held `main`'s newer commits), so merge `origin/main` into the layers before measuring sizes (stack #889, November 2026).
- **Without a native stack,** keep the next change on a local branch while the previous PR's CI runs, and write down the previous branch's tip SHA (`git rev-parse <prev-branch>`) before its cleanup. After the base squash-merges, `git fetch -q origin && git rebase --onto origin/main <prev-tip-sha>`, re-verify, open the PR, and wait with `zsh .agents/skills/feature-delivery/scripts/wait-pr.sh <n>` under `run_in_background`. Do not chain PR branches by merging one into the next outside a stack: every move of `main` meant re-merging the chain, about eight times in one series. Merging with `--delete-branch` closes (does not retarget) PRs based on that branch.
- **Independent changes:** one worktree and branch each, every one through steps 1 to 4. Locale files are where they collide: give each change its own key prefix or namespaces.
- **One browser suite on the machine at a time.** Run E2E only through `zsh .agents/skills/feature-delivery/scripts/e2e-locked.sh <abs-worktree> full|specs <files>|firefox [args]` (also `perf`, `perf-compare`, and `built chromium|bridge` for runners that cannot install browsers), which waits for one machine-wide lock under `/tmp` and sets `NX_DAEMON=false PW_WORKERS=2 NO_COLOR=1`. Its exit code is the run's; the output goes to `~/.cache/bookmark-scout-e2e-logs/<worktree-folder>.log`, which the next run in that worktree overwrites. A lock left by a dead process is taken over.
- **Address every checkout by absolute path.** The shell's working directory resets between tool calls, so a relative `cd ../other-worktree` lands elsewhere: one ran a rebase in the wrong worktree, one ran `wxt zip` in the main checkout, and in November 2026 a `cd ../..` ran checks in the main checkout. Start commands with `cd /abs/path/.claude/worktrees/<name> &&` or use `git -C /abs/path`, and check `pwd` before anything that rewrites history or builds. Set `NX_DAEMON=false` for Nx commands in a worktree (the shared daemon once ran another worktree's specs). A shell hook that wraps `git` can fail in worktrees; call the git binary by absolute path.

## 6. Clean up right after the merge

As soon as your PR shows MERGED, before starting the next one:

```bash
git -C <main-checkout> fetch -q origin --prune
git -C <main-checkout> pull -q --ff-only origin main
git worktree remove .claude/worktrees/<name>     # or reuse it: git switch -c <next> origin/main
git branch -D <type>/<topic>
git push origin --delete <type>/<topic>          # skip if GitHub already deleted it
(cd <main-checkout>/apps/extension && bun run build:chrome)  # refresh the build the maintainer loads
```

- **Your branches only.** Remove only the branches and worktrees you made for merged PRs. Bulk cleanup of others uses `repo-maintenance/scripts/cleanup-branches.sh` (dry run first, with a ref backup).
- **Never delete** `apps/extension/dist`, unpushed work, or a stash you did not make.

Then free what the runs left on this machine (all git-ignored, none of it the maintainer's):

- `bun run clean` lists what a run regenerates (test results, coverage reports and builds) in this checkout and every worktree, and removes it with `--apply`; it also reports the shared caches with how to trim each. The items below are what it does not cover.
- Release zips `wxt zip` wrote for the size check: `rm -f apps/extension/dist/bookmark-scout-v*.zip` (in the main checkout only the zips; never `dist/chrome-mv3`).
- Test browsers a killed or timed-out run left running: `pgrep -fl "Chrome for Testing|chrome-headless-shell|geckodriver|marionette"`, then stop only those test processes, never the maintainer's own Chrome or Firefox.
- `~/.cache/bookmark-scout-<topic>/` scratch (helper scripts, logs, PR bodies) once the topic's last PR merged. Keep `~/.cache/selenium` (the cached geckodriver) and the ref backups `cleanup-branches.sh` writes.

## 7. Report

Check that the latest CI run on `main` is green, not just the PR checks. Say what changed per PR, which commands ran with their results, what was not run and why (live permission prompts, real AI providers), and what is still to do. Do not stop at a report while work remains that the user asked for.
