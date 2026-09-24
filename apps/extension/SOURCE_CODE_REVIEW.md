# Source Code Review

Build instructions for add-on reviewers. This archive is a subset of the Bookmark Scout Bun workspace: the root manifest and lockfile, every workspace `package.json`, and the full extension app under `apps/extension`.

## Requirements

- [Bun](https://bun.sh/) 1.3 or newer
- macOS, Linux, or Windows with WSL

## Build

Run from the archive root:

```bash
bun install --frozen-lockfile
cd apps/extension
bun run build:firefox
```

The unpacked Firefox build is written to `apps/extension/dist/firefox-mv2/`. It matches the submitted add-on package.

## Notes

- `bun install` runs `wxt prepare` for the extension, which generates `apps/extension/.wxt/`.
- The root `prepare` script runs Husky. It prints a warning outside a Git checkout and does not affect the build.
- Other workspace apps (website and docs) are represented only by their `package.json` files so the lockfile resolves. They are not part of the extension build.
