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
| `manager.perf.spec.ts` | `manager.open`, `manager.openFolder`, `manager.filter.*`, `manager.outsideChange` |
| `options.perf.spec.ts` | `options.open`, `options.search.*`, `options.stepper` |

- **open**: from navigation start to the first frame showing the page's content.
- **Actions** (`save`, `expandAll`, `openFolder`, `stepper`, `outsideChange`): from the last key press or click to the first frame showing the result.
- **Search and filter `results`**: from the last key press until the results stop changing, so a prefix that already shows results does not end the measurement early. Debounces count: they are part of what the user waits for.
- **`keystroke`**: the slowest key press, from input to the next paint (Event Timing).
- **`scroll.*`**: mouse-wheel scrolling of the page's main list; frames longer than `long_frame_ms`, the worst frame, and the 95th percentile frame.

An action that does not finish within 60 seconds is reported as timed out, and the rest of that run is skipped: the page may be frozen.

## How it works

`harness.ts` measures from outside the app; the extension carries no measurement code.

- `seedLibrary` creates the library in `perf.toml` (1,530 folders and 19,500 bookmarks by default) in about two seconds.
- Each page opens with the CPU slowed by `cpu_throttle` through the DevTools protocol (`ci_cpu_throttle` when `CI` is set, since runners are already slower).
- An init script records input timestamps, Long Animation Frames, and Event Timing entries, and a `requestAnimationFrame` check finds the first frame that shows the expected result. Only visible elements count: collapsed panels keep their rows in the page.
- Each scenario runs `repeats` times; the report gives the median and the worst run.

Library size, throttling, repeats, scrolling, and budgets are in `perf.toml`. A metric with a
budget fails the run when its median is over it.

## Investigating a slow metric

Open the page in Chrome with the extension loaded, then use the Performance panel (record, act,
stop). React 19 adds Scheduler and Components tracks there. Set the same CPU throttling as
`perf.toml` in the panel's settings to see what the measurement saw.
