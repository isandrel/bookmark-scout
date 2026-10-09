---
name: i18n-add-language
description: Add a new language (or regional variant) to Bookmark Scout across every surface - extension UI, store listings, marketing website, and docs site - with translator subagents, bundled validators, and the pitfalls from adding eight languages at once. Use whenever the user asks to support, add, or translate into another language or locale, asks which languages to add next, wants a translation reviewed or re-validated, or reports text, fonts, plurals, or bold formatting looking wrong in a non-English language, even if they name only one surface ("translate the docs into Italian").
---

# Add a language (Bookmark Scout)

A language touches four surfaces that each have their own rules. This skill is the order to do them in and what went wrong last time. The per-app mechanics live in the app files, so read the section for each surface before editing it:

- Extension: "Localization" in `apps/extension/AGENTS.md`
- Website: "Localization expectations" and the config paragraph in `apps/website/AGENTS.md`
- Docs: "Languages" in `apps/docs/AGENTS.md` and "Translating a docs page" in `apps/docs/README.md`

## Names for one language

| Use | Form | Example |
| --- | --- | --- |
| Config lists, website and docs URLs and files, `<html lang>` | BCP 47 tag | `zh-CN`, `pt-BR` |
| Extension `_locales` folder, `SupportedLocale`, store listing file | Chrome folder code | `zh_CN`, `pt_BR` |
| Docs UI copy identifier | Tag without punctuation | `zhCN`, `ptBR` |

`toLanguageTag` in `apps/extension/src/hooks/use-i18n.ts` converts folder codes to tags. Never type a list of languages in code; read `[locales]` in `config/project.toml`.

## Choosing languages and variants

- Prefer languages Chrome and Firefox ship UI in, and check how many users the stores report for them.
- One file per written standard, not per country. Map the other regions with `LANGUAGE_ALIASES` in `use-i18n.ts` (`zh-HK` and `zh-MO` read `zh_TW`, `pt-PT` reads `pt_BR`) and add a unit case to `tests/unit/i18n-locale-loading.test.ts`.
- Chinese needs two real translations: `zh-CN` (Simplified, mainland terms) and `zh-TW` (Traditional, Taiwan terms). Never generate one from the other.
- For a regional term choice (Spanish "panel lateral" or "barra lateral"), use the browser's own term in that language. Chrome's Spanish docs and UI say "panel lateral" for the side panel in both `es` and `es-419`; Firefox says "barra lateral" for its sidebar. The repository already uses "barra lateral" for the manager's Tools sidebar, so keep the two apart.

## Order of work

Split it into pull requests that each pass CI on their own:

1. **Wiring (no translations yet).**
   - Add the tag to `[locales] extension`, `[locales] supported`, `[locales.names]`, and `[locales.og]` in `config/project.toml`.
   - Add the folder to `SupportedLocale` and a `react-day-picker` locale to `calendarLocales` in `src/components/ui/calendar.tsx`. The type check fails until both exist.
   - Add aliases.
   - Add font stacks where the script needs them: `:root:lang(<tag>)` in `apps/extension/src/styles/theme.css`, and `html:lang(<tag>) body, .font-sans, .font-display` in `apps/website/app/globals.css`.
   - The website's `@theme inline` tokens ignore a CSS variable override, so set `font-family` directly as the existing Chinese and Korean rules do.
   - Update both `DESIGN.md` files.
   - A language listed in config with no files is fine for the docs (English fallback), not for the website or extension, so land this together with step 2 or keep the tag out of `supported` until then.
2. **Extension, store listing, website.** One translator subagent per language, using round 1 of `references/translation-brief.md`.
   - Each translator writes to `~/.cache/bookmark-scout-i18n/round1/<TAG>/`, never into the repository, so parallel agents do not collide.
   - The orchestrating agent validates each language, then copies its files into place:
     - `apps/extension/public/_locales/<FOLDER>/messages.json`
     - `store/listings/<FOLDER>.md`
     - `apps/website/messages/<TAG>.json`, `privacy/<TAG>.json`, `support/<TAG>.json`
3. **Docs.** Round 2 of the brief, reusing round 1's `glossary.md`.
   - Copy pages to `apps/docs/content/docs/**/<page>.<TAG>.mdx` and `meta.<TAG>.json`.
   - Copy the UI copy to `apps/docs/src/lib/copy/<TAG>.ts`, then import it into `TRANSLATIONS` in `apps/docs/src/lib/copy.ts`.
4. **Store dashboards (maintainer).** The Chrome Web Store adds a listing language for each `_locales` folder in the uploaded package; Edge needs each language's description and images entered by hand. Paste from `store/listings/<FOLDER>.md` after the release that contains the folder. See `extension-cws-submission`.

Fix the English source before translating. A stale English claim (the docs once said Firefox could not open the manager) gets copied into every language, and then needs fixing in nine places.

## Validators

Run these from the repository root, on staged output or, without the path argument, on the repository files:

```bash
bun .agents/skills/i18n-add-language/scripts/validate-extension.ts <FOLDER> [messages.json]
bun .agents/skills/i18n-add-language/scripts/validate-website.ts <TAG> [staging dir]
bun .agents/skills/i18n-add-language/scripts/validate-docs.ts <TAG> [staging dir]
bun .agents/skills/i18n-add-language/scripts/check-cjk-bold.ts <file or dir>...
```

They check what the repository's own tests and builds do not, or check it earlier:

| Script | Checks |
| --- | --- |
| `validate-extension.ts` | Keys, placeholders, `Intl.PluralRules` forms, `extDescription` of 132 characters or fewer, and format. It also counts messages left identical to English. |
| `validate-website.ts` | Keys, array lengths, ICU arguments, tags, URLs, and structural values |
| `validate-docs.ts` | Components, links, code, and the English heading id on every heading |

`check-cjk-bold.ts` finds bold that CommonMark will not render.

## Pitfalls seen

- **Bold next to CJK punctuation.** `**设置。**然后` renders literal asterisks: a closing `**` after punctuation must be followed by space or punctuation. Use `<strong>`. Korean hit this 13 times.
- **Plurals.** `tPlural` picks `<key>_<category>`. French and Brazilian Portuguese use `_one` for 0 too. Chinese, Japanese, and Korean have only `other`. Plural keys are the English keys that have an `_one` form; `tests/unit/locale-messages.test.ts` lists missing forms.
- **Long German compounds** overflowed a mobile heading. The website's h1 to h3 use `overflow-wrap: break-word; hyphens: auto`; check new pages at 375 px wide.
- **Browser terms.** Use the browser's own wording for "Bookmarks bar", "Other bookmarks", "Side panel", and "Bookmark manager". Users match labels against their browser.
- **Store listings** never name AI providers (rejected once for keyword spam). The brief says so; check each translated listing anyway.
- **Language setting.** The option that follows the browser is called "Browser setting", not "Auto"; keep that wording in every language.
- **Docs Callout titles** are human text and are translated; every other component prop stays identical.
- **Strict E2E locators.** Adding a language can add a second matching element (two `details summary` on a page). Use `:visible` or a scoped locator.

## Verify

```bash
nx run extension:typecheck
nx run extension:test:unit
nx run extension:build:chrome
nx run website:verify
nx run website:test:e2e
nx run docs:types:check
nx run docs:build
bun run --cwd apps/docs verify
```

Then look at the popup, options page, and manager with Language set to the new language. Use `extension-exploratory-qa` for screenshots, the website home and privacy pages, and one docs page with its search. Report what a native speaker should review; machine translation is not reviewed translation.
