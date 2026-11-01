# Running several coding subagents

Read this only when the user asks for subagents or parallel agents ("use subagents", "fan out"). The maintainer's default is one agent doing the work in sequence; the rest of `feature-delivery` covers that, including stacked PRs and several worktrees.

Each agent follows `feature-delivery` for its own PR. Merging a queue of PRs is in `repo-maintenance`.

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
8. **Dependent work is one series, one agent** (or one native stack). Give the whole series to one agent, and run series that reuse each other's foundations one after another (the October 2026 round ran storage, then manager parity, then AI tools and the MCP bridge). An agent that needs another series' PR polls for its merge with `scripts/wait-pr.sh` instead of guessing its interface. Ask for every required piece in the first brief; a real-binary CI job added mid-series cost a second pass.
9. **Find bugs, then fix them, by surface.** A read-only QA wave (one tester per surface, `extension-exploratory-qa`) returns findings; then one fix agent per report, in a worktree, which may split further with a shared brief file. A test-only agent may land specs that reveal bugs as `test.fixme`; forward each bug to the agent that owns that surface and have its fix PR remove the `fixme`.
10. For a codemod or library migration, read `codemods.md` first (baseline, AST scripts, WXT import collisions, timing).

## Running agents

- Run agents in the background and report to the user as each finishes; do not predict results before a notification arrives.
- Agents share one session scratchpad, and files there were overwritten and even deleted mid-task. Tell each agent to keep scripts, logs, and PR bodies in `~/.cache/bookmark-scout-<branch>/`.
- **Rejecting or interrupting a tool call stops the background agents too.** Avoid it while agents run unless you mean to stop them.
- **Worktree-isolated agents have a command guard** that refuses anything it cannot prove stays inside the worktree: shell variables (`D=...; mkdir $D`), loops, `cd $X`, `git -C <dir>`, heredoc interpreters (`python3 - <<EOF`, `perl -0pi -e`), `gh ... --jq` inside compound commands, and commands a local shell hook rewrites (for example globbed `ls` or `grep`). Tell agents to run plain, separate commands with literal absolute paths, call `/usr/bin/git`, `/usr/bin/grep`, and `/bin/ls` (or the Grep and Glob tools), edit with the Edit tool, run one Nx target per command, and put multi-step logic in a script file run as `zsh /abs/path/script.sh`.
- **Re-check reported counts.** Confirm test totals from the PR's CI logs before relaying them; two agents once reported different E2E totals for the same suite.
- **One owner per branch.** Before you push to an agent's branch (to resolve a conflict yourself), tell the agent to stop pushing, then merge `origin/main` into it in a separate detached worktree. After `gh pr update-branch` on a branch you are working on, `git pull --no-rebase` before your next local merge, or the push is rejected.
- **A message to a finished agent restarts it.** Do not send acknowledgements to agents that have already reported.
- Permission prompts mostly come from background agents. Allow rules in the agent tool's local, untracked settings (for Claude Code, `.claude/settings.local.json`) apply to them too; never commit those settings.
- With several agents, each runs the specs it touched under the E2E lock and leaves the whole suite to CI; the lock only helps when every agent uses it (in one round three agents shared it while two others ran suites beside them).

## Recovering stopped agents

- **Usage limits and session ends** stop agents mid-task, often all at once, and a stopped agent can be resumed by a message. First inspect each worktree (`git log origin/main..HEAD`, `git status`, the remote branch, its PR state), then resume the same agent (for Claude Code, `SendMessage` with its id) naming the exact state: branch, open PR number, which PRs merged meanwhile, uncommitted file count, "rerun the tests that were in flight", and "merge origin/main, never rebase a branch with a PR". All four fix agents of one round resumed cleanly that way. If an agent reports it was stopped by the user and cannot be resumed, finish the work yourself from its worktree; fetch its remote branch first, because `gh pr update-branch` may have added a merge commit there and your push would be rejected.
- **Stale agent notices.** A "didn't finish before the previous session ended" notice can arrive after the work already merged. Check the PR state before redoing anything.
- **Environment replacement.** Keep source-changing checkouts/worktrees and their Git objects on the environment's declared persistent workspace, not a temporary directory. Logs alone do not preserve commits: back up refs with `git bundle create <persistent-path> --all`, plus binary diffs and necessary untracked sources; exclude profiles, caches, credentials and private transcripts. After restart, verify SHA/status and source hashes, restore locked dependencies, and rerun interrupted checks. Never report a lost commit as delivered or delete unpushed work.

## After landing

- Verify the latest CI run on `main` is green, not just the PR checks.
- Summarize per PR: what changed, tests added, verification results, deferred items, and manual checks still needed (Firefox and Edge runtime, live permission prompts, real AI providers).
- Remove each agent's worktree and branch as soon as its PR merges (`feature-delivery`, "Clean up right after the merge"); anything else (unmerged, unpushed, or not yours) only with approval, using `repo-maintenance/scripts/cleanup-branches.sh` (dry run first, ref backup).
