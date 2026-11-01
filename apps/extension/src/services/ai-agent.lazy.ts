/**
 * The providers' own web search tools, which Ask AI offers when the user turns web search on
 * (`ask-ai-host.lazy.ts`). Each loads only its own provider package; like every `*.lazy.ts` file
 * this one is left out of auto-imports, so import it only with `import()` or from another lazy
 * module.
 */

/**
 * Built-in web search per provider, run by the provider itself. Each package types its tool
 * differently, so they are held as plain objects and typed as a tool where they join the set.
 * Each loads only its own provider package.
 */
export const WEB_SEARCH_TOOLS: Record<
  WebSearchProvider,
  (options: { maxUses: number }) => Promise<object>
> = {
  openai: async () => (await import('@ai-sdk/openai')).openai.tools.webSearch({}),
  anthropic: async ({ maxUses }) =>
    (await import('@ai-sdk/anthropic')).anthropic.tools.webSearch_20250305({ maxUses }),
  google: async () => (await import('@ai-sdk/google')).google.tools.googleSearch({}),
  xai: async () => (await import('@ai-sdk/xai')).xai.tools.webSearch({}),
};
