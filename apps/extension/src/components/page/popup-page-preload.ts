/**
 * What the popup and side panel read before their first render (`mountExtensionPage`'s
 * `preload`). Each part decides whether a row or button is on screen: the AI buttons in the
 * header (settings, services, keys, the built-in model's state, permissions), the current page
 * and where it is saved, recent folders, the last quick save, the shortcut notice, and the tree.
 * Read afterwards, each would appear a moment after the page and move what is under the pointer.
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
    preloadCurrentPage(),
    preloadRecentFolders(),
    preloadStoredValue(quickSaveRecordValue),
    preloadStoredValue(dismissedNoticesValue),
    preloadCommandShortcuts(),
    useBookmarkStore.getState().loadFolders(),
  ]);
}
