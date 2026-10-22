# Performance measurements

Latency and scrolling of the built Chrome extension on a large synthetic library, measured the way
a user feels them: how long a page takes to show its content, how long an action takes to show
its result, and whether scrolling stutters. Bundle size matters only where it slows these down.

```bash
bunx nx run extension:test:perf
```

The target builds Chrome first. Results print as a table and are written to
`test-results/perf/<scenario>.json`. The `Performance` workflow runs it nightly and on demand and
keeps the JSON for 30 days; it is not a pull request check, because timings vary between runners.

## What is measured

| Scenario | Metrics |
| --- | --- |
| `popup.perf.spec.ts` | `popup.open`, `popup.search.results`, `popup.search.keystroke`, `popup.save`, `popup.expandAll`, `popup.scroll.*` |
| `manager.perf.spec.ts` | `manager.open`, `manager.openFolder`, `manager.filter.*`, `manager.outsideChange`; `manager.cards.toCards`, `manager.cards.toList`, `manager.cards.rendered`, `manager.cards.scroll.*` (V26): a full page of search results at the largest page size switched to cards, scrolled, and back |
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
Rules, and budgets are in `perf.toml`. A metric with a budget fails the run when its median is
over it.

## Investigating a slow metric

Open the page in Chrome with the extension loaded, then use the Performance panel (record, act,
stop). React 19 adds Scheduler and Components tracks there. Set the same CPU throttling as
`perf.toml` in the panel's settings to see what the measurement saw.
