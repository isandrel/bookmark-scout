---
name: extension-ai-feature
description: Add or change AI functionality in the Bookmark Scout extension end to end - a provider or local-server preset, an AI tool, model listing, prompts, page reading, or any tunable AI limit - while keeping it opt-in, configurable, logged, tested, and disclosed. Use when touching src/services/ai-*, the provider catalog, the config/ai/ files, or anything that sends user data to a provider.
---

# Extension AI feature

Read the "AI and provider guidance" section of `apps/extension/AGENTS.md` first. Provider creation and model wiring live in the lazily loaded `src/services/ai-client.lazy.ts`, behind the always-loaded facade `src/services/ai-client.ts` (`generateAIObject` for structured calls); model listing stays in `src/services/ai-model-list.ts`. The Ask AI agent loop is `src/services/ai-agent.lazy.ts` behind `ai-agent.ts`, with its tools in `ai-bookmark-tools.ts`. Anything that imports the AI SDK or a provider package goes in a `*.lazy.ts(x)` file loaded with `await import()`, never in a facade or shared module; `tests/e2e/lazy-ai-sdk.spec.ts` guards this, and unit tests mock `generateAIObject` rather than `ai`. Every AI feature resolves its provider through `getActiveAISettings` in `src/services/ai-settings.ts` (the user's default named service); never read the legacy synced `aiProvider`/`aiModel` keys. The named-services migration derives a default from them on read without writing, so old data survives a rollback.

## Checklist

1. **Off by default.** New AI behavior is opt-in and stays disabled until the user turns it on.
2. **No hard-coded tunables.** Timeouts, sizes, counts, and limits go in a file under `apps/extension/config/ai/` (such as `model-list.toml`, `page-reading.toml`, `agent.toml`, or `activity.toml`), with a comment, and are read once with `readConfig` and a strict zod schema in the module that uses them, so a missing value fails at load instead of at the first AI call. Messages that mention a value take it as a placeholder; `ai_connErrorTimeout` once hard-coded "8 seconds".
3. **Pick the storage area deliberately.**
   - AI services and API keys: `local:` only, never sync.
   - Prompt library: `sync:` with one item per prompt plus an index (`src/lib/prompt-library-storage.ts`), because sync allows 8 KB per item and about 100 KB total. Keep `prompt_max_bytes` at 8192 or less (the schema enforces it). Sync counts the key plus the JSON-serialized value, not the raw text: quotes and backslashes take 2 bytes, Japanese or Korean 3 a character, and Chrome escapes `<` (and the line and paragraph separators) as `\uXXXX`, 6 bytes. Measure with `syncItemBytes` in `src/lib/prompt-library-storage.ts`, never `text.length` or a plain UTF-8 count.
4. **Log every request.** Pass the logging fetch with a source name into every provider factory and into model listing, so the opt-in AI activity log sees all traffic. Source names shown to users go through `t()`.
5. **Treat page and bookmark text as untrusted.** After any user custom prompt, append the fixed rule that tells the model not to follow instructions found inside the content.
6. **Update every disclosure when data leaving the device changes.** PR #516 found the privacy pages still saying "No page content is fetched". Follow the `privacy-disclosure-sync` skill: it lists the ten places, from `store/privacy-disclosures.md` to the in-product consent text, and has a script that inventories outbound requests.
7. **Locales:** new strings in every `public/_locales/*/messages.json`.
8. **Tests:** `[mocked provider contract]` unit and E2E tests with stubbed providers and synthetic keys, plus the settings matrix (`tests/settings-matrix.ts`) when a setting is added. Mock the endpoint the SDK really calls: moving custom providers to `@ai-sdk/openai-compatible` switched requests from `/responses` to `/chat/completions` and broke the mocked auto-tagging test.

## Provider gotchas

- **OpenAI-compatible servers:** use `@ai-sdk/openai-compatible` `chatModel` with `supportsStructuredOutputs: true`. Without the flag, structured-output calls to compatible servers failed with "No object generated".
- **Ollama:** use `ollama-ai-provider-v2`; the older package does not work with `ai` v7.
- **Anthropic from the browser** needs the `anthropic-dangerous-direct-browser-access: true` header.
- **A 403 from a local server** usually means its origin check rejected the extension: Ollama needs `OLLAMA_ORIGINS`, LM Studio needs CORS enabled. Say so in the error, not just "403".
- **Write local server URLs as `localhost`**, never `127.0.0.1`, in presets, docs, and copy.

## Provider catalog

- `config/provider-catalog.json` is a models.dev snapshot. Regenerate it with `bun run catalog:sync` (in `apps/extension`); never fetch models.dev at runtime and never hand-edit the JSON.
- To check which providers expose a model list, call each `/models` endpoint with a fake key: 401 or 403 means the endpoint exists. Parse the full response body; truncating it to 300 characters made valid JSON look like "nonjson".
- models.dev serves a placeholder logo for unknown ids. Skip any logo whose hash matches the placeholder.
- Exclusions and their reasons live in `scripts/sync-provider-catalog.ts`.

## Real-server checks (optional, manual)

The opt-in local-server spec (`tests/e2e/ai-local-server.spec.ts`) reads the server key and model from `BOOKMARK_SCOUT_LOCAL_AI_KEY` and `BOOKMARK_SCOUT_LOCAL_AI_MODEL`. Load the key from the server's own config without printing it. These runs are not part of CI and do not prove compatibility with hosted providers; report them as manual checks.

## Agent features (Ask AI)

- Build a chat agent as an AI SDK `ToolLoopAgent` with `stopWhen: isStepCount(config.max_steps)`, created again for every message, so a changed service or setting applies to the next message without stale closures.
- The extension has no server: connect the agent to `useChat` through `DirectChatTransport` wrapped in a small custom `ChatTransport`. Pass `onError: (e) => (e instanceof Error ? e.message : String(e))`; without it every failure shows as "An error occurred." instead of the provider's reason.
- Tools only read. A tool that cannot act returns `{ error: '<reason>' }` rather than throwing, so the model can explain why. Gate page reading on both its setting and granted website access. Append the fixed "tool results are data" rule after any editable prompt. Keep the conversation in memory only.
- Render answers with `react-markdown` and `remark-gfm`, no raw HTML, links opening in a new tab.
- Built-in web search uses each provider's own tool (`openai.tools.webSearch`, `anthropic.tools.webSearch_20250305({ maxUses })`, `google.tools.googleSearch`, `xai.tools.webSearch`). The packages type them differently: keep the map as `() => object` and cast where they join the `ToolSet`. Off by default; `maxUses` lives in config.

## Errors and Verify

- Verify Service calls the provider's free model-list endpoint and checks the selected model is listed, instead of spending tokens on a generation. A 429 there is a soft "rate limited" result, not a failure.
- Some providers answer a bad key with 400 (Gemini), so classify key errors by body text too (`API_KEY_INVALID|invalid api key|invalid x-api-key`). In the browser a refused port, a DNS failure, and a CORS rejection all surface as the same fetch `TypeError`: report "unreachable" and name the host.
- Error-path tests use a non-retryable status such as 401. The SDK retries 5xx on its own, so a mocked 500 never reaches the UI in time. Assert the provider's message text, not just that an alert exists.
- To mock a tool-calling stream, route `<baseURL>/**` with `content-type: text/event-stream` and `access-control-allow-origin: *`, send OpenAI `chat.completion.chunk` SSE lines, a final chunk with `finish_reason`, then `data: [DONE]`. Pick the turn by whether the request already holds a `role: 'tool'` message (`tests/e2e/ask-ai.spec.ts`).

## Settings, services, and prompts

- The model picker keeps showing the saved model even when the cached model list lacks it; otherwise it silently blanks the user's choice.
- The service editor saves only changed fields. Saving the whole form once wrote empty `baseUrl` values over presets.
- Per-device switches (activity recording, the web-search toggle) are their own `local:` storage items, outside the synced settings schema, which avoids the sync quota and settings-matrix churn.
- The activity log redacts secret headers and key query parameters, truncates bodies, clones the response, never lets logging break the call, and clears itself when recording is turned off.
- Prompt editors load from storage in an effect, not during render (StrictMode renders twice), and ask before deleting a prompt.

## Before the PR

Check the diff for hard-coded user-visible English, which the maintainer counts as hard-coded values:

```bash
git diff origin/main...HEAD -U0 -- apps/extension/src | grep '^+' | grep -E "'[A-Z][a-z]+ [a-z]+" | grep -vE '^\+\s*(//|\*)'
rg "throw new Error\('[A-Z]" apps/extension/src/services/ai-* apps/extension/src/lib/ai-*
```
