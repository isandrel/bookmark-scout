# Bookmark Scout Docs

The Fumadocs documentation site for Bookmark Scout, exported as a static site.

## Content

Pages live in `content/docs/` as MDX. The sidebar order and sections come from `content/docs/meta.json`:

| Section | Pages |
| --- | --- |
| Get started | `index.mdx`, `installation.mdx`, `browser-support.mdx` |
| Guides | `guides/*.mdx`, ordered by `guides/meta.json` |
| Reference | `features.mdx`, `settings.mdx`, `permissions.mdx` |
| About | `privacy.mdx`, `faq.mdx`, `status.mdx` |
| Contribute | `contributing.mdx` |

Links to the website, the repository, releases, stores, and contact addresses come from `config/site.config.toml` through MDX components such as `<Contact role="support" />`; see `AGENTS.md`.

The build also writes `llms.txt`, `llms-full.txt`, and a Markdown copy of each page under `llms.mdx/`.

## Development

From the workspace root:

```bash
bun run dev:docs
bunx nx run docs:build
bunx nx run docs:verify
```

From `apps/docs`:

```bash
bun run dev
bun run types:check
bun run build
bun run verify
```

`verify` checks the static export in `out/`: legacy URLs, sitemap, canonical and social image URLs, titles, `robots.txt`, and the LLM text files.

## Maintenance notes

- Keep feature claims aligned with `content/docs/status.mdx`, `apps/extension/src/`, and `apps/extension/config/`.
- Update install steps when WXT output paths or release asset names change.
- AI docs must say that AI is opt-in and which bookmark data goes to the configured provider.
- The theme and components are described in `DESIGN.md`.
