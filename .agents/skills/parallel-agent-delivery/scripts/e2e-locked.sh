#!/bin/zsh
# Run extension end-to-end tests in one worktree while holding a machine-wide lock, so parallel
# agents never run browser suites at the same time (runs side by side time out under load and
# report false failures). Every agent must use the same lock for it to help.
#
# usage: zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh <abs-worktree> full
#        zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh <abs-worktree> specs tests/e2e/a.spec.ts [more...]
#        zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh <abs-worktree> firefox [Playwright args...]
#        zsh .agents/skills/parallel-agent-delivery/scripts/e2e-locked.sh <abs-worktree> built chromium|bridge [Playwright args...]
# Logs use XDG_CACHE_HOME (or ~/.cache); the lock is shared per user under /tmp regardless of
# each run's cache directory. Every browser suite on the machine must use this wrapper.
# The exit code is the test run's. A lock left by a dead process is taken over. Nx runs with
# --output-style=static so the log holds Playwright's own output and summary; without it Nx prints
# only its task summary and a "full log:" path.
cache_root=${XDG_CACHE_HOME:-$HOME/.cache}
lock=/tmp/bookmark-scout-e2e-${UID}.lock
logs=$cache_root/bookmark-scout-e2e-logs
wt=$1
mode=$2
shift 2
if [[ -z $wt || -z $mode ]]; then
  echo "usage: e2e-locked.sh <abs-worktree> full|specs <files...>|firefox|built chromium|bridge [Playwright args...]" >&2
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
    bunx nx run extension:test:e2e --skip-nx-cache --output-style=static 2>&1 | tee $log; rc=${pipestatus[1]} ;;
  specs)
    bunx nx run extension:build:chrome --output-style=static > /dev/null || exit 1
    cd apps/extension
    bunx playwright test --config playwright.config.ts --project=chromium --reporter=line "$@" 2>&1 | tee $log; rc=${pipestatus[1]} ;;
  firefox)
    SE_OFFLINE=true bunx nx run extension:test:e2e:firefox --skip-nx-cache --output-style=static -- "$@" 2>&1 | tee $log; rc=${pipestatus[1]} ;;
  built)
    # The caller has built the extension (and native host for bridge) and installed Chromium.
    # Avoid reinstalling host packages on managed runners without root access.
    project=$1
    if [[ $project != chromium && $project != bridge ]]; then
      echo "built mode requires chromium or bridge" >&2
      exit 64
    fi
    shift
    cd apps/extension
    bunx playwright test --config playwright.config.ts --project=$project --reporter=line "$@" 2>&1 | tee $log; rc=${pipestatus[1]} ;;
  *)
    echo "unknown mode: $mode" >&2
    exit 64 ;;
esac
# The case statement resets pipestatus, so each branch saves its test run's status.
exit $rc
