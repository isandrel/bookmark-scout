---
name: parallel-agent-delivery
description: Plan and run several coding subagents in parallel on the Bookmark Scout repository, or keep several worktrees and stacked branches going at once, and land their work as auto-merged pull requests without conflicts or a broken main. Use when asked to fix many bugs, finish several backlog tasks, "use subagents", or "auto complete all", and when moving a stacked branch onto main after its base PR squash-merged. Covers splitting work, worktrees, sequential PR series that wait for each merge, QA-then-fix waves, stacked branches, a machine-wide E2E lock, codemods, and recovering agents stopped by usage limits or a session end. Bundles wait-pr, e2e-locked, and locale-merge scripts.
---

# Parallel agent delivery

Each agent follows `feature-delivery` for its own PR; this skill is what changes when several run at once. Merging a queue of PRs is in `repo-maintenance`.

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
5. Make every prompt self-contained: the worktree's absolute path and branch, the "Configurable, extensible, customizable, maintainable" rules from the root `AGENTS.md` (agents follow the brief, not the user's past corrections), the findings or `backlog/tasks/` file to read, the verification commands, commit and PR rules, and the required final report (PR URL, merge status, per-bug outcome, verification results, and **user-visible behavior changes or deviations from the brief**). Agents have changed behavior on their own (Enter on a folder saving the page, saved searches moved to local storage); the report section lets you ask the user before it ships.
6. Bump dependencies before dispatching, not while agents run, and restart any shared dev server afterwards. A mid-flight Next.js bump made the dev server return 500 to running agents until it was restarted.
7. When the user asks to wrap up ("finish what's in hand"), land only this session's in-flight work: no new agents, spin-off tasks, or follow-up PRs.
8. **Dependent work is one series, one agent.** When PRs build on each other (storage registry, then settings scopes, then backup), give the whole series to one agent that opens each PR from a fresh `origin/main` only after the previous one merged, and run series that reuse each other's foundations one after another (the October 2026 round ran storage, then manager parity, then AI tools and the MCP bridge). An agent that needs another series' PR polls for its merge with `scripts/wait-pr.sh` instead of guessing its interface. Ask for every required piece in the first brief; a real-binary CI job added mid-series cost a second pass.
9. **Find bugs, then fix them, by surface.** A read-only QA wave (one tester per surface, `extension-exploratory-qa`) returns findings; then one fix agent per report, in a worktree, which may split further with a shared brief file. A test-only agent may land specs that reveal bugs as `test.fixme`; forward each bug to the agent that owns that surface and have its fix PR remove the `fixme`.
10. For a codemod or library migration, read `references/codemods.md` first (baseline, AST scripts, WXT import collisions, timing).

## Branch, commit, PR

