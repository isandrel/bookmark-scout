# Performance measurements

Latency and scrolling of the built Chrome extension on a large synthetic library, measured the way
a user feels them: how long a page takes to show its content, how long an action takes to show
its result, and whether scrolling stutters. Bundle size matters only where it slows these down.

```bash
bunx nx run extension:test:perf
```

The target builds Chrome first. Results print as a table and are written to
`test-results/perf/<scenario>.json`. A metric with a budget fails the run when its median is over
it; these absolute budgets hold on one machine (a developer laptop), not across CI runners. The
`Performance` workflow instead compares head with a base commit on the same runner
([Base against head](#base-against-head)), nightly and on demand, and keeps its reports for 30
days. It is not a pull request check.

## What is measured

| Scenario | Metrics |
| --- | --- |
| `popup.perf.spec.ts` | `popup.open`, `popup.search.results`, `popup.search.keystroke`, `popup.save`, `popup.expandAll`, `popup.scroll.*` |
| `manager.perf.spec.ts` | `manager.open`, `manager.openFolder`, `manager.filter.*`, `manager.outsideChange`; `manager.cards.toCards`, `manager.cards.toList`, `manager.cards.rendered`, `manager.cards.scroll.*` (V26): a full page of search results at the largest page size switched to cards, scrolled, and back; `manager.list.covers.rendered`, `manager.list.covers.scroll.*`: the same page in the list with the Cover column shown and a stored cover on every row, scrolled |
| `options.perf.spec.ts` | `options.open`, `options.search.*`, `options.stepper` |
| `jobs.perf.spec.ts` | `jobs.accept`, `jobs.pause`, `jobs.managerOpenWhileRunning`, `jobs.total`, `jobs.linksPerSecond`, `jobs.reviewOpen`, `jobs.storageKiB`: Check Dead Links over the whole library against a local server that answers at once (`[jobs]` in `perf.toml`), so the cost per link is the extension's own |
| `search.perf.spec.ts` | `search.firstQuery`, `search.query.<name>`, `search.heapKiB` (U37): the `[search]` queries in the manager's search box until the results settle, and the heap the popup's search keeps after running them; `pageText.*` (S36): the same with `[page_text]`'s corpus stored in the page text index |
| `rules.perf.spec.ts` | `rules.review`, `rules.reviewRows`, `rules.heapKiB`, `rules.scroll.*` (R17): the `[rules]` dry run from the Tools sidebar over the whole library, from Run to the review's first row, the rows the virtualized review draws, and scrolling it |

- **open**: from navigation start to the first frame showing the page's content.
- **Actions** (`save`, `expandAll`, `openFolder`, `stepper`, `outsideChange`): from the last key press or click to the first frame showing the result.
- **Search and filter `results`**: from the last key press until the results stop changing, so a prefix that already shows results does not end the measurement early. Debounces count: they are part of what the user waits for.
- **`keystroke`**: the slowest key press, from input to the next paint (Event Timing).
- **`scroll.*`**: mouse-wheel scrolling of the page's main list; frames longer than `long_frame_ms`, the worst frame, and the 95th percentile frame.
- **`heapKiB`**: the JavaScript heap a page keeps for a feature, after a full garbage collection before and after it (`measureHeap`). All extension pages share one renderer, so a scenario measures with only that page open.
- **Counts** (`rendered`, `reviewRows`, `pages`): what the page drew or stored, to show a long list draws only what is on screen.

An action that does not finish within 60 seconds is reported as timed out, and the rest of that run is skipped: the page may be frozen.

## How it works

`harness.ts` measures from outside the app; the extension carries no measurement code.

- `seedLibrary` creates the library in `perf.toml` (1,530 folders and 19,500 bookmarks by default) in about two seconds.
- Each page opens with the CPU slowed by `cpu_throttle` through the DevTools protocol (`ci_cpu_throttle` when `CI` is set, since runners are already slower).
- An init script records input timestamps, Long Animation Frames, and Event Timing entries, and a `requestAnimationFrame` check finds the first frame that shows the expected result. Only visible elements count: collapsed panels keep their rows in the page.
- Each scenario runs `repeats` times; the report gives the median and the worst run.

Library size, throttling, repeats, scrolling, the search queries, the page text corpus, the Smart
Rules, budgets, and the comparison thresholds are in `perf.toml` (`perf-config.ts` reads it).

## Base against head

```bash
bunx nx run extension:test:perf:compare -- --base <commit, tag, or branch> [--grep <pattern>]
```

GitHub's shared runners differ in speed by more than most regressions: one commit measured 1.3
to 1.7x slower on a slow runner than on a fast one (October 2026), enough to fail `manager.open`
and `jobs.reviewOpen` with no change to the code, and a CPU throttle calibrated by a JavaScript
benchmark did not even it out, because those runners also draw frames slower. So CI compares
instead of holding absolute numbers, as benchmark runners for noisy machines do
([Tachometer](https://github.com/google/tachometer),
[Bencher](https://bencher.dev/docs/how-to/track-benchmarks)):

- `compare.ts` builds the base commit in a detached worktree under
  `~/.cache/bookmark-scout-perf-base/` (removed afterwards; `[compare] default_base` when no
  `--base` is given), then runs every scenario for base and head in turn, `[compare] rounds`
  times (`rounds_by_file` for a scenario that takes one sample per run), each in a fresh browser,
  alternating which goes first so a runner that slows down favors neither. Both sides run
  head's scenarios and harness, so the measuring code is the same; a base scenario that fails
  (head changed what it waits for) leaves its metrics uncompared.
- `compare-results.ts` pools each side's samples and fails a budgeted metric only when head's
  median is over `max_ratio` times base's, over it by more than `min_delta` for the metric's unit,
  and, when both sides have `min_samples` or more samples, a one-sided Wilcoxon rank-sum
  (Mann-Whitney U) test gives a p-value of at most `max_p_value`. A head that timed out where
  base did not also fails, and so does a head scenario that fails.
- The table prints both sides' absolute medians and sample counts, the change, the p-value, and
  the budget (marked `over` when head's median is over it, which alone does not fail). It is also
  written to the job summary and to `test-results/perf-compare/` (`summary.md`,
  `comparison.json`, and each side's scenario reports).

The workflow's base is the commit of the last successful Performance run on `main`, so a
regression keeps failing until it is fixed; to accept one on purpose, run the workflow by hand on
`main` with `base` set to the current commit. On another branch the base is `main`. Locally,
run the comparison through the machine-wide lock (`e2e-locked.sh <worktree> perf-compare`) with
nothing else heavy running.

## Investigating a slow metric

Open the page in Chrome with the extension loaded, then use the Performance panel (record, act,
stop). React 19 adds Scheduler and Components tracks there. Set the same CPU throttling as
`perf.toml` in the panel's settings to see what the measurement saw.
