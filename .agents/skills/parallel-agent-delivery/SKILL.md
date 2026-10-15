---
name: parallel-agent-delivery
description: Plan and run several coding subagents in parallel on the Bookmark Scout repository and land their work as auto-merged pull requests without conflicts or a broken main. Use when asked to fix many bugs, finish several backlog tasks, or "use subagents". Covers splitting work, worktrees, sequential PR series that wait for each merge, QA-then-fix waves, PR and merge mechanics without rebasing, a machine-wide E2E lock, and recovering agents stopped by usage limits. Bundles wait-pr, e2e-locked, and locale-merge scripts.
---

# Parallel agent delivery

## Plan the split

For a repository-wide refactor (config, duplicates, module design), run it in waves:
1. A read-only audit, one agent per area, against a written rubric file they all read, returning findings as text (subagents cannot write report files; the orchestrator saves them).
2. One foundation PR, by one agent, that adds the shared pieces every area will need (config loader with decentralized readers, helpers, storage and toast APIs), so later agents add files instead of editing one central file.
3. One agent per area in parallel, each with its own config files, consuming the foundation.
4. A final wave for the code that depends on several areas (pages, big components).
Keep shared briefs (rules, interfaces, findings) in files under `~/.cache/` that every agent reads, so prompts stay short and survive a context reset; append each wave's interfaces and follow-ups to the same file as reports arrive.

