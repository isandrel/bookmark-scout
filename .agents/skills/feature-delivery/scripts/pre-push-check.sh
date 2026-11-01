#!/usr/bin/env zsh
# Usage: zsh .agents/skills/feature-delivery/scripts/pre-push-check.sh <abs-worktree> [--firefox]
#          [--base <branch>]
# Runs what CI runs on an extension PR, against the branch as it will merge: it stops unless the
# latest origin/main is already merged in (the strict up-to-date ruleset merges a PR only on top
# of main, and two PRs that each pass alone have gone over a size budget together). Then lint,
# types, unit tests, script tests, the distribution size of every browser build, and the full
# Chromium suite (which includes the startup size budgets) under the machine-wide E2E lock;
# `--firefox` adds the Firefox smoke suite. It runs every step and exits non-zero if any failed,
# so one run lists everything to fix. Logs go to ~/.cache/bookmark-scout-pre-push/.
# A layer of a stacked PR (`gh stack`) merges onto the branch below it, so pass that branch as
# `--base`: the check then wants origin/<branch> merged in instead of origin/main.
set -u
wt=${1:?usage: pre-push-check.sh <abs-worktree> [--firefox] [--base <branch>]}
shift
firefox=""
base=main
while (( $# )); do
  case $1 in
    --firefox) firefox=--firefox ;;
    --base) base=${2:?--base needs a branch}; shift ;;
    *) echo "unknown option: $1"; exit 2 ;;
  esac
  shift
done
logs=${XDG_CACHE_HOME:-$HOME/.cache}/bookmark-scout-pre-push
mkdir -p "$logs"
cd "$wt" || exit 1
branch=$(git branch --show-current)
log="$logs/${branch//\//-}"
failed=()

git fetch -q origin
if ! git merge-base --is-ancestor "origin/$base" HEAD; then
  echo "origin/$base is not merged into $branch: run 'git merge origin/$base', resolve, then run this again."
  exit 2
fi

step() {
  local name=$1
  shift
  if "$@" >"$log-$name.log" 2>&1; then
    echo "ok    $name"
  else
    echo "FAIL  $name ($log-$name.log)"
    failed+=("$name")
  fi
}

sizes() {
  local browser
  for browser in chrome firefox edge; do
    (cd apps/extension && bunx wxt zip -b "$browser" >/dev/null && bun scripts/check-distribution-size.ts "$browser") || return 1
  done
}

step checks bunx nx run-many -t lint typecheck test:unit -p extension --output-style=static
step scripts bun test scripts
step sizes sizes
step chromium zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh "$wt" full
[[ $firefox == --firefox ]] && step firefox zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh "$wt" firefox

if (( ${#failed} )); then
  echo "failed: ${failed[*]}"
  exit 1
fi
echo "ready to push"
