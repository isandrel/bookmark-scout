import { DEFAULT_LOCALE } from "@/lib/i18n";
import { type LanguageListOptions, languageList } from "@/lib/languages";

/**
 * The product's languages from config, in its order and named in the page's language
 * (`<Languages />`, `<Languages of="extension" join="or" capitalize />`).
 */
export function Languages({
  locale = DEFAULT_LOCALE,
  ...options
}: LanguageListOptions & { locale?: string }) {
  return <>{languageList(locale, options)}</>;
}
