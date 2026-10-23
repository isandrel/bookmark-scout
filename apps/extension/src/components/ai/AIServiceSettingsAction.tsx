/**
 * The way from an AI error that says the service wants an API key to that service's editor in
 * Options (`openAISettings(feature)`), where the key or Requires an API key is set.
 */
import type { ToastActionElement } from '@/components/ui/toast';

/** A toast button that opens the settings of the service `feature` uses. */
export function aiServiceSettingsToastAction(feature: AIFeature): ToastActionElement {
  return (
    <ToastAction onClick={() => void openAISettings(feature)}>
      {t('ai_openServiceSettings')}
    </ToastAction>
  );
}

/** `aiServiceSettingsToastAction` when `error` says the service wants an API key; else none. */
export function aiKeyRequiredToastAction(
  error: unknown,
  feature: AIFeature,
): ToastActionElement | undefined {
  return isAIKeyRequiredError(error) ? aiServiceSettingsToastAction(feature) : undefined;
}
