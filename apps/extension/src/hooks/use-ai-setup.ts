/**
 * React hooks over `isAISetUp` (`services/ai-settings.ts`), for the surfaces that offer AI.
 */

/**
 * Whether the default AI service is set up (chosen, and with an API key when its provider needs
 * one), whether or not AI Features is on; `undefined` until the stored services are read.
 */
export function useAIServiceSetUp(): boolean | undefined {
  const { state, isLoading: servicesLoading } = useAIServices();
  const { value: credentials, isLoading: credentialsLoading } =
    useStoredValue(aiProviderConfigValue);
  if (servicesLoading || credentialsLoading) return undefined;
  return isAISetUp(state, credentials);
}

/**
 * Where AI stands for the AI buttons: `off` (AI Features off, or in Firefox without data-sharing
 * consent), `needsSetup` (on, but the default service is missing or has no API key), or `ready`.
 * `loading` until the stored services are read, so nothing flashes.
 */
export type AISetupState = 'loading' | 'off' | 'needsSetup' | 'ready';

export function useAISetup(): AISetupState {
  const aiEnabled = useEffectiveSetting('aiEnabled');
  const setUp = useAIServiceSetUp();
  if (!aiEnabled) return 'off';
  if (setUp === undefined) return 'loading';
  return setUp ? 'ready' : 'needsSetup';
}
