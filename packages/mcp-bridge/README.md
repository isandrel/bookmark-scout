# bookmark-scout-mcp

An MCP server that lets AI agents on your computer (Claude Code, Codex, Cursor, and other MCP clients) search and organize the bookmarks in your browser through the [Bookmark Scout](https://github.com/isandrel/bookmark-scout) extension. It reaches the extension through the browser's native messaging and listens only on a per-user socket (a named pipe on Windows), never on the network. Every change an agent asks for waits for your approval in the browser.

Guide: [Use with local AI agents](https://docs.bookmark-scout.com/guides/local-agents).

## Quick start

```sh
bookmark-scout-mcp install          # register with your browsers (add --dry-run to preview)
claude mcp add --scope user bookmark-scout -- bookmark-scout-mcp serve
```

Then turn on **Allow local AI agents** in Bookmark Scout's Options, under AI. `install` also prints the Codex and Cursor configuration.

| Command | What it does |
| --- | --- |
| `serve [--browser <id>] [--profile <id>]` | The MCP server an agent starts (stdio) |
| `install [--browser <id>]... [--extension-id <id>]... [--dry-run]` | Writes the native messaging manifests and launcher for this user |
| `uninstall [--dry-run]` | Removes what `install` wrote |
| `doctor` | Shows registrations, connected browsers, and agent snippets |
| `native-host` | Started by the browser; not run by hand |

Set `BOOKMARK_SCOUT_MCP_LOG` to a file to see what the browser-started host logs.

## Development

```sh
bun test packages/mcp-bridge                 # unit and process-level integration tests
bun run --cwd packages/mcp-bridge typecheck
bun run --cwd packages/mcp-bridge compile    # dist/bookmark-scout-mcp for this machine
bunx nx run extension:test:e2e:bridge        # the binary with the extension in Chromium
```

Settings are in `config/bridge.toml`; the messages shared with the extension are `src/protocol.ts`.

## Publishing (maintainer)

Nothing is published automatically.

1. Run the **MCP bridge binaries** workflow (Actions tab) and attach its six binaries to a GitHub release.
2. npm: remove `"private": true` from `package.json`, then `bun publish --access public` from this folder (`prepublishOnly` builds `dist/cli.js`, which runs on Node 20 or later, so users without Bun can run it).
3. MCP registry: with the npm version live, `mcp-publisher login github` and `mcp-publisher publish` from this folder (`server.json`; its name must match `mcpName` in `package.json`).
4. Claude Code plugin: `claude-plugin/` holds a plugin and a one-plugin marketplace (`/plugin marketplace add` with that folder's URL) that start `bookmark-scout-mcp serve`.
