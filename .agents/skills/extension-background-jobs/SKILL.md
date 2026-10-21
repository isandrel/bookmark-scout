---
name: extension-background-jobs
description: Add or change a Bookmark Scout background job, a long tool (Check Dead Links, Metadata Fetcher, Refresh Site Icons, AI Folder Reorganization) that the background owns, so it keeps going after its page closes, pauses, resumes, cancels, and picks up after the worker stops or the browser restarts. Use when a tool should run in the background, when adding a job kind or adapter, when touching the job store, coordinator, job commands, the Background tasks UI, or their tests, or when a job hangs, repeats work, or sends a request twice.
---

# Background jobs (Bookmark Scout extension)

A job is a tool run the background owns. Pages send commands and read progress from IndexedDB; the
background does the work in slices. The module headers explain each part in detail:

| Part | File |
| --- | --- |
| Store: jobs, item ledger, commands, in-flight marks, fencing | `src/lib/job-store.ts` |
| Engine: claim, slices, pause/cancel/block, reconcile on wake, watchdog alarm | `src/services/job-coordinator.ts` |
| What each kind does (one table entry per kind) | `src/services/job-adapters.ts` |
| Commands and who may send them | `src/services/job-protocol.ts` |
| Labels, actions, and why a job paused | `src/lib/job-view.ts` |
| Limits (slice size and time, watchdog, retention, page size) | `config/jobs/scheduler.toml` |
| UI: job status, Background tasks, popup line | `JobStatus.tsx`, `TasksDialog.tsx`, `ActiveJobsLine.tsx`, `use-jobs.ts` |
| Tool card and review on saved results | `JobToolEntry` in `ToolsSidebar.tsx`, `createToolRun().review` |
| Reviewed changes applied in parts (`applyChanges`, the `apply` command) | `src/services/reviewed-apply.ts`, `runBatch` in `job-adapters.ts` |

## Make a tool a job

Each step adds one entry; no step adds a special case.

1. **Kind:** add it to `JOB_KINDS` (`job-store.ts`) and its title key to `JOB_TITLE_KEYS` (`job-view.ts`). Use the tool's id as the kind.
2. **Adapter:** add an entry to `JOB_ADAPTERS`:
   - `prepare` reads the scope with `scopeNodes`, and the settings and options now (they are frozen).
   - Each input is one item. Keep inputs small: store what every item shares once, in `options`.
   - `run` checks one item and validates its stored input and options with zod.
   - Flags declare what a slice needs: `readsHtml` gives `tools.readHead`, and `ai` gives `tools.ai`.
   - A kind that requests websites lists each item's addresses in `siteUrls`. Access is checked before each item, so access taken back mid-run pauses the job (`site-access`, whose Resume asks again through `JOB_BLOCK_PERMISSIONS` in `job-view.ts`) instead of counting failures.
3. **Per-item work:** split the tool's scan into a per-item function that takes an `AbortSignal` and throws `RequestAbortedError` when stopped. Examples: `checkDeadLink`, `fetchMetadataItem`, `refreshOrigin`. Keep the old whole-scan function as a loop over the per-item one, so there is one code path.
4. **Tool definition:** add `job: { kind, result(job, results) }` to its `TOOL_DEFINITIONS` entry.
   - `result` turns the saved results into exactly what the tool's review already shows.
   - Apply, undo, and the audited bookmark writer then work as after a scan.
5. **Messages:** add every new message to all locales. A new block reason is a `JOB_BLOCK_CODES` entry plus a key in `JOB_BLOCK_KEYS`.
6. **Tests, docs, and disclosures:** see below.

## Rules the engine relies on

