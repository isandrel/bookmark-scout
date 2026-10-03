#!/usr/bin/env zsh
# Usage: fix-dependabot-lockfile.sh <pr-number>
# Merge origin/main into a Dependabot Bun PR, regenerate bun.lock and the READMEs, verify, and push.
set -eu
pr=${1:?pr number required}
root=$(/usr/bin/git rev-parse --show-toplevel)
cd "$root"
/usr/bin/git fetch -q origin
branch=$(gh pr view "$pr" --json headRefName --jq .headRefName)
wt="$root/.claude/worktrees/pr$pr"
if [[ ! -d "$wt" ]]; then
  /usr/bin/git worktree add -q -b "fix/pr$pr-lock" "$wt" "origin/$branch"
fi
cd "$wt"
/usr/bin/git merge --abort 2>/dev/null || true
/usr/bin/git reset -q --hard "origin/$branch"
/usr/bin/git merge -q --no-edit origin/main >/dev/null 2>&1 || true
# bun.lock and the generated READMEs are rebuilt below, so their conflicts resolve themselves.
generated='^(bun\.lock|README\.md|translations/README\..*\.md)$'
others=$(/usr/bin/git diff --name-only --diff-filter=U | grep -Ev "$generated" || true)
if [[ -n "$others" ]]; then
  echo "Conflicts outside bun.lock and the READMEs; resolve by hand in $wt:" >&2
  echo "$others" >&2
  exit 1
fi
/usr/bin/git checkout -q --theirs bun.lock README.md translations 2>/dev/null || true
bun install >/dev/null
bun install --frozen-lockfile
# README version badges show each library's installed major version, so a major bump changes them.
bun run generate:readme >/dev/null
/usr/bin/git add bun.lock README.md translations
/usr/bin/git commit -q -m "🔧 chore(deps): refresh bun.lock and READMEs" || true
/usr/bin/git push -q origin "HEAD:$branch"
echo "PR #$pr updated: $(/usr/bin/git log -1 --format=%h). Worktree: $wt"
