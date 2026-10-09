---
name: website-docs-delivery
description: Change, verify, visually review, and ship the Bookmark Scout marketing website (apps/website, Next.js static export with next-intl) and docs site (apps/docs, Fumadocs), then confirm the Cloudflare Pages deploy. Use for any website or docs UI, copy, SEO, metadata, hosting, image, or store-required page change, for screenshot reviews of either site, and for post-merge deploy checks.
---

# Website and docs delivery

Read `apps/website/AGENTS.md` or `apps/docs/AGENTS.md` and the matching `DESIGN.md` first. For a content, marketing, SEO, or store-copy review, also read `references/marketing-review.md`. For a redesign, write the plan in the git-ignored `plans/` folder and critique it against generic defaults before dispatching builders (the critique replaced three equal columns with tabs and a fact grid with a data-boundary diagram).

## Full local check

Run from the repository root unless noted. Write logs and exit codes to `~/.cache/bookmark-scout-<topic>/`, not the repo or a session scratchpad (scratchpads get wiped).

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
- CI's `Website and Docs` job also runs the docs Biome lint (`bunx biome check src scripts` in `apps/docs`); run it locally first.
- Run Biome from `apps/docs`; from the repo root it can pick up an unrelated Biome config further up the tree.

## Visual review

Use headless Playwright, not the built-in browser pane: the pane scaled 1280px screenshots wrongly in two separate reviews.

1. Serve the export: `bun apps/website/scripts/serve-out.ts 4180` (after `website:build`).
2. Write the screenshot script under `~/.cache/bookmark-scout-<topic>/`, never in the repo. Import Playwright by absolute path so it resolves from outside the workspace, and run it with `bun`:
   ```ts
   import { chromium } from '<repo>/node_modules/@playwright/test/index.mjs';
   ```
3. In the script, route `/umami/` requests to a 204, use `reducedMotion: 'reduce'` and `fullPage: true`, and capture 375px and 1280px in light and dark, for every locale touched.
4. Split tall captures before viewing them, for example with ImageMagick: `magick in.png -crop 1280x2600 +repage part-%d.png`.
5. Mark each finding as confirmed (checked in the built `out/` HTML, for example `grep -o '<html[^>]*>' out/ja/index.html`) or inferred (read from source). Several real bugs, such as `lang="en"` on `/ja/`, only show in the export.

## Images

- Commit only the PNG sources in `apps/website/public/screenshots/`. `scripts/optimize-images.ts` (sharp) generates AVIF and WebP variants into the git-ignored `optimized/` folder on `bun run images` or the build. Widths and the byte budget live in `lib/images.ts`, and `website:verify` fails any variant over budget. Build-time sharp is used because the Next image optimizer does not work in a static export.
- To replace a screenshot, overwrite the PNG under the same name.
- Measure before optimizing: compare each file's bytes with its rendered width (1280px PNGs in a 700px slot once cost 796 KB instead of 160 KB). Assert in E2E that the browser really picks AVIF or WebP; markup alone does not prove it.

## Docs features

Check Fumadocs built-ins before writing a feature by hand, in the current Fumadocs docs and in the installed `node_modules/fumadocs-*` source (the site can be ahead of the pinned version): `llms()` from `fumadocs-core/source` (llms.txt, full text, per-page Markdown), page actions such as `MarkdownCopyButton` and `ViewOptionsPopover`, and the Steps, Tabs, Callout, Cards, and Accordion MDX components.

## Known traps

- **next-intl static export:**
  - Only one layout may render `<html>`. With both the root and `[locale]` layouts doing it, `/ja/` shipped `lang="en"`. The root layout passes children through, and root `not-found.tsx` renders its own `<html>`.
  - Root `/` exported as a JavaScript-only `__next_error__` redirect. It is now a meta-refresh page plus a `_redirects` rule (`/ /en/ 302`) that `scripts/generate-public-files.ts` writes from config before each build.
  - Read `metadata.title` from messages per locale, and check that a title template does not double the site name.
