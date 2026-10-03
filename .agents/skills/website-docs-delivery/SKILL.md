---
name: website-docs-delivery
description: Change, verify, visually review, and ship the Bookmark Scout marketing website (apps/website, Next.js static export with next-intl) and docs site (apps/docs, Fumadocs), then confirm the Cloudflare Pages deploy. Use for any website or docs UI, copy, SEO, metadata, hosting, image, or store-required page change, for screenshot reviews of either site, and for post-merge deploy checks.
---

# Website and docs delivery

Read `apps/website/AGENTS.md` or `apps/docs/AGENTS.md` and the matching `DESIGN.md` first.

## Full local check

Run from the repository root unless noted. Write logs and exit codes to the session scratchpad, not the repo.

```bash
bun install --frozen-lockfile
bunx nx run website:lint
bunx nx run website:verify
bunx nx run website:test:e2e
cd apps/docs && bun run types:check && bunx biome check src scripts
bunx nx run docs:build && bun run --cwd apps/docs verify
```

- For type errors in website code, also run `bunx tsc --noEmit -p .` in `apps/website`.
- Builds rewrite `apps/website/next-env.d.ts`; restore it with `git checkout apps/website/next-env.d.ts` before committing.
- CI's `Website and Docs` job does not run the docs Biome lint, so run it locally for docs code and docs dependency bumps.
- Run Biome from `apps/docs`; from the repo root it can pick up an unrelated Biome config further up the tree.

## Visual review

Use headless Playwright, not the built-in browser pane: the pane scaled 1280px screenshots wrongly in two separate reviews.

1. Serve the export: `bun apps/website/scripts/serve-out.ts 4180` (after `website:build`).
2. Write the screenshot script in the scratchpad, never in the repo. Import Playwright by absolute path so it resolves from outside the workspace, and run it with `bun`:
   ```ts
   import { chromium } from '<repo>/node_modules/@playwright/test/index.mjs';
   ```
3. In the script, route `/umami/` requests to a 204, use `reducedMotion: 'reduce'` and `fullPage: true`, and capture 375px and 1280px in light and dark, for every locale touched.
4. Split tall captures before viewing them: `sips -c 2600 1280 --cropOffset 0 0 in.png --out top.png`.

## Known traps

- **next-intl static export:**
  - Only one layout may render `<html>`. With both the root and `[locale]` layouts doing it, `/ja/` shipped `lang="en"`. The root layout passes children through, and root `not-found.tsx` renders its own `<html>`.
  - Root `/` exported as a JavaScript-only `__next_error__` redirect. It is now a meta-refresh page plus `public/_redirects` (`/ /en/ 302`).
  - Read `metadata.title` from messages per locale, and check that a title template does not double the site name.
- **Docs metadata:** without `metadataBase`, `og:image` pointed at `http://localhost:3000`; `docs:verify` now catches this.
- **Website E2E:**
  - Spec files are `tests/e2e/*.spec.mts`. As `.ts`, Playwright loads them as CommonJS, which cannot import the ESM `@bookmark-scout/config`.
  - Every test stubs analytics; the real Umami request made the suite flaky. Wait for `networkidle` (hydration) before clicking client-side navigation.
  - Prove a flaky fix with `--repeat-each=3`.
  - `reuseExistingServer: !process.env.CI` means a local server already on the test port can serve an old build. Stop it before trusting a local run.
- **Bun scripts** that need Bun types get `/// <reference types="bun" />` at the top of that file only, so Bun globals do not leak into the Next app.
- **Docs Nx targets** come from `apps/docs/package.json` scripts plus its `"nx"` field (for example `verify` depends on `build`); there is no `project.json`.
- **Deploy path filters:** `deploy-website.yml` and `deploy-docs.yml` trigger on their app plus `config/**` and `packages/config/**`. A new shared input the sites read must be added to those filters.

## Hosting (Cloudflare Pages)

- Pages projects are named `bookmark-scout-<app>`, after the folder under `apps/`.
- `public/_headers` and `public/_redirects` are Pages inputs. Zone-level Cloudflare settings can override `_headers`; confirm live headers with `curl -sI` after deploy.
- One-time infrastructure (projects, domains, DNS) goes in a local, idempotent script with `--dry-run` that names any missing token permission (`apps/website/scripts/setup-cloudflare.ts`), never in CI. Probe tokens read-only first and back up DNS records to `~/.cache/` before changing them.
- Status codes seen during cutover: 526 means SSL "Full (strict)" in front of an origin without a valid certificate; 522 right after a DNS change usually means the custom domain is still initializing, so recheck after about 20 minutes.

## After merge

1. Find the deploy runs for the merge SHA: `gh run list --workflow deploy-website.yml` and `gh run list --workflow deploy-docs.yml`. A transient Cloudflare API error gets a rerun, not a code change.
2. Check live status codes with `curl -s -o /dev/null -w '%{http_code}'` for `/`, `/en/`, `/en/privacy/`, `/en/support/`, `/ja/`, `/.well-known/security.txt`, the `www` host, and the docs `/` and `/llms.txt`.
