# Bookmark Scout design

Bookmark Scout is a Bun + Nx monorepo, and each app keeps its own design file next to its own `AGENTS.md`:

| App | Design file | Agent rules |
| --- | --- | --- |
| Marketing website | [`apps/website/DESIGN.md`](apps/website/DESIGN.md) | [`apps/website/AGENTS.md`](apps/website/AGENTS.md) |
| Documentation site | [`apps/docs/DESIGN.md`](apps/docs/DESIGN.md) | [`apps/docs/AGENTS.md`](apps/docs/AGENTS.md) |
| Browser extension | [`apps/extension/DESIGN.md`](apps/extension/DESIGN.md) | [`apps/extension/AGENTS.md`](apps/extension/AGENTS.md) |

This file holds only what all surfaces share.

## Shared brand

- **Idea:** a map reader's tool for years of bookmarks. Calm paper and ink, a compass-teal action color, and a marker-pen highlight for search matches.
- **Logo:** the ribbon bookmark with a magnifier and compass star (`apps/website/public/icon.png`). Its teal-to-violet gradient (`#2bb3b1` to `#4f6ce0` to `#8a3fd1`) appears only on the logo and the ribbon shape.

| Token | Light | Dark |
| --- | --- | --- |
| Paper (page) | `#f4f7fb` | `#0d1b2a` |
| Surface (panels) | `#ffffff` | `#132638` |
| Ink (text) | `#0f2135` | `#e8eff6` |
| Ink soft (secondary text) | `#4a5b70` | `#9fb2c6` |
| Line (borders) | `#d6dfea` | `#23394f` |
| Teal (actions, links, focus) | `#0b7a80` | `#3cc4c9` |
| Violet (small accents) | `#5b3fd6` | `#a08bff` |
| Marker (search highlight) | `#ffe27a` | `#f5cf4a` |

- **Type:** Bricolage Grotesque for display, Instrument Sans for body, JetBrains Mono for URLs and code. Self-hosted through `next/font`; Japanese and Korean fall back to system fonts.
- **Theme:** follows the visitor's `prefers-color-scheme`.
- **Voice:** plain, specific, sentence case. Describe what the extension does in each browser; never claim a feature a browser does not have.

## Shared rules

- Values such as URLs, contact addresses, store links, license, and dates come from `config/site.config.toml` through `@bookmark-scout/config`, never from literals in components.
- No third-party requests other than the configured analytics.
- Visible focus, AA contrast, reduced motion respected, no horizontal scroll at 320px.
- When a brand token changes, update this file and every app design file in the same change.
