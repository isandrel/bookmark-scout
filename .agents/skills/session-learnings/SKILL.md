---
name: session-learnings
description: Turn past coding-agent sessions in this repository into reusable, portable lessons - updating existing skills under .agents/skills, adding a new skill, or adding an AGENTS.md rule. Use whenever the user asks to "learn from" or "summarize" recent sessions, capture lessons or session learnings, "update or create skills", document what went wrong so the next agent avoids it, or read recent Claude Code sessions in this repo. Bundles a transcript digest script.
---

# Session learnings

Sessions teach things the code does not record: dead ends, tool limits, user corrections, and checks that caught real bugs. This skill turns them into guidance a future agent can use in a fresh clone on any machine.

## 1. Find the sessions

Claude Code keeps one JSONL transcript per session under `~/.claude/projects/<cwd with / and . replaced by ->/`. Other agent tools keep their own; adapt the digest script if the format differs.

```bash
bun .agents/skills/session-learnings/scripts/session-digest.ts --list
```

Pick the sessions since the last skill update (`git log -1 --format=%cI -- .agents/skills`). Run the script from the main checkout, not a worktree: the transcript folder name comes from the working directory.

## 2. Digest them

Raw transcripts reach tens of megabytes. The digest keeps user prompts, compaction summaries, assistant replies, failed tool calls, and `git`/`gh` commands, which shrinks a 20 MB transcript to about 100 KB:

```bash
mkdir -p ~/.cache/bookmark-scout-session-learnings
bun .agents/skills/session-learnings/scripts/session-digest.ts <session-id> \
  > ~/.cache/bookmark-scout-session-learnings/<session-id>.md
```

Use `--since`/`--until` (ISO timestamps) to cut a long session. Assistant replies are cut at 600 characters, and the richest content often sits in long final reports, so rerun with `--text 20000` around them. Subagent transcripts live in `<session-id>/subagents/agent-*.jsonl`; read each one's `.meta.json` (`description`, `stoppedByUser`, `worktreeBranch`) and digest only those that did notable work or were stopped mid-task. Grep the raw JSONL with a narrow pattern only when a digest line needs more context. Keep digests outside the repository; they contain private conversation.

## 3. Mine against what already exists

Read every `.agents/skills/*/SKILL.md` and the `AGENTS.md` files first. Report only lessons that are new, or that show an existing line is stale or wrong. For more than one large session, run one read-only subagent per session in parallel and give each the same brief: the digest path, the existing-skill paths, the constraints in step 5, and the output shape (lessons grouped by target skill, each with guidance, the reason, and timestamped evidence).

What is worth keeping:
- A mistake and the fix that worked, especially when the first fix was wrong.
- A tool or harness limit that cost time, and the route that worked instead.
- A user correction or stated preference about how work should be done. Standing preferences belong in `AGENTS.md` so every task sees them, not only one skill; the maintainer's main one is that changes be configurable, extensible, customizable, and maintainable (see "Engineering intent" there). Check a new preference against that section and sharpen it with the concrete case rather than adding a near-duplicate.
- A multi-step procedure repeated across sessions (a script candidate).
- A check that caught a real bug that lint, build, or CI missed.

Skip generic advice any engineer knows, one-off incidents unlikely to recur, and anything already in the code or git history.

## 4. Decide where each lesson goes

| Lesson | Destination |
| --- | --- |
| Applies to every task in an app or the repo, fits in one line | That `AGENTS.md` |
| Applies to one kind of task | The matching skill |
| A recurring workflow (seen in two or more sessions) that no skill covers | A new skill |
| A repeated deterministic procedure | A script in the skill's `scripts/` |
| Only true on one person's machine | Nowhere |

Prefer updating a skill over creating one; a new skill must have a distinct trigger. Add every new skill to the "Agent skills" list in the root `AGENTS.md`.

## 5. Keep it portable and private

The repository is public and skills must work for anyone who clones it.

- No personal data: names, usernames, emails, home paths, account or zone IDs, tokens or token permission details, note-vault paths.
- No machine-specific setup: personal shell wrappers or aliases, locally installed proxy servers, launcher scripts, which browsers one machine has. Rephrase to the general case ("a local OpenAI-compatible server", "a shell hook that wraps `git`").
- No hard-coded fork identity: use `gh api 'repos/{owner}/{repo}/...'` and look IDs up by name.
- Put scratch output under `~/.cache/bookmark-scout-*`, never a session scratchpad (it gets wiped) or the repository.
- Tool-specific names (Claude Code, Codex) are fine only as examples of a general mechanism.

Scan before committing, with both the generic patterns and this machine's own identity (add the names of any personal tools you saw in the sessions):

```bash
rg -n -i '/Users/|/home/[a-z]|@(gmail|outlook|icloud)\.|ghp_|sk-[a-z0-9]{8}|api[_-]?key\s*[:=]\s*\S' .agents AGENTS.md apps/*/AGENTS.md
rg -n -F -e "$HOME" -e "$USER" .agents AGENTS.md apps/*/AGENTS.md
```

## 6. Verify every claim against current `main`

Lessons go stale fast. Before writing one, confirm the file paths, script and target names, config keys, and required check names still exist with one targeted command each (`rg`, `ls`, `gh api` for rulesets, a workflow's `paths:`). Drop or reword anything you cannot confirm. Merge and deduplicate the readers' reports first; a lesson seen in two or more sessions is recurring and worth more weight. Keep each fact in one place (for example the required-check list lives only in `repo-maintenance`) and link to it from elsewhere.

## 7. Write it

- Phrase lessons as guidance with the reason, plus the concrete example that taught it ("PR #518 found..."), so a reader can judge edge cases.
- Keep each `SKILL.md` under about 500 lines; move long reference material into `references/` and say when to read it.
- The `description` front matter decides when the skill triggers. Name the user phrases and file areas it covers, and be generous.
- Apply edits with uniqueness-checked replacements (the Edit tool, or a script that asserts each anchor matches exactly once), so a stale anchor fails loudly instead of editing the wrong place.
- Never propose vendor-specific instruction files (`CLAUDE.md` and similar); rules go in `AGENTS.md`, workflows in `.agents/skills/`.
- This is a docs-only change. CI runs only Lint for it (see `.github/ci-scopes.toml`); no extension build or E2E is needed.

## 8. Report

List per skill what was added, changed, or removed; what was deliberately left out and why (personal, machine-specific, seen once and already documented in the repository, unverifiable); and which claims could not be verified. Mention unfinished work the sessions left behind (unpushed branches, stopped agents) so the maintainer can decide on it.
