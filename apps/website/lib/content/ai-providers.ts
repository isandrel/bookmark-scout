import { readExtensionProviders } from "@/lib/extension-providers";

/**
 * Well-known providers the home page names, by the extension's provider id, in display order.
 * The extension supports many more; the page adds "and more" after these.
 */
const FEATURED_PROVIDER_IDS = ["openai", "anthropic", "google", "mistral", "ollama"] as const;

/** A trailing qualifier such as "(Local)" is the extension's settings label, dropped here. */
const displayName = (name: string) => name.replace(/\s*\([^)]*\)$/, "");

const providers = readExtensionProviders();

/** Featured provider names (proper nouns, not translated). Fails the build if one is gone. */
export const FEATURED_AI_PROVIDERS: readonly string[] = FEATURED_PROVIDER_IDS.map((id) => {
    const provider = providers.find((entry) => entry.id === id);
    if (!provider) throw new Error(`Featured AI provider "${id}" is not in apps/extension/config/ai/providers`);
    return displayName(provider.name);
});
