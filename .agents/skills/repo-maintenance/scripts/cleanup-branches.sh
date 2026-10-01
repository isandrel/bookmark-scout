#!/usr/bin/env zsh
# Usage: cleanup-branches.sh [--apply] [--include-no-pr]
# Dry run by default. Deletes worktrees, local and remote branches whose PR is merged or closed.
set -u
apply=false; include_no_pr=false
for arg in "$@"; do
  case $arg in
    --apply) apply=true ;;
    --include-no-pr) include_no_pr=true ;;
  esac
done
root=$(/usr/bin/git rev-parse --show-toplevel)
cd "$root"
/usr/bin/git fetch -q --prune origin
backup=~/.cache/bookmark-scout-branch-backup-$(date +%Y%m%d-%H%M).txt
mkdir -p ~/.cache
/usr/bin/git for-each-ref --format='%(objectname) %(refname)' refs/heads refs/remotes/origin > "$backup"
echo "ref backup: $backup"

typeset -A pr_state
while read -r head state; do
  [[ -z ${pr_state[$head]:-} || $state == OPEN ]] && pr_state[$head]=$state
done < <(gh pr list --state all --limit 500 --json headRefName,state --jq '.[] | "\(.headRefName) \(.state)"')

keep="^(main|HEAD|origin${KEEP_EXTRA:+|$KEEP_EXTRA})$"
run() { if $apply; then "$@"; else echo "would run: $*"; fi; }

# Worktrees: remove clean ones whose branch is not kept.
/usr/bin/git worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{sub("refs/heads/","",$2); print w" "$2}' \
  | grep '/.claude/worktrees/' | while read -r wt br; do
    if [[ ${pr_state[$br]:-} == OPEN ]] || [[ $br =~ $keep ]]; then continue; fi
    /usr/bin/git -C "$wt" checkout -q -- apps/website/next-env.d.ts 2>/dev/null || true
    if [[ -n $(/usr/bin/git -C "$wt" status --porcelain) ]]; then
      echo "keep dirty worktree: $wt ($br)"; continue
    fi
    run /usr/bin/git worktree remove "$wt"
  done
$apply && /usr/bin/git worktree prune
in_worktree=$(/usr/bin/git worktree list --porcelain | awk '/^branch /{sub("refs/heads/","",$2); print $2}')

# Local branches.
for br in $(/usr/bin/git branch --format='%(refname:short)'); do
  [[ $br =~ $keep ]] && continue
  echo "$in_worktree" | grep -qx "$br" && { echo "keep (checked out): $br"; continue; }
  state=${pr_state[$br]:-NONE}
  case $state in
    MERGED|CLOSED) run /usr/bin/git branch -q -D "$br" ;;
    OPEN) ;;
    NONE)
      if [[ $br == worktree-agent-* ]] || $include_no_pr; then run /usr/bin/git branch -q -D "$br"
      else echo "no PR, review by hand: $br"; fi ;;
  esac
done

# Remote branches.
for br in $(/usr/bin/git branch -r --format='%(refname:short)' | sed -n 's|^origin/||p'); do
  [[ $br =~ $keep ]] && continue
  case ${pr_state[$br]:-NONE} in
    MERGED|CLOSED) run /usr/bin/git push -q origin --delete "$br" ;;
    NONE) echo "remote branch without PR, review by hand: $br" ;;
  esac
done
