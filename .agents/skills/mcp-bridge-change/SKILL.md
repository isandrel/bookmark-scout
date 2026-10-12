---
name: mcp-bridge-change
description: Change the bookmark-scout-mcp bridge (packages/mcp-bridge) or the extension's side of it (src/services/agent-bridge.ts, agent approvals) that lets local AI agents such as Claude Code, Codex, or Cursor use Bookmark Scout's bookmark actions - message shapes, serve, native-host, install, uninstall, doctor, sockets, limits, tests, the Bridge E2E job, and distribution (npm, MCP registry, Claude Code plugin, binaries). Use when touching packages/mcp-bridge, tests/e2e-bridge, agent-bridge.spec.ts, or when the user asks to give agents a new tool, debug "Native host has exited", or publish the bridge.
---

# MCP bridge change

Read `packages/mcp-bridge/README.md`, the "MCP bridge changes" checks in the root `AGENTS.md`, and the "Undo history" bullet in `apps/extension/AGENTS.md` first.

## How it fits together

- One program, two ends. The browser starts `native-host` (native messaging over stdio); an agent starts `serve` (MCP over stdio). They meet on a per-user socket (a named pipe on Windows) under a runtime folder, never on TCP: the localhost designs reviewed during research had no authentication, and the MCP spec recommends stdio or a user-only socket. Keep it that way.
- The native host decides nothing. It relays messages, renumbers call ids, and enforces the size and connection limits in `config/bridge.toml`. The extension decides everything: which actions are offered, private values hidden, rate limits (`config/ai/agent-bridge.toml`), and approval in its own window. MCP tool annotations are hints a client may ignore, so never rely on them for safety.
- `src/protocol.ts` is the only shared schema. The extension imports it from the package.

## Give agents a new tool

Usually no bridge change at all: add a bookmark action with an `agent` exposure (`extension-bookmark-actions` skill). The extension sends its tool list in `hello` (`toBridgeTool` in `agent-bridge.ts` converts the zod schemas to JSON Schema), and `serve` registers whatever arrives and notifies the client. Edit `packages/mcp-bridge` only when a message shape in `src/protocol.ts` changes; then change the extension side in the same PR and raise `PROTOCOL_VERSION` when old and new ends could no longer talk.

Timeouts that must agree: the extension's approval `timeout_seconds` (`apps/extension/config/ai/agent-approvals.toml`) must stay below `call_timeout_seconds` in `config/bridge.toml`, or the agent gives up while the user is still deciding. Only comments link them today; a change to either needs the other checked.

## Test

```bash
bun run --cwd packages/mcp-bridge typecheck
bun test packages/mcp-bridge            # unit tests plus native-host and serve as real processes
bunx nx run extension:test:e2e:bridge   # compiled binary as Chromium's native host, an MCP client driving serve
```

- **Never touch the real registration.** Pass the same `--home <dir>` and `--manifest-dir <dir>` (and exactly one `--browser` for `install`) to `install`, `uninstall`, and `doctor` in any test or manual check; `uninstall` and `doctor` lacked them until PR #639. Point `BOOKMARK_SCOUT_MCP_RUNTIME_DIR` at a fresh folder so test sockets never meet a real browser's.
- **macOS protected folders.** A program the browser starts from `~/Documents` (where a checkout may live) waits for a privacy prompt nobody sees, and the host just exits. Both the binary and the launcher folder must be outside: set `BOOKMARK_SCOUT_MCP_BIN` to a copy of the binary in a temp folder, and the spec already puts `--home` under the system temp folder. That temp folder is a deliberate exception to the E2E rule of writing only under `testInfo.outputPath`; do not move it back.
- **Fast tests without the binary:** `tests/e2e/agent-bridge.spec.ts` replaces the worker's `runtime.connectNative` with a fake port (`installFakeBridge`). Use it for extension-side behavior; keep the real-binary spec for the wire.
- **Browser identity:** the Edge build sends `browser: 'edge'` in `hello`, and the Edge E2E job runs the Chromium specs with it. Derive expected values from the `extensionBrowser` fixture, never a literal `'chrome'`.
- **CI:** the `Bridge E2E` job runs on Linux and macOS (`bridge` scope in `.github/ci-scopes.toml`). Windows finds native hosts only through the registry and is not tested in CI.

## Debug "Native host has exited"

This cost one session most of an hour. In order:
1. Assert on the whole status object (`toEqual({ state: 'ready' })`) so the failure prints the browser's reason.
2. Set `BOOKMARK_SCOUT_MCP_LOG` to a file; the browser discards the host's stderr.
3. Point the manifest's `path` at a tiny shell script in a temp folder that logs its arguments and then runs the binary. If the script runs but the binary never logs that it started, the cause is the macOS folder protection above, not message framing.

## Distribution (maintainer only)

The repository prepares npm (`dist/cli.js` from `build:npm`, runs on Node 20 or later), the MCP registry (`server.json`, whose name must equal `mcpName`), the Claude Code plugin (`claude-plugin/`), and the manual **MCP bridge binaries** workflow. `src/distribution.test.ts` keeps their versions, names, and URLs in step. Nothing publishes automatically and the package stays `"private": true`: never publish, remove `private`, or run `mcp-publisher` unless the maintainer asks. The Chrome extension id comes from `config/project.toml`; the Edge id goes in `chromium_ids` once that listing is live.
