#!/bin/zsh
# Wait for one pull request to merge. Run it with the agent tool's background mode: the worktree
# command guard refuses an inline `until` loop, and a foreground wait hits the tool timeout.
#
# usage: zsh .agents/skills/parallel-agent-delivery/scripts/wait-pr.sh <pr-number> [max-minutes]
# exit:  0 merged, 2 closed without merging, 3 BEHIND or DIRTY (update or merge origin/main),
#        4 a check failed (failing checks are printed), 5 still open after max-minutes.
# Run it from inside the repository checkout; gh takes the repository from the git remote.
pr=$1
max_minutes=${2:-360}
deadline=$(( $(date +%s) + max_minutes * 60 ))
while (( $(date +%s) < deadline )); do
  s=$(gh pr view "$pr" --json state,mergeStateStatus --jq '.state + " " + .mergeStateStatus' 2>/dev/null)
  case $s in
    MERGED*) echo "PR $pr merged"; exit 0 ;;
    CLOSED*) echo "PR $pr closed without merging"; exit 2 ;;
    *BEHIND*|*DIRTY*) echo "PR $pr is $s"; exit 3 ;;
  esac
  failing=$(gh pr checks "$pr" 2>/dev/null | grep -E $'\tfail\t')
  if [[ -n $failing ]]; then
    echo "PR $pr has failing checks:"
    echo "$failing"
    exit 4
  fi
  sleep 45
done
echo "PR $pr still open after $max_minutes minutes"
exit 5
