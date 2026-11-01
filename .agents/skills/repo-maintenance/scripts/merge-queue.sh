#!/usr/bin/env zsh
# Usage: merge-queue.sh [skip-pr ...]
# Under the strict up-to-date ruleset (and with no merge queue on a user-owned repository),
# update only the auto-merge PR next in line, wait until it merges, then update the next, until
# no open PRs remain (or 60 rounds pass). Updating every BEHIND PR at once reruns all of their
# CI after each merge. Pass PR numbers an agent owns to skip them.
set -u
skip=$(printf '%s\n' "$@" | jq -R 'select(length>0)|tonumber' | jq -s .)
# PRs set aside for a failing check. Each comes back once its checks stop failing (a fix pushed,
# or a rerun passed), so the queue never needs a restart after a fix.
held='[]'
current=""

# How many of a PR's checks failed. Only `fail` counts: a run cancelled because the branch was
# updated (`cancel`) is replaced by the new run, and counting it once stalled a green PR.
failing() {
  gh pr checks "$1" --json bucket --jq '[.[] | select(.bucket == "fail")] | length' 2>/dev/null || echo 0
}

for round in $(seq 1 60); do
  all=$(gh pr list --state open --json number,mergeStateStatus,autoMergeRequest \
    | jq --argjson skip "$skip" '[.[] | select(.autoMergeRequest != null) | select(.number as $n | $skip | index($n) | not)]')
  for n in $(echo "$held" | jq -r '.[]'); do
    if ! echo "$all" | jq -e --argjson n "$n" 'any(.[]; .number == $n)' >/dev/null || [[ $(failing "$n") == 0 ]]; then
      held=$(echo "$held" | jq --argjson n "$n" 'map(select(. != $n))')
      echo "$(date +%H:%M) #$n back in the queue"
    fi
  done
  open=$(echo "$all" | jq --argjson held "$held" '[.[] | select(.number as $n | $held | index($n) | not)]')
  if [[ $(echo "$all" | jq length) == 0 ]]; then
    echo "queue empty"
    break
  fi
  if [[ -n "$current" ]] && ! echo "$all" | jq -e --argjson n "$current" 'any(.[]; .number == $n)' >/dev/null; then
    echo "$(date +%H:%M) #$current left the queue (merged or closed)"
    current=""
  fi
  if [[ -n "$current" ]]; then
    if [[ $(failing "$current") != 0 ]]; then
      # A failing check would hold the queue forever: set the PR aside until its checks pass.
      echo "$(date +%H:%M) #$current has a failing check; held until it passes"
      held=$(echo "$held" | jq --argjson n "$current" '. + [$n]')
      open=$(echo "$open" | jq --argjson n "$current" 'map(select(.number != $n))')
      current=""
    elif [[ $(echo "$open" | jq -r --argjson n "$current" '.[] | select(.number == $n) | .mergeStateStatus') == "BEHIND" ]]; then
      gh pr update-branch "$current" >/dev/null 2>&1 && echo "$(date +%H:%M) updated #$current again"
    fi
  fi
  if [[ -z "$current" ]]; then
    # A PR that is already up to date is next in line; otherwise update the first BEHIND one.
    current=$(echo "$open" | jq -r '[.[] | select(.mergeStateStatus != "BEHIND" and .mergeStateStatus != "DIRTY")][0].number // empty')
    if [[ -z "$current" ]]; then
      current=$(echo "$open" | jq -r '[.[] | select(.mergeStateStatus == "BEHIND")][0].number // empty')
      [[ -n "$current" ]] && gh pr update-branch "$current" >/dev/null 2>&1 && echo "$(date +%H:%M) updated #$current"
    fi
  fi
  echo "$(date +%H:%M) next: #${current:-none} held: $(echo "$held" | jq -c .) $(echo "$open" | jq -c '[.[] | "\(.number):\(.mergeStateStatus)"]')"
  sleep 180
done
