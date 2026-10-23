# Search engines: built-in versus MiniSearch and FlexSearch

Decision (2026-10-22): **keep the built-in search** (`src/lib/search-query.ts`, `src/lib/search-documents.ts`, `src/lib/bookmark-query-filter.lazy.ts`). Neither library is shipped. Revisit only when a measured search in the browser misses its `perf.toml` budget and profiling shows the per-document match loop, not rendering, is the cause.

## How it was measured

`apps/extension/tests/bench/search-engines.bench.ts`, run with `bun run --cwd apps/extension bench:search` (Vitest with the unit tests' plugins, through `tests/bench/vitest.config.ts`, never part of the unit run). MiniSearch and FlexSearch are `devDependencies` of the extension workspace only; no `src/` file imports them, so the built packages and the size budgets are unchanged.

- Library: the performance suite's `[library]` in `tests/perf/perf.toml` (30 areas, 50 topics each, 13 pages each: 19,500 bookmarks in 1,530 folders, 21,030 items), built in memory with the names `seedLibrary` gives it, no tags or summaries.
- Built-in: `buildSearchDocuments` plus `foldSearchDocument` for each document (what `prepareSearchDocuments` does while idle before the first keystroke), then `searchDocuments(parseSearchQuery(text).query)`.
- MiniSearch 7.2.0: fields `title`, `url`, `folderPath`, `host`; `prefix: true`, `combineWith: 'AND'`.
- FlexSearch 0.8.212: `Document` over the same fields, `tokenize: 'forward'`, `merge: true`, limit above the library size.
- Build: median of 5 builds, each on a fresh copy of the tree (the built-in search caches a document per node object). Query: median of 30 runs. Heap: `heapUsed` kept by the built index after a full collection.
- Machine: Apple M4 Max, Node 26.12, no CPU throttling (the `perf.toml` scenarios throttle 4x; multiply roughly by four for a mid-range laptop).

## Results (2026-10-22)

| Engine | Build (ms) | Heap kept (MB) | `Page 15-3-7` | `Topic 12` | `example.com/15/3` | `pag 29-49` | `nowhere` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Built-in | 42.5 | 20.6 | 5.63 ms | 8.05 ms | 2.22 ms | 5.84 ms | 2.13 ms |
| MiniSearch | 112.2 | 24.5 | 13.5 ms | 9.08 ms | 25.68 ms | 6.87 ms | 0 ms |
| FlexSearch | 196.8 | 3.0 | 0.84 ms | 1.69 ms | 1.07 ms | 0.47 ms | 0 ms |

Results found, which differ because the engines read words differently:

| Engine | `Page 15-3-7` | `Topic 12` | `example.com/15/3` | `pag 29-49` | `nowhere` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Built-in | 1 | 2,527 | 143 | 13 | 0 |
| MiniSearch | 14 | 2,527 | 223 | 13 | 0 |
| FlexSearch | 14 | 1,106 | 223 | 13 | 0 |

Shipped cost if adopted (the package's ES module, `bun build --minify --target browser`, then `gzip -9`): MiniSearch 18.1 KB raw, 6.0 KB gzipped; FlexSearch 51.1 KB raw, 17.5 KB gzipped.

## Why the built-in search stays

1. **Fast enough where it runs.** Every query above takes at most about 8 ms unthrottled, inside one frame, and the in-browser numbers are tracked by `search.perf.spec.ts` against `perf.toml` budgets. FlexSearch is faster per query, but builds its index almost five times slower (about 200 ms, 800 ms at 4x throttling), which a popup pays on every open, and the built-in search reuses each node's document after a change instead of reindexing.
2. **Different answers.** Both libraries split text into tokens: `Page 15-3-7` found 14 pages (every page with the tokens 15, 3, and 7), where the built-in search finds the one page whose title holds the text, and `example.com/15/3` found 223 against 143. Matching what users type as a substring, with highlight ranges and the "in URL" or "tag:" reasons, would need the built-in matcher on top of a library's candidates anyway.
3. **The query language.** `tag:`, `folder:`, `domain:`, `-` exclusions, `OR` and parentheses, `is:`, `has:`, `after:` and `before:`, and `content:` over indexed page text are evaluated per document by `search-documents.ts`; a library would only shortlist plain words.
4. **Languages.** Tokenizers that split on spaces do not find a word inside Chinese or Japanese text without an extra encoder per language (FlexSearch's CJK charset, a custom MiniSearch tokenizer), while substring matching does.
5. **Cost.** 6 to 17.5 KB gzipped more in every page that searches, and a second index to keep in step with bookmark changes, tags, summaries, and page text.

Memory is the one place a library wins clearly (FlexSearch keeps about 3 MB against 20.6 MB). If the popup's search heap ever becomes the problem, shrink the built-in documents first (the folded copies and per-document folder arrays), and measure with `search.perf.spec.ts`, which reports the heap the popup's search keeps.
