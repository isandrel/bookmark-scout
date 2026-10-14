---
name: extension-performance
description: Measure and improve Bookmark Scout distribution ZIP size, shipped assets, startup code, and runtime latency. Use for extension package-size audits or optimization, WXT Analyze, dependency/asset deduplication, size budget failures, slow page open/search/actions/scrolling, new heavy imports, React Compiler, virtualization, or lazy loading. Covers actual three-browser ZIP budgets, startup budgets, and the tests/perf harness on a 19,500-bookmark library.
---

# Extension performance

Keep distribution size, startup code, and runtime latency separate:

| Guard | What it checks | Where |
| --- | --- | --- |
| `size:check <browser>` after `zip:<browser>` | Actual ZIP bytes, installed raw bytes, and raw JS/CSS/fonts/locales/images/other; validates archive contents against the build | `apps/extension/build/distribution-budgets.toml`; runs in the existing three `Build Extension` CI checks |
| `nx run extension:test:perf` | Latency and scrolling as the user feels them, 4x CPU throttling, median of 5 runs | `apps/extension/tests/perf/` (`README.md`, `harness.ts`, `perf.toml`); nightly `Performance` workflow, not a PR check |
| `tests/e2e/startup-code.spec.ts` | KiB each entry loads before running, AI SDK and page reader kept out of startup, React kept out of the background | `tests/e2e/startup-budgets.toml`; runs in every E2E suite, so it fails PRs |

Read `tests/perf/README.md` for the metrics and how the harness measures from outside the app (the extension carries no measurement code; keep it that way).

## Distribution-size workflow

1. Record the baseline SHA, `packageManager`, installed WXT/Vite/Rolldown versions, Node version, build environment, and exact commands. Use `bun install --frozen-lockfile`; compare identical production settings in isolated worktrees. Package size comes from `dist/`, not `node_modules` or development tools.
2. Analyze with the repository's installed WXT: `bun run --cwd apps/extension build:chrome --analyze`, then `build:edge` and `build:firefox`. WXT 0.21.4 supports `analysis.outputFile`, `open: false`, and `keepArtifacts: true`; an external temporary build-API script can retain separate reports and `stats-*.json` for every browser without changing production options. Run the API through Node, matching the WXT CLI runtime, and confirm emitted file hashes match the normal build. Keep reports outside committed sources and distribution files. Never enable release source maps just to obtain package analysis.
3. Run actual WXT `zip:chrome`, `zip:edge`, and `zip:firefox`, then `bun run --cwd apps/extension size:check <browser>`. The checker verifies archive structure, CRC/content, manifest, and the exact output file set. Report final ZIP bytes separately from uncompressed category bytes, compressed payload, and ZIP overhead. Module graph rendered/gzip estimates identify causes; summing them is not the final ZIP size.
4. Compare total shipped JS across entries/shared/lazy chunks, and retain startup budgets independently. Moving the same code behind `import()` can improve startup while leaving the package unchanged or larger. Background IIFE/UI duplication must be measured; preserve Chrome/Edge MV3 and Firefox MV2 instead of switching all backgrounds to ESM.
5. Change one measured cause per commit, build all three targets, and validate runtime behavior. Lower `build/distribution-budgets.toml` with the measured date and about 3% rounded headroom; category limits are raw bytes. A budget increase needs measurements and a reason. Keep all supported features, browsers, locales, licenses, and user-data validation.

Implementation boundaries already guarded by tests:

- TOML imports use `?bookmark-scout-config` and `build/toml-config.ts`; runtime assembly/schema ownership/freezing stay in `src/lib/config/runtime.ts`. `loader.ts` and `smol-toml` remain for Bun tools but must be absent from production graphs. Preserve null-prototype tables, `__proto__` data keys, signed zero and non-finite values; new unsupported date/time values must fail clearly. Register data plugins in both WXT and Vitest: `WxtVitest()` does not inherit user Vite plugins. `toml-config.test.ts` checks all current files and a real Vite graph.
- Locale descriptions and placeholder examples stay in `public/_locales`; `compactDistributionLocales` processes only copied output after WXT's public copy. All message values, keys and placeholder semantics remain. Never remove languages or translation keys to meet a budget.
- Provider logo aliases come from exact SVG bytes, not provider-name guesses. The same plugin instance supplies runtime aliases and verifies every alias/canonical output before deleting duplicates; keep source SVGs/catalog/licenses. Update WXT's public asset summary when removing output files. `provider-logo-assets.test.ts` and provider-catalog tests cover this contract.
- Fonts serving arbitrary bookmark text retain their multilingual coverage. Display-font reduction needs actual consumer tracing, every localized heading's code points, real font coverage, and before/after rendered fonts and screenshots. The fixed Options title is guarded by `font-coverage.test.ts`; revisit its subset when adding another display consumer.
- Resolve compatible duplicate dependencies selectively. A broad `bun dedupe` may also change unrelated versions; inspect its dry run, frozen install, actual module graph and ZIP delta. `ollama-sdk-contract.test.ts` uses real installed SDKs with HTTP stubs for structured output, streaming/reasoning, tools and errors; this does not establish live Provider compatibility.

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
- **Find what drags code into an entry:** use WXT `--analyze` and its retained per-build module graph before adding analysis tools or source maps. React once reached the background through a toast in a service and hooks living in `lib/`; the fix moved them to `src/hooks/` (now a rule in `apps/extension/AGENTS.md`).
- Heavy code loads on first use from `*.lazy.ts(x)` files; a new lazy library gets a marker string in the spec that survives minification and never appears in our own code.
- The action registry runs in the service worker for the MCP bridge, so anything it imports counts toward `background.js` (see `extension-bookmark-actions`).

## Tried and rejected

- **React Compiler** (October 2026): scroll p95 improved (50 to 33 ms) but 9 Chromium E2E tests failed that pass without it. `t()` reads module-level language state, so cached text stayed in the old language after a switch; TanStack Table mutates its table object in place, so sorting, facet labels, and column widths stopped redrawing. Retry only after a hook-based `t` and `'use no memo'` on the table components, or in annotation mode on specific components. Its setup: `@rolldown/plugin-babel` with the compiler preset; `@babel/core` 8 rewrote about 3,000 lines of `bun.lock` against 9 on 7, so check the lockfile diff of any build-tool major.
- **Base UI tuning for long lists:** `batch: true` does not batch `getAnimations()`, and `BASE_UI_ANIMATIONS_DISABLED` is an internal test switch. The fix was a flat virtualized list (`extension-ui-change`, Base UI notes).
- A rejected trial that added dependencies must revert `package.json` and `bun.lock` and reinstall before its worktree is reused.

## Open

`options.search.keystroke` is 200 to 350 ms per key and has no budget until it is fixed.
