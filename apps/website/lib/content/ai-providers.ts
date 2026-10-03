import { readExtensionProviders } from "@/lib/extension-providers";

/** Provider groups the website lists by name; custom endpoints get one generic entry in copy. */
const CUSTOM_GROUP = "custom";

/**
 * AI providers the extension supports, in the extension's own order and naming. Proper nouns,
 * not translated; a trailing qualifier such as "(Local)" is the extension's settings label and
 * is dropped here.
 */
export const AI_PROVIDERS: readonly string[] = readExtensionProviders()
    .filter((provider) => provider.group !== CUSTOM_GROUP)
    .map((provider) => provider.name.replace(/\s*\([^)]*\)$/, ""));
