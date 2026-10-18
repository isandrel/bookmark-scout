/**
 * What the popup and side panel read before their first render (`mountExtensionPage`'s
 * `preload`). Each part decides whether a row or button is on screen: the AI buttons in the
 * header (settings, services, keys, the built-in model's state, permissions), the current page
 * and where it is saved, recent folders, the last quick save, and the shortcut notice. Read
 * afterwards, each would appear a moment after the page and move what is under the pointer.
 *
 * The tree is not read here. It replaces the loading skeleton in place, so it moves nothing, and
 * on a large library its read is the slow part: started here it delayed the other reads (the
 * browser answers bookmark calls one at a time) and the first render (`popup.open` went from
 * about 190 to 290 ms in `tests/perf`).
 */

/** The AI features whose buttons the header shows (`PopupPage`). */
const HEADER_AI_FEATURES: readonly AIFeature[] = ['folderRecommendation', 'askAI'];

/** Reads the built-in model's state when a header AI feature uses it, as `useAISetup` will. */
async function preloadAISetup(): Promise<void> {
  await Promise.all([
    preloadStoredValue(aiServicesStateValue),
    preloadStoredValue(aiProviderConfigValue),
  ]);
  const state = getStoredValueStore(aiServicesStateValue).getSnapshot().value;
  const usesBuiltin = HEADER_AI_FEATURES.some((feature) => {
    const service = pickAIService(state, feature);
    return service !== undefined && isBuiltinProvider(service.provider);
  });
  if (usesBuiltin) await getBuiltinAIStatus();
}

export function preloadPopupPage(): Promise<unknown> {
  return Promise.all([
    preloadStoredValue(settingsValue),
    preloadSettingPermissions(),
    preloadAISetup(),
    preloadCurrentPageLine(),
    preloadRecentFolders(),
    preloadStoredValue(quickSaveRecordValue),
    preloadStoredValue(dismissedNoticesValue),
    preloadCommandShortcuts(),
  ]);
}
