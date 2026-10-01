#!/usr/bin/env zsh
# Usage: merge-queue.sh [skip-pr ...]
# Under the strict up-to-date ruleset, update one BEHIND auto-merge PR at a time
# until no open PRs remain (or 40 rounds pass). Pass PR numbers an agent owns to skip them.
set -u
skip=$(printf '%s\n' "$@" | jq -R 'select(length>0)|tonumber' | jq -s .)
for round in $(seq 1 40); do
  open=$(gh pr list --state open --json number,mergeStateStatus,autoMergeRequest \
    | jq --argjson skip "$skip" '[.[] | select(.autoMergeRequest != null) | select(.number as $n | $skip | index($n) | not)]')
  if [[ $(echo "$open" | jq length) == 0 ]]; then
    echo "queue empty"
    break
  fi
  behind=$(echo "$open" | jq -r '[.[] | select(.mergeStateStatus == "BEHIND")][0].number // empty')
  if [[ -n "$behind" ]]; then
    gh pr update-branch "$behind" >/dev/null 2>&1 && echo "$(date +%H:%M) updated #$behind"
  fi
  echo "$(date +%H:%M) $(echo "$open" | jq -c '[.[] | "\(.number):\(.mergeStateStatus)"]')"
  sleep 180
done
