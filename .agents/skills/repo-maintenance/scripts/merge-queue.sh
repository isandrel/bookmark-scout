#!/usr/bin/env zsh
# Usage: merge-queue.sh [skip-pr ...]
# Under the strict up-to-date ruleset (and with no merge queue on a user-owned repository),
# update only the auto-merge PR next in line, wait until it merges, then update the next, until
# no open PRs remain (or 60 rounds pass). Updating every BEHIND PR at once reruns all of their
# CI after each merge. Pass PR numbers an agent owns to skip them.
set -u
skip=$(printf '%s\n' "$@" | jq -R 'select(length>0)|tonumber' | jq -s .)
current=""
for round in $(seq 1 60); do
  open=$(gh pr list --state open --json number,mergeStateStatus,autoMergeRequest \
    | jq --argjson skip "$skip" '[.[] | select(.autoMergeRequest != null) | select(.number as $n | $skip | index($n) | not)]')
  if [[ $(echo "$open" | jq length) == 0 ]]; then
    echo "queue empty"
    break
  fi
  if [[ -n "$current" ]] && ! echo "$open" | jq -e --argjson n "$current" 'any(.[]; .number == $n)' >/dev/null; then
    echo "$(date +%H:%M) #$current left the queue (merged or closed)"
    current=""
  fi
  if [[ -n "$current" ]]; then
    gh pr checks "$current" >/dev/null 2>&1
    if [[ $? == 1 ]]; then
      # A failing check would hold the queue forever: leave the PR for a fix and move on.
      echo "$(date +%H:%M) #$current has a failing check; fix it, then run this again"
      skip=$(echo "$skip" | jq --argjson n "$current" '. + [$n]')
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
  echo "$(date +%H:%M) next: #${current:-none} $(echo "$open" | jq -c '[.[] | "\(.number):\(.mergeStateStatus)"]')"
  sleep 180
done
