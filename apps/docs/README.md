# Bookmark Scout Docs

This app is the Fumadocs documentation site for Bookmark Scout.

## Content

Documentation pages live in `content/docs/` as MDX:

- `index.mdx` — quick start and feature overview
- `installation.mdx` — release and source installation
- `features.mdx` — implemented features and current roadmap
- `status.mdx` — concise implementation/planning status
- `contributing.mdx` — contributor workflow and validation commands

## Development

Run commands from the workspace root unless you are intentionally working inside this app:

```bash
bun run dev:docs
bun run build:docs
```

Useful app-local commands:

```bash
bun run dev
bun run build
bun run types:check
```

## Maintenance Notes

- Keep feature claims aligned with `apps/extension/src/` and `apps/extension/config/settings.default.toml`.
- Update installation paths when WXT output paths or release asset names change.
- AI-related docs must mention opt-in behavior and that selected bookmark data may be sent to the configured provider.
- Lint/build validation is not automated test coverage; this repository does not currently expose a dedicated unit or integration test suite in normal workspace scripts.
