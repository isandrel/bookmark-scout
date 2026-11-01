#!/usr/bin/env zsh
# Usage: zsh .agents/skills/feature-delivery/scripts/pre-push-check.sh <abs-worktree> [--firefox]
#          [--base <branch>] [--full] [--specs <tests/e2e/x.spec.ts> ...]
# Runs what fails CI most often on an extension PR, against the branch as it will merge: it stops
# unless the latest origin/main is already merged in (the strict up-to-date ruleset merges a PR
# only on top of main, and two PRs that each pass alone have gone over a size budget together).
# Then lint, types, unit tests, script tests, the distribution size of every browser build, and,
# under the machine-wide E2E lock, the startup size budgets (`startup-code.spec.ts`) plus every
# E2E spec the branch changed and the ones passed with `--specs` (name the specs that cover the
# code you changed). CI runs the whole Chromium, Edge, and Firefox suites in about 10 minutes on
# shards, so the whole local Chromium suite (about 12 minutes, more while another worktree holds
# the lock) runs only with `--full`: use it when a change reaches many surfaces, such as shared UI,
# settings, or config. `--firefox` adds the Firefox smoke suite. It runs every step and exits
# non-zero if any failed, so one run lists everything to fix. Logs go to
# ~/.cache/bookmark-scout-pre-push/. Run one check at a time: a second one waits for the lock.
# A layer of a stacked PR (`gh stack`) merges onto the branch below it, so pass that branch as
# `--base`: the check then wants origin/<branch> merged in instead of origin/main.
set -u
wt=${1:?usage: pre-push-check.sh <abs-worktree> [--firefox] [--base <branch>] [--full] [--specs <spec> ...]}
shift
firefox=""
full=""
base=main
specs=()
while (( $# )); do
  case $1 in
    --firefox) firefox=1 ;;
    --full) full=1 ;;
    --base) base=${2:?--base needs a branch}; shift ;;
    --specs)
      while [[ $# -gt 1 && $2 != --* ]]; do specs+=("$2"); shift; done ;;
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
if [[ -n $full ]]; then
  step chromium zsh .agents/skills/feature-delivery/scripts/e2e-locked.sh "$wt" full
else
  # Spec paths relative to apps/extension, as e2e-locked.sh takes them; changed ones first.
  # Quoted, so (f) splits the output into one path per line; unquoted, zsh kept every changed path
  # in one word, and the dedupe below never matched it.
  changed=(${(f)"$(git diff --name-only --diff-filter=AM "origin/$base...HEAD" -- 'apps/extension/tests/e2e/*.spec.ts' | sed 's|^apps/extension/||')"})
  changed=(${changed:#})
  run=(tests/e2e/startup-code.spec.ts $changed $specs)
  run=(${(u)run})
  echo "      chromium specs: ${run[*]}"
  step chromium zsh .agents/skills/feature-delivery/scripts/e2e-locked.sh "$wt" specs "${run[@]}"
fi
[[ -n $firefox ]] && step firefox zsh .agents/skills/feature-delivery/scripts/e2e-locked.sh "$wt" firefox

if (( ${#failed} )); then
  echo "failed: ${failed[*]}"
  exit 1
fi
echo "ready to push"
