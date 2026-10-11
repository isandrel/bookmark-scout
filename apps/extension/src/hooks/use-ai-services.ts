/**
 * React hook over `lib/ai-services-storage.ts`, which stays free of React for the background.
 */

/** Live services state for React, following changes from any page. */
export function useAIServices(): { state: AIServicesState; isLoading: boolean } {
  const { value: state, isLoading } = useStoredValue(aiServicesStateValue);
  return { state, isLoading };
}
