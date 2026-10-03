# AGENTS.md

## Scope

This file applies to work under `apps/docs`.

Use it together with the repository root `AGENTS.md`. If there is a conflict, this file takes precedence for the docs app.

## Mission

This app is the canonical documentation surface for Bookmark Scout. The priority here is correctness, clarity, and maintainability.

Agents should avoid decorative churn and optimize for docs that accurately describe the repository as it exists today.

## App overview

`apps/docs` uses:

- Next.js
- Fumadocs
- MDX content in `content/docs`
- TypeScript for app and source configuration

The docs app is both content-driven and code-driven. Many changes are simple MDX edits, but some tasks affect source loading, MDX processing, or route behavior.

## Local repository map

- `content/docs/`: documentation pages in MDX
- `content/docs/meta.json`: page order and the sidebar sections (Get started, Guides, Reference, About, Contribute) as `---Name---` separators
- `content/docs/guides/`: task guides, ordered by their own `meta.json`
- `src/app/`: routes and the application shell (`layout.tsx`, `[[...slug]]/page.tsx`, `sitemap.ts`, `robots.ts`, `og/`)
- `src/app/llms.txt/`, `src/app/llms-full.txt/`, `src/app/llms.mdx/`: the LLM index, the full text, and one static Markdown copy per page (used by the page actions)
- `src/app/api/search/`: the static search index
- `src/components/mdx/`: MDX components that read config (`Contact`, `ReleaseLink`, `SiteLink`, `RepoLink`, `StoreListing`, `StoreAvailability`, `License`, `PrivacyEffectiveDate`) and `Screenshot`
- `src/components/home/`: the docs home's task finder
- `src/lib/`: source loading (`source.ts`), link helpers (`links.ts`), site constants (`site.ts`), UI copy outside MDX (`copy.ts`), the page index (`doc-index.ts`), screenshot alt text over the shared manifest in `@bookmark-scout/config` (`screenshots.ts`), and the MDX-to-Markdown conversion for LLM text (`mdx-text.ts`)
- `src/mdx-components.tsx`: component mapping for MDX; register new MDX components here
- `source.config.ts`: MDX and collection configuration
- `scripts/verify-build.ts`: checks the static export in `out/`
- `DESIGN.md`: the docs theme and components

## Commands

- dev server: `nx run docs:dev` (or `bun run dev:docs` from the root)
- type and generated-source check: `bun run types:check` (in `apps/docs`)
- build: `nx run docs:build`
- verify the static export: `nx run docs:verify` (runs the build first) or `bun run verify` after a build
- lint: `bunx biome check src scripts` (in `apps/docs`; CI does not run it, so run it locally)

The docs app has no `project.json`. Nx targets come from `package.json` scripts plus its `"nx"` field; add new targets there. For screenshot reviews and deploy checks, follow the `website-docs-delivery` skill in `.agents/skills/`.

## Verification rules

Minimum for most docs changes:

- `nx run docs:build`
- `nx run docs:verify`, which checks that the legacy URLs (`/`, `/installation`, `/features`, `/status`, `/contributing`) still exist, that every sitemap URL is on `DOCS_URL` and has an HTML file, that canonical and `og:image` URLs are absolute on `DOCS_URL`, that titles use the `DOCS_NAME` template, that `robots.txt` names the sitemap, that `llms.txt` and `llms-full.txt` have content, and that no HTML links to a local address

Also run `bun run types:check` when the task affects:

- MDX structure
- source loading
- docs app code
- metadata generation
- generated LLM text or derived content helpers

For UI changes, also check 375px and 1280px in light and dark.

## Content guidance

### Accuracy first

Docs should reflect the current repository and product behavior.

Rules:

- if implementation changed, update docs
- if docs are outdated relative to code you are already touching, correct them when reasonable
- do not copy commands or paths from memory when they can be verified from the repo

### MDX editing

- keep frontmatter accurate and minimal
- preserve the current docs tone and structure unless the task calls for a rewrite
- prefer simple headings, lists, and code blocks
- keep examples concise and runnable where possible
- avoid ornamental formatting that makes maintenance harder

### No hard-coded values

- Never write URLs for the website, repository, releases, or stores, contact addresses, the license, or the privacy date as literals in MDX or app code. They come from `config/project.toml` and `config/web.toml` through `@bookmark-scout/config`.
- In MDX, use the config components: `<Contact role="support" />`, `<ReleaseLink />`, `<SiteLink to="privacy">...</SiteLink>`, `<RepoLink path="/issues">...</RepoLink>` (or `file="CONTRIBUTING.md"` for a file and `tree="store"` for a folder on the default branch; never write the branch name), `<StoreListing browser="chrome" />`, `<StoreAvailability />`, `<License />`, `<PrivacyEffectiveDate />`.
- A new config component needs three changes: the component in `src/components/mdx/`, its registration in `src/mdx-components.tsx`, and a Markdown replacement in `src/lib/mdx-text.ts` so LLM text stays readable.
- Keep link and navigation lists as typed data in `src/lib/` (`site.ts`, `links.ts`), not inline in components.

### Linking and structure

- add pages to the matching `meta.json`; never rename or move a page whose URL is listed under the legacy URLs above
- use the Diátaxis split: guides are task steps, reference pages list facts, About pages explain
- preserve existing internal linking conventions
- keep new pages inside the current content organization unless a structural change is explicitly requested
- avoid introducing new documentation taxonomy without a clear need

### Fumadocs-specific guidance

The content source is configured through:

- `source.config.ts`
- `src/lib/source.ts`

Be careful when editing these files because they affect page discovery, processing, and derived outputs such as LLM text.

## Design

Read `DESIGN.md` before any UI or theme work. Theme Fumadocs through the `--color-fd-*` variables in `src/app/global.css`; do not replace its layout or components. Shared brand rules are in the root `DESIGN.md`.

## App code guidance

- keep docs-site code focused on content rendering, navigation, and source behavior
- prefer extending existing helper paths instead of adding parallel source-loading logic
- be careful with changes that impact page images, content extraction, or MDX processing

## Style guidance

- use TypeScript for app code
- keep MDX concise and readable
- avoid broad wording churn with little informational value
- do not rewrite large documentation sections unless the task actually requires it

## Security and examples

- never add real credentials or tokens to docs
- keep examples realistic but clearly safe
- avoid documenting workflows that the repository does not actually support

## Change discipline

- update commands, file paths, and examples when the repository workflow changes
- keep docs aligned with implementation
- do not edit generated directories
- if a docs change intentionally leaves known gaps, call that out explicitly
