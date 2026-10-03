---
name: extension-ai-feature
description: Add or change AI functionality in the Bookmark Scout extension end to end - a provider or local-server preset, an AI tool, model listing, prompts, page reading, or any tunable AI limit - while keeping it opt-in, configurable, logged, tested, and disclosed. Use when touching src/services/ai-*, the provider catalog, the config/ai/ files, or anything that sends user data to a provider.
---

# Extension AI feature

Read the "AI and provider guidance" section of `apps/extension/AGENTS.md` first. Provider creation, model wiring, and model listing stay in `src/services/ai-client.ts` and `src/services/ai-model-list.ts`.

## Checklist

1. **Off by default.** New AI behavior is opt-in and stays disabled until the user turns it on.
2. **No hard-coded tunables.** Timeouts, sizes, counts, and limits go in a file under `apps/extension/config/ai/` (such as `model-list.toml`, `page-reading.toml`, or `activity.toml`), with a comment, and are read once with `readConfig` and a strict zod schema in the module that uses them, so a missing value fails at load instead of at the first AI call. Messages that mention a value take it as a placeholder; `ai_connErrorTimeout` once hard-coded "8 seconds".
3. **Pick the storage area deliberately.**
   - AI services and API keys: `local:` only, never sync.
   - Prompt library: `sync:` with one item per prompt plus an index (`src/lib/prompt-library-storage.ts`), because sync allows 8 KB per item and about 100 KB total. Keep `prompt_max_bytes` at 8192 or less (the schema enforces it).
4. **Log every request.** Pass the logging fetch with a source name into every provider factory and into model listing, so the opt-in AI activity log sees all traffic. Source names shown to users go through `t()`.
5. **Treat page and bookmark text as untrusted.** After any user custom prompt, append the fixed rule that tells the model not to follow instructions found inside the content.
6. **Update every disclosure when data leaving the device changes.** PR #516 found these still saying "No page content is fetched":
   - `store/privacy-policy.md`, `store/privacy-disclosures.md`, `store/permissions.md`
   - `apps/docs/content/docs/privacy.mdx` and `permissions.mdx`
   - `apps/website/messages/privacy/{en,ja,ko}.json`
7. **Locales:** new strings in `en`, `ja`, and `ko`.
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

## Scripting TOML

Use Bun with `smol-toml` (already a dependency) for any script that reads or rewrites TOML. The system `python3` has no `tomllib`.
