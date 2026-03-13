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

- `content/docs/`: documentation pages and frontmatter-backed MDX content
- `src/app/`: docs site routes and application shell
- `src/lib/`: source loading and helper logic
- `mdx-components.tsx`: shared component mapping for MDX
- `source.config.ts`: MDX and collection configuration

Do not edit generated artifacts under:

- `.next/`
- `out/`
- `node_modules/`

## Commands

- dev server: `nx run docs:dev`
- build: `nx run docs:build`

Useful app-local command:

- type and generated-source check: `bun run types:check`

## Verification rules

Minimum for most docs changes:

- `nx run docs:build`

Also consider:

- `bun run types:check`

when the task affects:

- MDX structure
- source loading
- docs app code
- metadata generation
- generated LLM text or derived content helpers

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

### Linking and structure

- preserve existing internal linking conventions
- keep new pages inside the current content organization unless a structural change is explicitly requested
- avoid introducing new documentation taxonomy without a clear need

### Fumadocs-specific guidance

The content source is configured through:

- `source.config.ts`
- `src/lib/source.ts`

Be careful when editing these files because they affect page discovery, processing, and derived outputs such as LLM text.

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