- **Docs metadata:** without `metadataBase`, `og:image` pointed at `http://localhost:3000`; `docs:verify` now catches this.
- **Docs languages:** English has no URL prefix, so no route segment names the language, and a static export has no middleware to rewrite `/faq` to `/en/faq`. A second `[lang]` route tree beside the root catch-all would win `/installation` in `next dev` (dynamic segments outrank catch-alls), and a layout inside the catch-all is keyed by the slug, so the sidebar would remount on every navigation. The root layout instead renders the client `DocsShell`, which reads the language from `usePathname()`; prerendering passes each page's path, so the exported HTML has the right `lang`. Check it in `out/` (`grep -o '<html[^>]*>' out/ja/faq.html`), and test a new locale with a throwaway `<page>.<tag>.mdx` that you delete before committing.
- **`next dev` edits `apps/docs/AGENTS.md`:** it appends a `nextjs-agent-rules` block. Restore the file with `git checkout apps/docs/AGENTS.md` (or keep your own edits and drop the block) before committing.
- **Website E2E:**
  - Spec files are `tests/e2e/*.spec.mts`. As `.ts`, Playwright loads them as CommonJS, which cannot import the ESM `@bookmark-scout/config`.
  - Every test stubs analytics; the real Umami request made the suite flaky. Wait for `networkidle` (hydration) before clicking client-side navigation.
  - Prove a flaky fix with `--repeat-each=3`.
  - `reuseExistingServer: !process.env.CI` means a local server already on the test port can serve an old build. Stop it before trusting a local run.
- **Bun scripts** that need Bun types get `/// <reference types="bun" />` at the top of that file only, so Bun globals do not leak into the Next app.
- **Docs Nx targets** come from `apps/docs/package.json` scripts plus its `"nx"` field (for example `verify` depends on `build`); there is no `project.json`.
- **Deploy path filters:** `deploy-website.yml` and `deploy-docs.yml` trigger on their app plus `config/**` and `packages/config/**` (the website also on `apps/extension/config/**`, for its AI provider list). A new shared input the sites read must be added to those filters and to the `sites` scope in `.github/ci-scopes.toml`.

## Hosting (Cloudflare Pages)

- Pages projects are named `bookmark-scout-<app>`, after the folder under `apps/`.
- `public/_headers` and the generated `public/_redirects` are Pages inputs. Zone-level Cloudflare settings can override `_headers`; confirm live headers with `curl -sI` after deploy.
- A new host, CDN, analytics, or any third party that sees visitor requests is a privacy change: update `apps/website/messages/privacy/{en,ja,ko}.json`, `store/privacy-policy.md`, and `[legal] privacy_effective_date` in `config/project.toml` in the same PR.
- Cutover order, so a working origin exists at every step:
  1. Deploy to the new host and check the `*.pages.dev` URL: content, `_headers`, and the `/` redirect.
  2. Back up DNS records to `~/.cache/`.
  3. Switch the apex and `www`.
  4. Wait out 522 responses (the custom domain is still initializing; recheck after about 20 minutes). A 526 means SSL "Full (strict)" in front of an origin without a valid certificate.
  5. Confirm the live apex serves the new content (grep for a known new string).
  6. Only then disable the old host.
- One-time infrastructure (projects, domains, DNS) goes in a local, idempotent script with `--dry-run` that names any missing token permission (`apps/website/scripts/setup-cloudflare.ts`), never in CI. Probe tokens read-only first and back up DNS records to `~/.cache/` before changing them.

## After merge

1. Find the deploy runs for the merge SHA: `gh run list --workflow deploy-website.yml` and `gh run list --workflow deploy-docs.yml`. A transient Cloudflare API error gets a rerun, not a code change.
2. Check live status codes with `curl -s -o /dev/null -w '%{http_code}'` for `/`, `/en/`, `/en/privacy/`, `/en/support/`, `/ja/`, `/.well-known/security.txt`, the `www` host, and the docs `/` and `/llms.txt`.
3. Check content too, not only status: grep each changed page for a known new string and confirm an optimized image variant is served.
4. Before blaming your merge for a red workflow or a broken page, check whether the failure predates it (`gh run list`, the hosting platform's state).