1. Group work by **file ownership**, not bug count. Each agent owns a set of files; tell every agent which neighbouring files it must not edit and who owns them. Areas that split cleanly here: popup and side panel (`PopupPage.tsx`, `components/bookmark/*`, `stores/bookmark-store.ts`), manager (`BookmarksPage.tsx`, `components/bookmarks/*` except tools, `components/ui/table/*`), Tools (`ToolsSidebar.tsx`, `ToolCards.tsx`, tool services), options and background (`OptionsPage.tsx`, settings and recent-folder storage, `services/context-menu.ts`).
2. When two agents need the same new helper, prescribe its **exact path, name, and signature** in both prompts (for example `src/hooks/use-bookmark-events.ts` exporting `useBookmarkEvents(callback)`), so the second merge is a trivial conflict.
3. Order inside each agent: security, then data loss, then broken core flows, then polish. Security and data-loss fixes go in their own commits.
4. Keep concurrency to about four agents. More agents mean more conflicts and more rate-limit stops.
5. Make every prompt self-contained: branch name, the "Configurable, extensible, customizable, maintainable" rules from the root `AGENTS.md` (agents follow the brief, not the user's past corrections), the findings or `backlog/tasks/` file to read, the verification commands below, commit and PR rules, and the required final report (PR URL, merge status, per-bug outcome, verification results, and **user-visible behavior changes or deviations from the brief**). Agents have changed behavior on their own (Enter on a folder saving the page, saved searches moved to local storage); the report section lets you ask the user before it ships.
6. Bump dependencies before dispatching, not while agents run, and restart any shared dev server afterwards. A mid-flight Next.js bump made the dev server return 500 to running agents until it was restarted.
7. When the user asks to wrap up ("finish what's in hand"), land only this session's in-flight work: no new agents, spin-off tasks, or follow-up PRs.
8. For a migration or codemod, record a baseline on `origin/main` first (lint warning count, unit and E2E totals; the type check must stay at zero errors) and diff against it, so existing failures are not blamed on the change.
9. **Dependent work is one series, one agent.** When PRs build on each other (storage registry, then settings scopes, then backup), give the whole series to one agent that opens each PR from a fresh `origin/main` only after the previous one merged, and run series that reuse each other's foundations one after another (the October 2026 round ran storage, then manager parity, then AI tools and the MCP bridge). An agent that needs another series' PR polls for its merge with `scripts/wait-pr.sh` instead of guessing its interface. Ask for every required piece in the first brief; a real-binary CI job added mid-series cost a second pass.
10. **Find bugs, then fix them, by surface.** A read-only QA wave (one tester per surface, `extension-exploratory-qa`) returns findings; then one fix agent per report, in a worktree, which may split further with a shared brief file. A test-only agent may land specs that reveal bugs as `test.fixme`; forward each bug to the agent that owns that surface and have its fix PR remove the `fixme`.

Verification for extension changes, from the repository root (in worktrees, export `NX_DAEMON=false` first):
```bash
bunx nx run extension:lint
bunx nx run extension:typecheck
bunx nx run extension:test:unit
bunx nx run extension:build:chrome
bunx nx run extension:build:firefox
bunx nx run extension:build:edge
bunx nx run extension:test:e2e
```

## Branch, commit, PR

- Each agent works in its **own git worktree and branch from `origin/main`** under `.claude/worktrees/`. Never edit the user's main checkout. If a worktree disappears mid-task, recreate it there.
- Conventional Commits with the repository's emoji prefix (for example `🐛 fix(extension): ...`). No Co-Authored-By or "Generated with" attribution lines.
- Open PRs with `.github/pull_request_template.md`, then `gh pr merge <n> --auto --squash`.
- **Auto-merge only waits for required checks.** The list lives in the `Protect Main Branch` ruleset (see the `repo-maintenance` skill; read it with `gh api`, not from docs, which have drifted). Before E2E was required, PRs auto-merged with red or still-running E2E. If a required check is ever removed, stop relying on auto-merge.
- **Push the branch right after the first commit**, before any PR exists. An agent that stopped on a usage limit once left its only commit in a local worktree, where a later cleanup nearly deleted it.
- **Squash onto the merge base, never `git reset --soft origin/main` after a fetch.** If `main` moved, that commit silently reverts the other PRs' files. Use `git reset --soft $(git merge-base HEAD origin/main)` and check that `git diff --stat origin/main...HEAD` lists only your files. To recover a bad commit: `git diff --binary <old-base> <bad-commit> > fix.patch`, `git checkout --detach origin/main`, `git apply --3way fix.patch`, merge the locale files, and commit.
- BEHIND: `gh pr update-branch <n>`. DIRTY: merge `origin/main` into the branch, resolve (keep both sides' locale keys), re-verify, push. **Never force-push** a branch that has an open PR; `--force-with-lease` is acceptable only on a branch with no PR yet.
- After creating or updating a worktree, run `bun install --frozen-lockfile`. A worktree created before `main` added a dependency failed unit tests with `Cannot find package '@ai-sdk/azure'`.
- Use `gh` for all GitHub operations; never browser automation.

## Stacked PRs

- Merging a PR with `--delete-branch` **closes** (does not retarget) PRs based on that branch. Retarget dependents first with `gh pr edit <n> --base main`, or merge the base without deleting its branch.
- After a base PR is squash-merged, update the dependent branch by merging `origin/main`.
- If a stack goes stale while `main` moves a lot, close it with a comment and redo the change on current `main`.
- **What worked best: keep the stack local and open one PR at a time against `main`, without rebasing.** Build the next change on a local `wip/<x>` branch while the previous PR's CI runs, and note the previous PR's tip SHA. After it squash-merges, check `git diff --stat <prev-tip> origin/main` is empty (the squash produced the same tree), then move the work onto a fresh branch as a patch:
  ```bash
  git diff --binary <prev-tip> wip/<x> > ~/.cache/bookmark-scout-<x>/pr.patch
  git checkout -b feat/<x> origin/main
  git apply --index ~/.cache/bookmark-scout-<x>/pr.patch
  ```
  Push, open the PR with auto-merge, and wait with `zsh .agents/skills/parallel-agent-delivery/scripts/wait-pr.sh <n>` under `run_in_background` (exit codes in its header; an inline `until` loop is refused by the worktree command guard). Delete the `wip/*` branch once its PR merges.
- **Do not chain PR branches by merging one into the next** to open PRs early: every move of `main` meant re-merging the chain and resolving the same conflicts again, about eight times in one series.

## Shared-resource gotchas

- **Locales:** every agent edits every `apps/extension/public/_locales/*/messages.json` (and the website's `messages/*.json`). Give each agent its own key prefix or top-level namespaces in the brief ("you own every namespace except `metadata`, `nav`, `footer`"), so merges never conflict inside a key. When they still conflict, resolve by key, never by line: run `bun .agents/skills/parallel-agent-delivery/scripts/merge-locales.ts` during the conflicted merge; it three-way merges every conflicted JSON file by key and lists keys both sides changed. `tests/unit/locale-messages.test.ts` requires identical keys and placeholders across locales and that every literal `t('key')` exists. Pass counts and titles as substitutions to `t()`; never post-process `$1`.
- **Auto-imports:** WXT auto-imports `components/**`, `hooks`, `utils`, `lib`, `services`, `stores`, plus `browser`, `storage`, and the `Browser` type. No explicit imports for those and no `index.ts` barrels.
- **Merged-together regressions:** two PRs that each pass CI can still break when combined. After a batch lands, run an exploratory pass (`extension-exploratory-qa` skill) on the combined `main`.
- **Storage keys:** refactors must keep keys and areas identical so user data survives; API keys stay in local storage.

## Running and recovering agents

- Run agents in the background and report to the user as each finishes; do not predict results before a notification arrives.
- Agents share one session scratchpad, and files there were overwritten and even deleted mid-task. Tell each agent to keep scripts, logs, and PR bodies in `~/.cache/bookmark-scout-<branch>/`.
- **Rejecting or interrupting a tool call stops the background agents too**, and they cannot be resumed. Avoid it while agents run unless you mean to stop them. Afterwards check `ListAgents`, inspect each worktree with `git status`, and start new agents told to continue from the files on disk.
- **Worktree-isolated agents have a command guard** that refuses anything it cannot prove stays inside the worktree: shell variables (`D=...; mkdir $D`), loops, `cd $X`, `git -C <dir>`, heredoc interpreters (`python3 - <<EOF`, `perl -0pi -e`), `gh ... --jq` inside compound commands, and commands a local shell hook rewrites (for example globbed `ls` or `grep`). Tell agents to run plain, separate commands with literal absolute paths, call `/usr/bin/git`, `/usr/bin/grep`, and `/bin/ls` (or the Grep and Glob tools), edit with the Edit tool, run one Nx target per command (`extension:build:chrome`, then `:firefox`, then `:edge`), and put multi-step logic in a script file run as `zsh /abs/path/script.sh`.
- **Waiting:** a foreground `sleep N` before a check is blocked. Use `run_in_background`, or an `until` loop that polls a summary file.
- **Re-check reported counts.** Confirm test totals from the PR's CI logs before relaying them; two agents once reported different E2E totals for the same suite.
- **Shared message files:** when agents edit the same `messages/*.json`, keep the orchestrator's own edits uncommitted until they finish, then commit with explicit paths.
- Subagents may be blocked from writing report files; have them return findings as text and save them from the orchestrating session.
- If agents stop on a rate limit or session end, inspect each worktree (`git log origin/main..HEAD`, `git status`) and resume the same agent with a message describing its exact state, rather than starting over.
- **One full E2E suite on the machine at a time.** Each suite already runs up to 4 browser workers; when several agents need E2E, have them run the specs they touched and leave the full suite to CI. Tell every agent to run browser tests only through `zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh <abs-worktree> full|specs <files>|firefox`, which waits for one machine-wide lock and sets `NX_DAEMON=false PW_WORKERS=2 NO_COLOR=1`. The lock only helps when all agents use it: in one round three agents shared a lock while two others ran suites beside them.
- The wrapper's per-user lock is shared under `/tmp` independently of `XDG_CACHE_HOME`; logs honor that cache variable. `firefox` mode forwards Playwright arguments, so use `firefox --grep '<title>' --repeat-each=3` for a focused minimum-version check. Preserve each run's log before the next invocation overwrites it. Keep normal Firefox sandboxing and use the existing ephemeral-profile fixtures.
- When Chromium and host libraries are already installed on a managed runner without root access, build through Nx first, then use `built chromium [Playwright args...]` to run the complete suite under the same lock without invoking `playwright install --with-deps`. `built bridge` also requires the native host's `compile` command first. These modes do not replace CI's build/install targets or prove that a fresh machine has the required host libraries.
- **Coverage map conflicts.** Nearly every PR in a series edits the test coverage map. It is a bulleted list in `extension-feature-test/references/coverage.md`, one line per area, so PRs extending different areas merge cleanly; keep it that way and never fold it back into one paragraph, which conflicted on almost every merge.
- **One owner per branch.** Before you push to an agent's branch (to resolve a conflict yourself), tell the agent to stop pushing, then merge `origin/main` into it in a separate detached worktree. After `gh pr update-branch` on a branch you are working on, `git pull --no-rebase` before your next local merge, or the push is rejected.
- **A message to a finished agent restarts it.** Do not send acknowledgements to agents that have already reported.
- **Set `NX_DAEMON=false` for every Nx command in a worktree.** The Nx daemon is shared across worktrees, so one agent's `nx run extension:test:e2e` can run another worktree's specs and report the wrong results.
- **Usage limits.** Agents stop on session or weekly limits mid-task, often all at once. After the reset, inspect each worktree and resume with SendMessage, naming the exact state: branch, open PR number, which PRs merged meanwhile, uncommitted file count, "rerun the tests that were in flight", and "merge origin/main, never rebase". All four fix agents of one round resumed cleanly that way. If an agent reports it was stopped by the user and cannot be resumed, finish the work yourself from its worktree; fetch its remote branch first, because `gh pr update-branch` may have added a merge commit there and your push would be rejected.
- **Stale agent notices.** A "didn't finish before the previous session ended" notice can arrive after the work already merged. Check the PR state before redoing anything.
- **Environment replacement.** Keep source-changing checkouts/worktrees and their Git objects on the environment's declared persistent workspace, not a temporary directory. Logs alone do not preserve commits: back up refs with `git bundle create <persistent-path> --all`, plus binary diffs and necessary untracked sources; exclude profiles, caches, credentials and private transcripts. After restart, verify SHA/status and source hashes, restore locked dependencies, and rerun interrupted checks. Never report a lost commit as delivered or delete unpushed work.
- If the machine has a shell hook or alias that wraps `git`, the wrapper can fail inside worktrees; call the git binary by absolute path (`/usr/bin/git` on macOS and most Linux).
- Permission prompts mostly come from background agents. Allow rules in the agent tool's local, untracked settings (for Claude Code, `.claude/settings.local.json`) apply to them too; never commit those settings.

## Codemods and library migrations

- Write codemods as TypeScript-AST scripts outside the repository (under `~/.cache/`), importing `typescript` by absolute path. Afterwards grep for leftovers and check the diff for whitespace artifacts; one import codemod left extra blank lines in 28 files, found only after the PR opened.
- Before widening WXT `imports.dirs`, list name collisions from the `wxt prepare` warnings and `.wxt/types/imports.d.ts`, and exclude barrels with `'!**/index.ts'`. After switching branches, run `bunx wxt prepare` before comparing `tsc` output; `.wxt/` types go stale.
- Converting `chrome.*` to `browser.*` breaks unit tests that stub the `chrome` global; rewrite them with WXT's `fakeBrowser` and confirm each still fails on the regression it guards.
- Land a repository-wide codemod when few PRs are open: every open PR conflicts mechanically afterwards. Resolve by taking `main`'s side, then `wxt prepare` and lint.
- Report the migration as a before/after table against the `origin/main` baseline (lint warnings, unit and E2E totals, three builds, `tsc` errors), plus light and dark captures, and list behavior changes you flagged but did not patch.
- Third-party migration skills may write reports into the working tree (one committed `.migration/`). Point their output at `~/.cache/` and check `git status` for new top-level folders before committing.

## After landing

- Land the PRs and fix Dependabot lockfiles with the `repo-maintenance` skill (merge queue, lockfile script, red-main recovery).

- Verify the latest CI run on `main` is green, not just the PR checks.
- Summarize per PR: what changed, tests added, verification results, deferred items, and manual checks still needed (Firefox and Edge runtime, live permission prompts, real AI providers).
- Offer to clean up finished worktrees and branches; delete them only with approval, using `repo-maintenance/scripts/cleanup-branches.sh` (dry run first, ref backup).
