# Live AI tests

End-to-end tests of the extension's AI features against a real OpenAI-compatible provider, in a
fresh Chromium profile with the built Chrome extension, a synthetic bookmark library, and local
test pages (no external site is visited). They complement the `[mocked provider contract]` tests in
`tests/e2e/`, which use stubbed providers: these show that a real model works with the extension.

```bash
bunx nx run extension:test:live
```

The target builds Chrome first. Without the variables below every test is skipped with a message
naming the missing ones, and the run passes. It is not a pull request check.

## What is covered

| Test | Checks |
| --- | --- |
| Verify Service | Options verifies the service and finds the model |
| Popup folder suggestions | Suggestions name real folders; the page is saved to the first one |
| AI quick save | The shortcut saves the page, the notification names the folder, Undo removes it |
| Ask AI | An answer from bookmark tools, a suggested next question when offered, a move only after the user approves the plan, and undo through the chat |
| Tools | Auto-Tagging and Summarizer store reviewed tags and summaries; AI reorganization previews, applies, and undoes |

Each test ends with privacy checks: the API key is found only in the AI credentials item, never in
synced storage, the AI activity log, other local items, or session storage (compared inside the
browser, so the key is never printed), and the activity log has an entry for each feature used.

A real model words things its own way, so the tests assert structure and outcomes, not text.

## Setup

| Variable | Required | Meaning |
| --- | --- | --- |
| `BS_LIVE_AI_BASE_URL` | yes | The provider's OpenAI-compatible base URL, such as `http://localhost:8317/v1` |
| `BS_LIVE_AI_API_KEY` | yes | The provider's API key |
| `BS_LIVE_AI_MODEL` | yes | A model the provider serves, with structured output and tool calls |
| `BS_LIVE_AI_PROVIDER` | no | A provider id from `config/ai/providers/`; defaults to `cliproxyapi` |
| `BS_LIVE_ENV_FILE` | no | Path of the env file to read instead of the default |

Set them in the environment, or put them in `apps/extension/.env.live.local`:

```bash
BS_LIVE_AI_BASE_URL=http://localhost:8317/v1
BS_LIVE_AI_API_KEY=<your key>
BS_LIVE_AI_MODEL=<model id>
```

`.env*.local` files are git-ignored. Only `BS_LIVE_*` lines are read, and the environment wins over
the file. In a git worktree without its own file, the main checkout's
`apps/extension/.env.live.local` is used. WXT never bundles these variables: it exposes only
`VITE_` and `WXT_` ones.

## Keeping the key private

- The service is stored as Options stores it (`seedAIServices`), so the key is never typed into a
  page.
- The `live` Playwright project saves no traces, screenshots, or video.
- The `test:live` target prints through `redacting-reporter.ts`, which replaces the key in every
  error, received value, and test output. Run the suite through the target, or pass
  `--reporter=./tests/live/redacting-reporter.ts` when calling Playwright yourself.
- Tests run one at a time with no retries, to stay within the provider's rate limits.

## GitHub Actions

The `Live AI` workflow (`.github/workflows/live-ai.yml`) runs the suite on demand only
(`workflow_dispatch`). It reads the repository secrets `BS_LIVE_AI_BASE_URL`, `BS_LIVE_AI_API_KEY`,
and `BS_LIVE_AI_MODEL`, and the optional `BS_LIVE_AI_PROVIDER`; when the required ones are not
set, the run is skipped with a notice. The base URL must be reachable from GitHub's runners, so a
provider on `localhost` works only locally.
