# Settings behavior matrix

[`settings-matrix.ts`](./settings-matrix.ts) maps every setting in `src/lib/settings-schema.ts` to:

- `consumer`: the file under `src/` that reads the setting at runtime.
- `tests`: one or more unit or end-to-end tests that change the setting and assert a different result.
- `status`: `tested`, or `unsupported` / `planned` with a `reason` when a setting cannot change behavior yet.

[`unit/settings-matrix.test.ts`](./unit/settings-matrix.test.ts) fails when:

- a schema setting has no matrix entry, or an entry names a setting that no longer exists;
- a consumer file is missing or never mentions its setting;
- a referenced test file or exact `test()` / `it()` title does not exist.

The referenced tests run in CI, so a supported setting whose behavior regresses fails its test.

## Adding or changing a setting

1. Add the matrix entry in the same change as the schema field.
2. Point it at a test that flips the saved value and asserts what the user would see (a UI change, an exported file, a provider request, or a service result). A test that only checks the value was saved does not count.
3. If the setting does nothing yet, mark it `planned` or `unsupported` with a reason instead of listing a test.
4. When renaming a test that the matrix references, update the matrix too.

## Current exceptions

- `unsupported`: `autoTaggingDefaultScope`, `summarizerDefaultScope` (always the current folder), `duplicatesDefaultScope`, and `privacyScannerDefaultScope` (always all bookmarks). Options offers one value for each.
- Prompt-level only: AI tag count and style, summary length, and reorganization folder limits are sent to the provider; provider compliance is not verified.
- Partly covered: `recentFoldersEnabled` and `recentFoldersMax` are asserted for the context menu, not the popup panel; `truncateLength` only shortens the page title in the popup AI suggestions header.
