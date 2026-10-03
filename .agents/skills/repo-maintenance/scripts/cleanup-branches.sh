#!/usr/bin/env zsh
# Usage: cleanup-branches.sh [--apply] [--include-no-pr] [--bundle-unpushed]
# Dry run by default. Deletes worktrees, local and remote branches whose PR is merged or closed.
# Branches with commits that exist on no remote are kept unless --bundle-unpushed is passed, which
# saves each one to a git bundle under ~/.cache first.
set -u
apply=false; include_no_pr=false; bundle_unpushed=false
for arg in "$@"; do
  case $arg in
    --apply) apply=true ;;
    --include-no-pr) include_no_pr=true ;;
    --bundle-unpushed) bundle_unpushed=true ;;
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
# Commits on a branch that no remote branch contains: an agent's unpushed work.
unpushed() { /usr/bin/git rev-list --count "$1" --not --remotes 2>/dev/null || echo 0; }
typeset -A bundled
# Returns 0 when the branch may go: nothing unpushed, or bundled first (once per branch).
safe_to_drop() {
  local br=$1 n
  [[ -n ${bundled[$br]:-} ]] && return 0
  n=$(unpushed "$br")
  (( n == 0 )) && return 0
  if ! $bundle_unpushed; then
    echo "keep (unpushed: $n commit(s)): $br"; return 1
  fi
  local file=~/.cache/bookmark-scout-unpushed-${br//\//-}-$(date +%Y%m%d-%H%M).bundle
  run /usr/bin/git bundle create -q "$file" "$br" --not --remotes
  $apply && echo "bundled $n unpushed commit(s) of $br to $file"
  bundled[$br]=$file
}

# Worktrees: remove clean ones whose branch is not kept. Locked ones belong to an agent that may
# still be running; they are reported, never forced.
/usr/bin/git worktree list --porcelain | awk 'BEGIN{RS=""} {w=""; b=""; l=0
    for (i=1;i<=NF;i++) { if ($i=="worktree") w=$(i+1); if ($i=="branch") { b=$(i+1); sub("refs/heads/","",b) }; if ($i=="locked") l=1 }
    if (b!="") print w" "b" "l }' \
  | grep '/.claude/worktrees/' | while read -r wt br locked; do
    if [[ ${pr_state[$br]:-} == OPEN ]] || [[ $br =~ $keep ]]; then continue; fi
    if [[ $locked == 1 ]]; then
      echo "keep locked worktree (unlock with 'git worktree unlock' once its agent has finished): $wt ($br)"; continue
    fi
    safe_to_drop "$br" || continue
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
  [[ $state == OPEN ]] || safe_to_drop "$br" || continue
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