- Each agent works in its **own git worktree and branch from `origin/main`** under `.claude/worktrees/`. Never edit the user's main checkout. If a worktree disappears mid-task, recreate it there. Run `bun install --frozen-lockfile` after creating or updating one: a worktree created before `main` added a dependency failed unit tests with `Cannot find package '@ai-sdk/azure'`.
- **Auto-merge only waits for required checks** (the list is in `repo-maintenance`; read the ruleset with `gh api`, not from docs). If a required check is ever removed, stop relying on auto-merge.
- **Push the branch right after the first commit**, before any PR exists. An agent that stopped on a usage limit once left its only commit in a local worktree, where a later cleanup nearly deleted it.
- **Squash onto the merge base, never `git reset --soft origin/main` after a fetch.** If `main` moved, that commit silently reverts the other PRs' files. Use `git reset --soft $(git merge-base HEAD origin/main)` and check that `git diff --stat origin/main...HEAD` lists only your files. To recover a bad commit: `git diff --binary <old-base> <bad-commit> > fix.patch`, `git checkout --detach origin/main`, `git apply --3way fix.patch`, merge the locale files, and commit.
- **BEHIND and DIRTY:** only the PR next in line is updated (`repo-maintenance`, "Merge a queue of PRs"); an agent never runs `update-branch` on its own PR unless it has a real conflict or a CI failure to fix. DIRTY: merge `origin/main` into the branch, resolve (keep both sides' locale keys), re-verify, push.
- **Rebase only what has no PR.** Once a PR is open, never rebase or force-push its branch (a force push after rebasing an open PR was refused, and the branch took a merge of `origin/main` instead). A local branch with no PR may be rebased.
- Use `gh` for all GitHub operations; never browser automation.

## Stacked PRs

- Merging a PR with `--delete-branch` **closes** (does not retarget) PRs based on that branch. Retarget dependents first with `gh pr edit <n> --base main`, or merge the base without deleting its branch.
- **Keep the stack local and open one PR at a time against `main`.** Build the next change on a local branch while the previous PR's CI runs, and write down the previous branch's tip SHA (`git rev-parse <prev-branch>`) **before** its branch and worktree are deleted after the merge; the cleanup removes the name you would otherwise use. After the base squash-merges, move only your own commits onto `main`:
  ```bash
  git fetch -q origin
  git rebase --onto origin/main <prev-tip-sha>   # replays the commits after <prev-tip-sha>
  ```
  Resolve conflicts by key for locale files (`scripts/merge-locales.ts`) and by re-measuring for budget files (`extension-performance`, "Startup size budgets"); never hand-merge numbers. Then rebuild, re-verify, push, open the PR with auto-merge, and wait with `zsh .agents/skills/parallel-agent-delivery/scripts/wait-pr.sh <n>` under `run_in_background` (exit codes in its header; an inline `until` loop is refused by the worktree command guard). The October 2026 rounds moved a dozen stacked branches this way.
- If the stack is a branch whose PR is already open, merge `origin/main` into it instead (above).
- If a stack goes stale while `main` moves a lot, close it with a comment and redo the change on current `main`.
- **Do not chain PR branches by merging one into the next** to open PRs early: every move of `main` meant re-merging the chain and resolving the same conflicts again, about eight times in one series.

## Shared-resource gotchas

- **Locales:** every agent edits every `apps/extension/public/_locales/*/messages.json` (and the website's `messages/*.json`). Give each agent its own key prefix or top-level namespaces in the brief ("you own every namespace except `metadata`, `nav`, `footer`"), so merges never conflict inside a key. When they still conflict, resolve by key, never by line: run `bun .agents/skills/parallel-agent-delivery/scripts/merge-locales.ts` during the conflicted merge or rebase; it three-way merges every conflicted JSON file by key and lists keys both sides changed. Never take one side with `git checkout --theirs` or `--ours`: in October 2026 that dropped the strings main had just added. If you already did, `git checkout -m <files>` brings the conflict back, and the script can then merge it. `tests/unit/locale-messages.test.ts` requires identical keys and placeholders across locales and that every literal `t('key')` exists. Pass counts and titles as substitutions to `t()`; never post-process `$1`.
- **Coverage map:** nearly every PR in a series edits `extension-feature-test/references/coverage.md`. It is one bullet per area so PRs extending different areas merge cleanly; never fold it back into one paragraph, which conflicted on almost every merge.
- **Merged-together regressions:** two PRs that each pass CI can still break when combined. After a batch lands, run an exploratory pass (`extension-exploratory-qa`) on the combined `main`.
- **Storage keys:** refactors must keep keys and areas identical so user data survives; API keys stay in local storage.
- **Shared message files:** when agents edit the same `messages/*.json`, keep the orchestrator's own edits uncommitted until they finish, then commit with explicit paths.

## Running agents and commands

- **Address every checkout by absolute path.** The shell's working directory resets between tool calls, so a relative `cd ../other-worktree` lands somewhere else than intended: one ran a rebase in the wrong worktree, and another ran `wxt zip` in the main checkout. Start each command with `cd /abs/path/.claude/worktrees/<name> &&`, or use `git -C /abs/path`, and check `pwd` before anything that rewrites history or builds.
- Run agents in the background and report to the user as each finishes; do not predict results before a notification arrives.
- Agents share one session scratchpad, and files there were overwritten and even deleted mid-task. Tell each agent to keep scripts, logs, and PR bodies in `~/.cache/bookmark-scout-<branch>/`.
- **Rejecting or interrupting a tool call stops the background agents too.** Avoid it while agents run unless you mean to stop them.
- **Worktree-isolated agents have a command guard** that refuses anything it cannot prove stays inside the worktree: shell variables (`D=...; mkdir $D`), loops, `cd $X`, `git -C <dir>`, heredoc interpreters (`python3 - <<EOF`, `perl -0pi -e`), `gh ... --jq` inside compound commands, and commands a local shell hook rewrites (for example globbed `ls` or `grep`). Tell agents to run plain, separate commands with literal absolute paths, call `/usr/bin/git`, `/usr/bin/grep`, and `/bin/ls` (or the Grep and Glob tools), edit with the Edit tool, run one Nx target per command, and put multi-step logic in a script file run as `zsh /abs/path/script.sh`.
- **Waiting:** a foreground `sleep N` before a check is blocked. Use `run_in_background`, or an `until` loop that polls a summary file.
- **Re-check reported counts.** Confirm test totals from the PR's CI logs before relaying them; two agents once reported different E2E totals for the same suite.
- **One owner per branch.** Before you push to an agent's branch (to resolve a conflict yourself), tell the agent to stop pushing, then merge `origin/main` into it in a separate detached worktree. After `gh pr update-branch` on a branch you are working on, `git pull --no-rebase` before your next local merge, or the push is rejected.
- **A message to a finished agent restarts it.** Do not send acknowledgements to agents that have already reported.
- **Set `NX_DAEMON=false` for every Nx command in a worktree.** The Nx daemon is shared across worktrees, so one agent's `nx run extension:test:e2e` can run another worktree's specs and report the wrong results.
- If the machine has a shell hook or alias that wraps `git`, the wrapper can fail inside worktrees; call the git binary by absolute path (`/usr/bin/git` on macOS and most Linux).
- Permission prompts mostly come from background agents. Allow rules in the agent tool's local, untracked settings (for Claude Code, `.claude/settings.local.json`) apply to them too; never commit those settings.

## Machine-wide E2E lock

- **One full E2E suite on the machine at a time.** Each suite already runs up to 4 browser workers; when several agents need E2E, have them run the specs they touched and leave the full suite to CI. Tell every agent to run browser tests only through `zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh <abs-worktree> full|specs <files>|firefox` (or `perf`, `perf-compare` for the performance suite), which waits for one machine-wide lock and sets `NX_DAEMON=false PW_WORKERS=2 NO_COLOR=1`. The lock only helps when all agents use it: in one round three agents shared a lock while two others ran suites beside them.
- **Reading the result.** The exit code is the test run's. Each run's output, Playwright's summary included, goes to `~/.cache/bookmark-scout-e2e-logs/<worktree-folder>.log` (`XDG_CACHE_HOME` moves it), which the next run in that worktree overwrites, so copy it first. Nx tasks run with `--output-style=static` there, because Nx otherwise prints only "N tasks: … succeeded" and a "full log:" path under `~/.nx/<workspace-hash>/cache/terminalOutputs/` (which still works for Nx runs started elsewhere).
- The lock lives under `/tmp`, per user, regardless of the cache variable; a lock left by a dead process is taken over. `firefox` mode forwards Playwright arguments, so use `firefox --grep '<title>' --repeat-each=3` for a focused minimum-version check. Keep normal Firefox sandboxing and use the existing ephemeral-profile fixtures.
- When Chromium and host libraries are already installed on a managed runner without root access, build through Nx first, then use `built chromium [Playwright args...]` to run the complete suite under the same lock without invoking `playwright install --with-deps`. `built bridge` also requires the native host's `compile` command first. These modes do not replace CI's build/install targets or prove that a fresh machine has the required host libraries.

## Recovering stopped agents

- **Usage limits and session ends** stop agents mid-task, often all at once, and a stopped agent can be resumed by a message. First inspect each worktree (`git log origin/main..HEAD`, `git status`, the remote branch, its PR state), then resume the same agent (for Claude Code, `SendMessage` with its id) naming the exact state: branch, open PR number, which PRs merged meanwhile, uncommitted file count, "rerun the tests that were in flight", and "merge origin/main, never rebase a branch with a PR". All four fix agents of one round resumed cleanly that way. If an agent reports it was stopped by the user and cannot be resumed, finish the work yourself from its worktree; fetch its remote branch first, because `gh pr update-branch` may have added a merge commit there and your push would be rejected.
- **Stale agent notices.** A "didn't finish before the previous session ended" notice can arrive after the work already merged. Check the PR state before redoing anything.
- **Environment replacement.** Keep source-changing checkouts/worktrees and their Git objects on the environment's declared persistent workspace, not a temporary directory. Logs alone do not preserve commits: back up refs with `git bundle create <persistent-path> --all`, plus binary diffs and necessary untracked sources; exclude profiles, caches, credentials and private transcripts. After restart, verify SHA/status and source hashes, restore locked dependencies, and rerun interrupted checks. Never report a lost commit as delivered or delete unpushed work.

## After landing

- Verify the latest CI run on `main` is green, not just the PR checks.
- Summarize per PR: what changed, tests added, verification results, deferred items, and manual checks still needed (Firefox and Edge runtime, live permission prompts, real AI providers).
- Remove each agent's worktree and branch as soon as its PR merges (`feature-delivery`, step 5), so finished work never piles up; anything else (unmerged, unpushed, or not yours) only with approval, using `repo-maintenance/scripts/cleanup-branches.sh` (dry run first, ref backup).
