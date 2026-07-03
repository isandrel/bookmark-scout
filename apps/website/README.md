# Bookmark Scout Website

This app is the localized public marketing site for Bookmark Scout. It uses Next.js App Router, `next-intl`, and shared product configuration from `@bookmark-scout/config`.

## Content

Primary localized copy lives in:

- `messages/en.json`
- `messages/ja.json`
- `messages/ko.json`

Routes live under `app/[locale]/`. Keep public feature claims aligned with the extension implementation and the canonical docs in `apps/docs/content/docs/`.

## Development

Run commands from the workspace root unless you are intentionally working inside this app:

```bash
bun run dev:website
bun run build:website
```

App-local commands:

```bash
bun run dev
bun run build
bun run lint
```

## Maintenance Notes

- Update all three locale message files when changing website copy.
- Preserve locale-aware routing and `setRequestLocale` usage.
- Keep installation text accurate for the current release assets and WXT output path `apps/extension/dist/chrome-mv3`.
- Keep browser support accurate: Chrome is primary, Firefox and Edge are secondary build targets, and Safari is unsupported because the required bookmarks API is unavailable.
