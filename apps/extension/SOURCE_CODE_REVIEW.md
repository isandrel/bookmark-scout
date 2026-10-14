# Source Code Review

Build instructions for add-on reviewers. This archive is a subset of the Bookmark Scout Bun workspace: the root manifest, lockfile and `bunfig.toml`, every workspace `package.json`, the shared configuration and native messaging protocol sources the extension imports, and the full extension app under `apps/extension`.

## Requirements

- [Bun](https://bun.sh/) at the version declared by `packageManager` in the root `package.json`
- Node.js supported by the installed Vite version (Vite 8: Node.js 20.19+ or 22.12+)
- macOS, Linux, or Windows with WSL

## Build

Run from the archive root:

```bash
bun install --frozen-lockfile
cd apps/extension
bun run build:firefox
```

The unpacked Firefox build is written to `apps/extension/dist/firefox-mv2/`. A clean rebuild from the sources ZIP should match the add-on package from the CI release; compare against that file, not a build from a developer checkout.

## Notes

- `bun install` runs `wxt prepare` for the extension, which generates `apps/extension/.wxt/`.
- The root `prepare` script runs Husky. It prints a warning outside a Git checkout and does not affect the build.
- Other workspace apps (website and docs) are represented only by their `package.json` files so the lockfile resolves. They are not part of the extension build.
- `bunfig.toml` preserves the release build's isolated dependency resolution. The shared MCP protocol source is needed by the background; building the native host executable is not needed to rebuild the extension.
