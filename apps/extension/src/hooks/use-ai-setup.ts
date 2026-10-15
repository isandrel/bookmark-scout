/**
 * React hooks over `isAISetUp` (`services/ai-settings.ts`), for the surfaces that offer AI.
 */

/**
 * The service an AI feature uses (`pickAIService`; the default service without a feature), whether
 * it is set up (chosen, with an API key when its provider needs one, and for the built-in model,
 * downloaded and ready), and the built-in model's state when that is the service. `setUp` is
 * `undefined` until the stored services, and the model's state where it matters, are read.
 */
export function useAIFeatureService(feature?: AIFeature): {
  service: AIService | undefined;
  setUp: boolean | undefined;
  builtinStatus: BuiltinAIStatus | undefined;
} {
  const { state, isLoading: servicesLoading } = useAIServices();
  const { value: credentials, isLoading: credentialsLoading } =
    useStoredValue(aiProviderConfigValue);
  const service = pickAIService(state, feature);
  const builtin = service !== undefined && isBuiltinProvider(service.provider);
  const builtinStatus = useBuiltinAIStatus(builtin);
  const loading = servicesLoading || credentialsLoading || (builtin && !builtinStatus);
  return {
    service,
    setUp: loading ? undefined : isAISetUp(state, credentials, feature, builtinStatus),
    builtinStatus,
  };
}

/**
 * Whether the default AI service is set up, whether or not AI Features is on; `undefined` until
 * the stored services are read.
 */
export function useAIServiceSetUp(): boolean | undefined {
  return useAIFeatureService().setUp;
}

/**
 * Where AI stands for the AI buttons of one feature: `off` (AI Features off, or in Firefox without
 * data-sharing consent), `needsSetup` (on, but the feature's service is missing, has no API key, or
 * is the built-in model before it is ready), or `ready`. `loading` until the stored services are
 * read, so nothing flashes.
 */
export type AISetupState = 'loading' | 'off' | 'needsSetup' | 'ready';

export function useAISetup(feature: AIFeature | undefined): AISetupState {
  const aiEnabled = useEffectiveSetting('aiEnabled');
  const { setUp } = useAIFeatureService(feature);
  if (!aiEnabled || !feature) return 'off';
  if (setUp === undefined) return 'loading';
  return setUp ? 'ready' : 'needsSetup';
}
