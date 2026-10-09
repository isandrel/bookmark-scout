# Translation brief for subagents

Give each translator subagent one language and this brief, with `<TAG>` (BCP 47, such as `zh-CN`) and `<FOLDER>` (the extension folder, such as `zh_CN`) filled in. Two rounds: round 1 is the extension, store listing, and website; round 2 is the docs, which reuses round 1's glossary.

The repository is read only for translators. They write only to their staging folder, `~/.cache/bookmark-scout-i18n/<round>/<TAG>/`, and do not run git. The orchestrating agent copies validated files into the repository, so parallel translators never conflict.

## Round 1 outputs

1. `messages.json`: the extension UI, from `apps/extension/public/_locales/en/messages.json`.
2. `listing.md`: the store listing. Use an existing translation in `store/listings/` (such as `ja.md`) as the structural template (headings, code fences, tables), translate the English content of `store/listings/en.md`, and update the character counts in its table.
3. `website/messages.json`, `website/privacy.json`, `website/support.json`, from `apps/website/messages/en.json`, `privacy/en.json`, and `support/en.json`.
4. `glossary.md`: the term chosen for each feature and browser concept, for round 2 and later translators.

Read two existing translations of each file first, to see how names, tone, and length were handled.

### Rules for messages.json

- Translate only each entry's `message`. Copy `description` and `placeholders` exactly; the description says where the text appears.
- Keep every `$1` to `$9` and `$NAME$` token. A token may move within the sentence.
- `meta_languageName` is the language's own name (`简体中文`, `Español`, `Português (Brasil)`).
- `extName` stays `Bookmark Scout`. `extDescription` (the manifest summary) is 132 characters or fewer.
- Plurals: a key ending in `_one` is the singular of its base key, picked by `Intl.PluralRules`. Languages without a singular (Chinese, Japanese, Korean) omit `_one` keys of plural bases; the validator says which keys are optional. In French and Brazilian Portuguese `_one` is also used for 0, so it must read correctly for 0 and 1. Languages with `few` or `many` forms add `<key>_few` and `<key>_many`.
- Units, keys (Ctrl, Cmd, Enter), file formats (JSON, CSV, HTML, Markdown), URLs, and product names (Chrome, Firefox, Edge, OpenAI, Ollama) stay as they are.
- Browser terms match the browser's own translation in that language: "Bookmarks bar", "Other bookmarks", "Side panel", "Extensions", "Bookmark manager". Look up Chrome's wording, and Firefox's for Firefox-only concepts (Firefox's sidebar).
- Write with `JSON.stringify(object, null, 4)` plus a trailing newline, in the English key order.

### Rules for the website files

- Translate string values only. Keep every key, array length, ICU argument (`{count}`, including plural and select syntax: translate only the human text inside), tag (`<strong>`, `<a>`, `<code>`), URL, and email address. Keep `type`, `id`, `href`, and other structural values identical.
- `privacy.json` is the privacy policy: translate it faithfully, with no additions, omissions, or softening. Keep the note that the English version applies when a translation differs, and keep the Limited Use statement.
- Same indentation as the English file, plus a trailing newline.

## Round 2 outputs (docs)

Source: `apps/docs/content/docs/**/*.mdx` and the sidebar files `meta.json` and `guides/meta.json`. Read "Translating a docs page" in `apps/docs/README.md` first, and `apps/docs/src/mdx-components.tsx` to see what components render.

1. One file per English page at the same relative path, with the tag before the extension: `faq.<TAG>.mdx`, `guides/search.<TAG>.mdx`.
2. `meta.<TAG>.json` and `guides/meta.<TAG>.json`: translate `title`, `description`, and `---Section---` names; keep `pages` identical and in order.
3. `copy.<TAG>.ts`: the docs UI copy, starting from the `en` object in `apps/docs/src/lib/copy.ts`, exported as `export const <ident>` where `<ident>` is the tag without punctuation (`zhCN`, `ptBR`). Translate every string and every string a function returns; keep signatures and non-text fields. Translate the example search queries into what a user in that language would type. Fill `ui` with Fumadocs' own labels in that language (keys of Fumadocs' `Translations` type in `apps/docs/node_modules/fumadocs-ui`).

Docs rules:

- Frontmatter: translate only `title` and `description`.
- Keep every MDX component and prop, code fence, inline `code` span, link target, and image. Translate text between tags, table cells, list items, and callout text. A `<Callout title>` is text and may be translated.
- End every heading with its English id: `## <translated heading> [#<english-id>]`. The validator prints the expected id.
- Bold UI labels match the extension's wording in `apps/extension/public/_locales/<FOLDER>/messages.json` exactly, and the glossary from round 1.
- Bold that ends in punctuation and is followed directly by a letter does not render in CommonMark (`**设置。**然后`). Use `<strong>…</strong>` there, or move the punctuation outside.
- The privacy and permissions pages are legal-adjacent: translate faithfully.

## Style for both rounds

- Plain, specific, and concise, the way the browser's own UI and help centre read in that language. No hype, and no exclamation marks the English lacks.
- Address the user the way Chrome does in that language (German "Sie", French "vous", Spanish "tú", Brazilian Portuguese "você"; Chinese avoids "您" and "你" where it can).
- One term per concept everywhere: menu, settings, toasts, website, listing, docs.
- Store listings never name AI providers or other brands; describe kinds ("a cloud AI provider, any OpenAI-compatible endpoint, or a model server on your own computer"). The Chrome Web Store rejected a listing that named nine providers.
- Regional variants are native, not converted: zh-TW uses Taiwan terms (書籤, 資料夾, 設定, 檔案, 網路, 視窗), not a character conversion of zh-CN.

## Validate, then report

    bun .agents/skills/i18n-add-language/scripts/validate-extension.ts <FOLDER> ~/.cache/bookmark-scout-i18n/<round>/<TAG>/messages.json
    bun .agents/skills/i18n-add-language/scripts/validate-website.ts <TAG> ~/.cache/bookmark-scout-i18n/<round>/<TAG>/website
    bun .agents/skills/i18n-add-language/scripts/validate-docs.ts <TAG> ~/.cache/bookmark-scout-i18n/<round>/<TAG>
    bun .agents/skills/i18n-add-language/scripts/check-cjk-bold.ts ~/.cache/bookmark-scout-i18n/<round>/<TAG>

Run them from the repository root and fix everything until each prints OK. Then read the output once as a native reviewer would: awkward phrasing, leftover English, inconsistent terms. Report the files written, validator results, messages left identical to English and why, terminology choices, and anything a native speaker should check.
