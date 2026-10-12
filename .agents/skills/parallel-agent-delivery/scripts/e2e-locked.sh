#!/bin/zsh
# Run extension end-to-end tests in one worktree while holding a machine-wide lock, so parallel
# agents never run browser suites at the same time (runs side by side time out under load and
# report false failures). Every agent must use the same lock for it to help.
#
# usage: zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh <abs-worktree> full
#        zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh <abs-worktree> specs tests/e2e/a.spec.ts [more...]
#        zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh <abs-worktree> firefox
# The output is also written to ~/.cache/bookmark-scout-e2e-logs/<worktree-name>.log.
# The exit code is the test run's. A lock left by a dead process is taken over.
lock=~/.cache/bookmark-scout-e2e.lock
logs=~/.cache/bookmark-scout-e2e-logs
wt=$1
mode=$2
shift 2
if [[ -z $wt || -z $mode ]]; then
  echo "usage: e2e-locked.sh <abs-worktree> full|specs <files...>|firefox" >&2
  exit 64
fi
mkdir -p $logs
log=$logs/${wt:t}.log
while ! mkdir $lock 2>/dev/null; do
  holder=$(cat $lock/pid 2>/dev/null)
  if [[ -n $holder ]] && ! kill -0 $holder 2>/dev/null; then
    rm -rf $lock
    continue
  fi
  echo "waiting for the E2E lock held by ${holder:-unknown} ($(cat $lock/worktree 2>/dev/null))"
  sleep 20
done
echo $$ > $lock/pid
echo $wt > $lock/worktree
trap 'rm -rf $lock' EXIT INT TERM
cd $wt || exit 1
export NX_DAEMON=false PW_WORKERS=${PW_WORKERS:-2} NO_COLOR=1
case $mode in
  full)
    bunx nx run extension:test:e2e --skip-nx-cache 2>&1 | tee $log ;;
  specs)
    bunx nx run extension:build:chrome > /dev/null || exit 1
    cd apps/extension
    bunx playwright test --config playwright.config.ts --project=chromium --reporter=line "$@" 2>&1 | tee $log ;;
  firefox)
    SE_OFFLINE=true bunx nx run extension:test:e2e:firefox --skip-nx-cache 2>&1 | tee $log ;;
  *)
    echo "unknown mode: $mode" >&2
    exit 64 ;;
esac
exit ${pipestatus[1]}
