---
name: parallel-agent-delivery
description: Plan and run several coding subagents in parallel on the Bookmark Scout repository and land their work as auto-merged pull requests without conflicts or a broken main. Use when asked to fix many bugs, finish several backlog tasks, or "use subagents". Covers splitting work, worktrees, PR and merge mechanics, stacked PRs, and recovering stopped agents.
---

# Parallel agent delivery

## Plan the split

1. Group work by **file ownership**, not bug count. Each agent owns a set of files; tell every agent which neighbouring files it must not edit and who owns them. Areas that split cleanly here: popup and side panel (`PopupPage.tsx`, `components/bookmark/*`, `stores/bookmark-store.ts`), manager (`BookmarksPage.tsx`, `components/bookmarks/*` except tools, `components/ui/table/*`), Tools (`ToolsSidebar.tsx`, `ToolCards.tsx`, tool services), options and background (`OptionsPage.tsx`, settings and recent-folder storage, `services/context-menu.ts`).
2. When two agents need the same new helper, prescribe its **exact path, name, and signature** in both prompts (for example `src/hooks/use-bookmark-events.ts` exporting `useBookmarkEvents(callback)`), so the second merge is a trivial conflict.
3. Order inside each agent: security, then data loss, then broken core flows, then polish. Security and data-loss fixes go in their own commits.
4. Keep concurrency to about four agents. More agents mean more conflicts and more rate-limit stops.
5. Make every prompt self-contained: branch name, the findings or `backlog/tasks/` file to read, the verification commands below, commit and PR rules, and the required final report (PR URL, merge status, per-bug outcome, verification results).

Verification for extension changes, from the repository root (in worktrees, export `NX_DAEMON=false` first):
```bash
bunx nx run extension:lint
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
- **Auto-merge only waits for required checks.** The `Protect Main Branch` ruleset requires Lint, the three Build Extension jobs, Extension Tests, `Analyze (javascript-typescript)`, and CodeQL, with strict up-to-date branches. Before this, PRs auto-merged with red or still-running E2E. If a required check is ever removed, stop relying on auto-merge.
- BEHIND: `gh pr update-branch <n>`. DIRTY: merge `origin/main` into the branch, resolve (keep both sides' locale keys), re-verify, push. **Never force-push** a published branch.
- Use `gh` for all GitHub operations; never browser automation.

## Stacked PRs

- Merging a PR with `--delete-branch` **closes** (does not retarget) PRs based on that branch. Retarget dependents first with `gh pr edit <n> --base main`, or merge the base without deleting its branch.
- After a base PR is squash-merged, update the dependent branch by merging `origin/main`.
- If a stack goes stale while `main` moves a lot, close it with a comment and redo the change on current `main`.

## Shared-resource gotchas

- **Locales:** every agent edits `apps/extension/public/_locales/{en,ja,ko}/messages.json`. `tests/unit/locale-messages.test.ts` requires identical keys and placeholders across locales and that every literal `t('key')` exists. Pass counts and titles as substitutions to `t()`; never post-process `$1`.
- **Auto-imports:** WXT auto-imports `components/**`, `hooks`, `utils`, `lib`, `services`, `stores`, plus `browser`, `storage`, and the `Browser` type. No explicit imports for those and no `index.ts` barrels.
- **Merged-together regressions:** two PRs that each pass CI can still break when combined. After a batch lands, run an exploratory pass (`extension-exploratory-qa` skill) on the combined `main`.
- **Storage keys:** refactors must keep keys and areas identical so user data survives; API keys stay in local storage.

## Running and recovering agents

- Run agents in the background and report to the user as each finishes; do not predict results before a notification arrives.
- Subagents may be blocked from writing report files; have them return findings as text and save them from the orchestrating session.
- If agents stop on a rate limit or session end, inspect each worktree (`git log origin/main..HEAD`, `git status`) and resume the same agent with a message describing its exact state, rather than starting over.
- **Set `NX_DAEMON=false` for every Nx command in a worktree.** The Nx daemon is shared across worktrees, so one agent's `nx run extension:test:e2e` can run another worktree's specs and report the wrong results.
- A local hook rewrites plain `git` to `rtk git`, which fails inside worktrees; call `/usr/bin/git` there.
- Permission prompts mostly come from background agents; allow rules in `.claude/settings.local.json` apply to them too.

## After landing

- Verify the latest CI run on `main` is green, not just the PR checks.
- Summarize per PR: what changed, tests added, verification results, deferred items, and manual checks still needed (Firefox and Edge runtime, live permission prompts, real AI providers).
- Offer to clean up finished worktrees and branches; delete them only with approval.
