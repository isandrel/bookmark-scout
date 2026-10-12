---
name: extension-performance
description: Measure and improve how fast the Bookmark Scout extension feels - page open, search, actions, scrolling, and the JavaScript each page and the background load at startup - with the tests/perf harness on a 19,500-bookmark library, CPU profiles, before-and-after comparisons, latency budgets in perf.toml, and startup size budgets in startup-budgets.toml. Use when the user says something is slow, laggy, or freezes, asks to optimize or profile, when a startup-code or perf budget fails in CI, when adding an extension page or a heavy import, or when considering React Compiler, virtualization, or lazy loading.
---

# Extension performance

Two guards, both Chromium-only:

| Guard | What it checks | Where |
| --- | --- | --- |
| `nx run extension:test:perf` | Latency and scrolling as the user feels them, 4x CPU throttling, median of 5 runs | `apps/extension/tests/perf/` (`README.md`, `harness.ts`, `perf.toml`); nightly `Performance` workflow, not a PR check |
| `tests/e2e/startup-code.spec.ts` | KiB each entry loads before running, AI SDK and page reader kept out of startup, React kept out of the background | `tests/e2e/startup-budgets.toml`; runs in every E2E suite, so it fails PRs |

Read `tests/perf/README.md` for the metrics and how the harness measures from outside the app (the extension carries no measurement code; keep it that way).

## Workflow

1. **Measure first.** Land or reuse a scenario that reproduces the slow path before changing code (PR #608 built the harness before any fix). One fix per PR, each with a before-and-after table in its description.
2. **Find the cause with a CPU profile**, not by guessing. A throwaway spec (`tests/perf/profile-tmp.perf.spec.ts`) reuses `seedLibrary` and `openMeasured`, then runs CDP `Profiler.enable`, `setSamplingInterval` (100 µs), `Profiler.start`, the action, `Profiler.stop`, and sums self time per function. Build unminified (`build: { minify: false }` in `wxt.config.ts`) for readable names. Delete the spec and revert the config before committing. Profiles found every large win so far: 80% of expand-all in `Element.getAnimations()` (#609), and `getTree`, re-flattening, and re-sorting on every bookmark event (#611). For interactive digging, the Chrome Performance panel with the same CPU throttling shows React's Scheduler and Components tracks.
3. **Compare back to back on one machine.** Commit, then alternate `git checkout --detach <base>` and your branch in the same worktree, running the perf target at least twice per side. Each run overwrites `test-results/perf/<scenario>.json`; copy it to `~/.cache/bookmark-scout-<topic>/` with a label first. Run nothing else heavy meanwhile: the same branch read `popup.open` as 195, 289, then 194 ms with other agents' builds running. Treat changes under about 10% as noise unless they hold across reruns; single-run spikes do not count, medians do.
4. **Budgets:** a metric gets a budget in `perf.toml` with its fix, at about 2.5x the local median (CI runners are slower). When a fix lands, lower the budget in the same PR with a dated comment.
5. **Run the full E2E suite** before keeping any build-wide transform, however good the numbers look (see React Compiler below).

## Writing scenarios

- Count only visible elements: collapsed panels keep their rows in the page. Match text inside the expected region, since the folder tree repeats folder names.
- A virtualized list never renders every row, so a "count the rows" completion check never finishes. Wait for a state change instead (#609 waits for the button to read "Collapse all subfolders").
- All extension pages share one renderer process, so a frozen popup freezes every other extension page. Give a scenario that can freeze its own `test()` with a short `test.setTimeout`; the harness bounds each wait at 60 s and crashes a page whose `close()` hangs. After a timeout, stop measuring that page.

## Startup size budgets

- Every entrypoint needs an `[eager_kib]` line or the spec fails; set it about 12% above the measured size with a dated comment (`agent-approval.html`: 615 measured, 690 budget). To read an entry's current size, lower its budget locally and read "Received".
- Raise a budget only with a dated comment giving the measured size and reason. Parallel PRs eat the same headroom: one PR left `options.html` exactly at its budget and the next PR, after merging `main`, failed CI at 1 KiB over (#648). Rerun the spec after every merge of `main`; it takes about a second after a build.
- Compare totals, not chunks: #610 moved shared code into the `theme` chunk, which grew while every page shrank by about 46 KiB.
- **Find what drags code into an entry:** build with `build: { sourcemap: true }` under `vite` in `wxt.config.ts`, list the sources (`bunx source-map-explorer@2.5.3 background.js background.js.map --json`), then revert the config. React once reached the background through a toast in a service and hooks living in `lib/`; the fix moved them to `src/hooks/` (now a rule in `apps/extension/AGENTS.md`).
- Heavy code loads on first use from `*.lazy.ts(x)` files; a new lazy library gets a marker string in the spec that survives minification and never appears in our own code.
- The action registry runs in the service worker for the MCP bridge, so anything it imports counts toward `background.js` (see `extension-bookmark-actions`).

## Tried and rejected

- **React Compiler** (October 2026): scroll p95 improved (50 to 33 ms) but 9 Chromium E2E tests failed that pass without it. `t()` reads module-level language state, so cached text stayed in the old language after a switch; TanStack Table mutates its table object in place, so sorting, facet labels, and column widths stopped redrawing. Retry only after a hook-based `t` and `'use no memo'` on the table components, or in annotation mode on specific components. Its setup: `@rolldown/plugin-babel` with the compiler preset; `@babel/core` 8 rewrote about 3,000 lines of `bun.lock` against 9 on 7, so check the lockfile diff of any build-tool major.
- **Base UI tuning for long lists:** `batch: true` does not batch `getAnimations()`, and `BASE_UI_ANIMATIONS_DISABLED` is an internal test switch. The fix was a flat virtualized list (`extension-ui-change`, Base UI notes).
- A rejected trial that added dependencies must revert `package.json` and `bun.lock` and reinstall before its worktree is reused.

## Open

`options.search.keystroke` is 200 to 350 ms per key and has no budget until it is fixed.
