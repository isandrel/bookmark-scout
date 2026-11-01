# Codemods and library migrations

Read this before a repository-wide codemod or a library migration that several agents land.

- Record a baseline on `origin/main` first (lint warning count, unit and E2E totals; the type check must stay at zero errors) and diff against it, so existing failures are not blamed on the change.
- Write codemods as TypeScript-AST scripts outside the repository (under `~/.cache/`), importing `typescript` by absolute path. Afterwards grep for leftovers and check the diff for whitespace artifacts; one import codemod left extra blank lines in 28 files, found only after the PR opened.
- Before widening WXT `imports.dirs`, list name collisions from the `wxt prepare` warnings and `.wxt/types/imports.d.ts`, and exclude barrels with `'!**/index.ts'`. After switching branches, run `bunx wxt prepare` before comparing `tsc` output; `.wxt/` types go stale.
- Converting `chrome.*` to `browser.*` breaks unit tests that stub the `chrome` global; rewrite them with WXT's `fakeBrowser` and confirm each still fails on the regression it guards.
- Land a repository-wide codemod when few PRs are open: every open PR conflicts mechanically afterwards. Resolve by taking `main`'s side, then `wxt prepare` and lint.
- Report the migration as a before/after table against the baseline (lint warnings, unit and E2E totals, three builds, `tsc` errors), plus light and dark captures, and list behavior changes you flagged but did not patch.
- Point third-party migration skills' reports at `~/.cache/` (the root `AGENTS.md`, "Change discipline").