- **Outcomes.** `succeeded` means checked, whatever was found (a dead link is a result). `skipped` means not checkable (not a web link). `failed` means the item could not be checked at all.
- **Stopping.** A stopped item is never a result. Pause and cancel abort the item's signal, and the item stays pending.
- **Blocking.** When the user has to act first, throw `JobBlockedError(code, detail)`. The job pauses with the reason and is never retried on its own. Examples: AI is off, the service is not set up or changed, or a request failed. Resume is the user's answer. Anything else a slice throws (the AI host page gone, a save refused) pauses it too, as `slice-setup`, with nothing counted that was not saved; a job never ends as failed on its own. A tool helper must let errors that are not about the item it reads (a head reader, a store) reach the coordinator instead of reporting them as that item's result.
- **Requests that may cost money.** For an `ai` adapter, every item is marked in flight before it is sent. A stopped worker leaves the mark, so reconcile pauses the job with `uncertain-request` instead of sending the request again. An AI request is not aborted on pause: it is allowed to finish and its answer is saved.
- **Where requests go.** An `ai` job keeps only a digest of its service (`aiDestination`) and stops when the service changes. Never store a key or its settings in options or results.
- **Fencing.** Every commit checks the claim's generation and the item's pending state in one transaction. Never write results outside `commitItem` and `commitItems`.
- **Batching.** Reading work is saved in batches (`commit_batch_items`, `commit_batch_ms` in `config/jobs/scheduler.toml`; always flushed before a slice settles). Work with `unsureAfterStop` is saved item by item. Pages share one subscription to the store and read it at most every `refresh_ms` (`config/ui/jobs.toml`). Per-item commits and per-component reads made a 19,500-link job 3.4x slower; measure with `tests/perf/jobs.perf.spec.ts` (`nx run extension:test:perf`) before and after a change to the engine.
- **Writes.** Scan jobs only read; nothing a job finds is applied without the review. Applying a review goes through `applyReviewedChanges`: up to the `jobsApplyInBackgroundAbove` setting it runs in the page as before, above it the page sends the stored changes (no `check`, which is code) to an `applyChanges` job. That job's `runBatch` applies one slice per call to `applyBookmarkChanges` (`part: { jobId, index, of }`): each part is one undo entry and one Audit History record linked by `jobId` and labelled "(part n of m)". Every change is checked against the live bookmark first, so on Resume after a stop (`uncertain-write`) a change already made is skipped, never repeated. Pause and cancel take effect between parts.
- **DOM.** A service worker has no DOM parser. Firefox's background page has one. Otherwise HTML goes to the AI host page (`withAIHost`, `readHead`), which is opened once per slice.
- **Startup.** `registerJobs()` registers its listeners synchronously in the background's main function. Every wake reconciles first.
- **Turns.** One slice runs at a time. Jobs take turns by slice, the one that waited longest first (`nextRunnable`), so a short job started during a long one runs between its slices instead of after it.

## Tests

- **Unit, fake IndexedDB:** `background-jobs.test.ts` covers the engine, `background-job-adapters.test.ts` the network adapters, and `background-job-ai.test.ts` AI jobs, with the host and service mocked.
  - Simulate a stopped worker through the store: claim with another session, then reset the coordinator.
  - Do not kill a promise.
- **Chromium E2E, `background-jobs.spec.ts`:** a real local server holds each request until the test releases it, so request counts are exact.
  - Stop the worker with CDP `Target.closeTarget` on its target.
  - Restart with `launch(userDataDir, ...)` and the same profile.
  - Name each test with the acceptance IDs it proves (J01...).
- **Firefox smoke, `tests/e2e-firefox/smoke.spec.ts`:** one job per host path: background page parsing, and AI through the frame. A local OpenAI-compatible server stands in for the AI service.
- **Shared mocks:** the mock AI service is `tests/e2e/ai-provider-mock.ts`. Do not copy it.

## Traps already hit

- **Requests come from the worker.** `page.route` does not see them: use `context.route`. Read the worker's console (`extensionWorker.on('console')`), not the page's.
- **The review opens on its own.** A page that started a job, and is still open when the job finishes, opens the review, also after a pause and resume there. A modal hides the sidebar from role queries, so close the review before asserting on the card.
- **Test servers.** Never echo the request path into HTML: CodeQL blocks the PR (reflected XSS). Map known paths instead.
- **Firefox locally.** Every test timing out while setting up `extension` means `selenium-manager` is hung on the network. Run with `SE_OFFLINE=true`.
- **Budgets.** The coordinator and adapters load at background start. Check `tests/e2e/startup-budgets.toml` and `build/distribution-budgets.toml`, and raise them only with a dated reason.

## Disclosures

A new kind usually stores new data in the job store, and may send requests from the background. Before the PR, follow the `privacy-disclosure-sync` skill:

- the Background tasks row and bullet in `store/privacy-disclosures.md` and `store/privacy-policy.md`;
- the docs privacy page and the website privacy messages, in every language;
- the `offscreen` and `alarms` rows when what uses them changes;
- the tool's docs guide, saying it runs in the background.

Keep `.agents/skills/extension-feature-test/references/coverage.md` in step with the tests.
