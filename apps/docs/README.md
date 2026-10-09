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

Links to the website, the repository, releases, stores, and contact addresses come from `config/project.toml` and `config/web.toml` through MDX components such as `<Contact role="support" />`; see `AGENTS.md`.

The build also writes `llms.txt`, `llms-full.txt`, and a Markdown copy of each page under `llms.mdx/`.

## Languages

The site serves every language in `[locales] supported` of `config/project.toml`. English is the source and keeps unprefixed URLs (`/faq`); every other language lives under its tag (`/ja/faq`, `/zh-CN/faq`) and has a language switcher entry with its own name from `[locales.names]`. Until a page is translated, its URL in another language shows the English page with a short notice, so a new language never breaks the build. The website reads the same list, so adding a language there also needs the website's message files.

### Translating a docs page

1. Copy the English file next to itself with the language tag before the extension, spelled exactly as in config: `faq.mdx` becomes `faq.ja.mdx`, `guides/search.mdx` becomes `guides/search.zh-CN.mdx`. Do not rename or move files; the URL comes from the English file name.
2. Translate `title` and `description` in the frontmatter and leave any other field as it is.
3. Translate the body. Keep MDX components and their props unchanged: `<Contact role="support" />`, `<RepoLink path="/issues">`, `<StoreListing browser="chrome" />`, `<Screenshot name="manager" />`, `<StartHere />`. Translate only the text between tags, such as `<SiteLink to="privacy">privacy policy</SiteLink>`. In `<Tabs items={[...]}>`, each `<Tab value>` must still match an item; keep the browser names. Bold UI labels should match the extension's own wording in that language (`apps/extension/public/_locales/`).
4. Keep links as English page URLs (`/guides/search`) or relative file paths; they open the translated page when there is one. Other pages link to headings by their English id (`/settings#ai`), so keep that id on the translated heading: `## <translated heading> [#ai]`.
5. To translate the sidebar, copy `meta.json` to `meta.<tag>.json` (and `guides/meta.json` to `guides/meta.<tag>.json`) and translate `title`, `description`, and the `---Section---` names. A translated `meta` file replaces the English one for that language, so keep the full `pages` list in the same order.
6. UI text outside MDX (buttons, the page finder, the untranslated-page notice, screenshot alt text, and Fumadocs' own labels such as "Search") is in `src/lib/copy.ts`. Add the language to `TRANSLATIONS` there, starting from the English entry.
7. Run `bun run types:check`, `bun run build`, and `bun run verify`, and look at the page under `/<tag>/`.

"Edit on GitHub" and "Last updated" follow the file shown, so a translated page links to and dates its own file. `llms.txt`, `llms-full.txt`, and the social cards stay English; a translated page gets its own Markdown copy under `llms.mdx/<tag>/`.

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

`verify` checks the static export in `out/`: legacy URLs, every page in every language, `<html lang>`, sitemap and hreflang alternates, canonical and social image URLs, titles, `robots.txt`, the search index of each language, and the LLM text files.

## Maintenance notes

- Keep feature claims aligned with `content/docs/status.mdx`, `apps/extension/src/`, and `apps/extension/config/`.
- Update install steps when WXT output paths or release asset names change.
- AI docs must say that AI is opt-in and which bookmark data goes to the configured provider.
- The theme and components are described in `DESIGN.md`.
