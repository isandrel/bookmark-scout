import { site } from "@bookmark-scout/config";
import { defineI18n } from "fumadocs-core/i18n";
import type { I18nProviderProps } from "fumadocs-ui/contexts/i18n";
import { getCopy } from "@/lib/copy";
import type { LocaleRouting } from "@/lib/locale-path";

/**
 * The docs languages come from `[locales]` in config/project.toml. English (the default) keeps
 * unprefixed URLs; every other language lives under `/<tag>/`. Translations sit next to the
 * English file (`faq.ja.mdx`, `meta.ja.json`), and a page without one falls back to English.
 */
export const i18n = defineI18n({
  defaultLanguage: site.locales.default,
  languages: [...site.locales.supported],
  hideLocale: "default-locale",
  parser: "dot",
});

export const DEFAULT_LOCALE = site.locales.default;
export const LOCALES: readonly string[] = site.locales.supported;

/** The language list in the shape the client-safe URL helpers take. */
export const LOCALE_ROUTING: LocaleRouting = {
  defaultLocale: DEFAULT_LOCALE,
  locales: LOCALES,
};

/**
 * What `<RootProvider i18n>` takes for one language: Fumadocs' UI labels in that language
 * (`ui` in `src/lib/copy.ts`) and the language switcher's list, each language by its own name.
 */
export function i18nProviderProps(locale: string) {
  return {
    locale,
    defaultLanguage: DEFAULT_LOCALE,
    hideLocale: i18n.hideLocale,
    translations: getCopy(locale).ui,
    locales: LOCALES.map((code) => ({
      locale: code,
      name: site.locales.name(code),
    })),
  } satisfies I18nProviderProps;
}
