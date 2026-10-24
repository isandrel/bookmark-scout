/**
 * What the popup and side panel show and in what order, as the user arranged it in Options >
 * Appearance > Popup: their parts below the search row (`popupSections`) and the buttons beside
 * the search box (`popupToolbarButtons`). Each setting is a list of the ids below in the user's
 * order, hidden ones marked (`src/lib/shown-ids.ts`). The ids are data, so a new part or button
 * is a new entry here, and it shows for everyone until they hide it.
 */

/** The popup's parts below the search row, in their default order. */
export const POPUP_SECTIONS = [
  'currentPage',
  'activeJobs',
  'quickSaveResult',
  'recentFolders',
  'aiSuggestions',
  'folderMatches',
  'tree',
  'notices',
  'hintBar',
] as const;
export type PopupSection = (typeof POPUP_SECTIONS)[number];

/** The bookmark tree always shows: hiding it would leave the popup with nothing to browse. */
export const POPUP_REQUIRED_SECTIONS: readonly PopupSection[] = ['tree'];

/** What Options calls each part. */
export const POPUP_SECTION_LABEL_KEYS = {
  currentPage: 'settings_popupSectionCurrentPage',
  activeJobs: 'settings_popupSectionActiveJobs',
  quickSaveResult: 'settings_popupSectionQuickSaveResult',
  recentFolders: 'settings_recentFoldersEnabled',
  aiSuggestions: 'settings_popupSectionAiSuggestions',
  folderMatches: 'settings_folderMatchesEnabled',
  tree: 'popup_bookmarkTree',
  notices: 'settings_popupSectionNotices',
  hintBar: 'settings_popupSectionHintBar',
} as const satisfies Record<PopupSection, MessageKey>;

/** The buttons beside the popup's search box, in their default order. */
export const POPUP_TOOLBAR_BUTTONS = [
  'expandAll',
  'openManager',
  'theme',
  'aiRecommend',
  'askAI',
  'serviceSwitcher',
] as const;
export type PopupToolbarButton = (typeof POPUP_TOOLBAR_BUTTONS)[number];

/** What Options calls each button. */
export const POPUP_TOOLBAR_BUTTON_LABEL_KEYS = {
  expandAll: 'popup_expandAll',
  openManager: 'popup_openManager',
  theme: 'settings_theme',
  aiRecommend: 'ai_folderRecommendation',
  askAI: 'askAI_open',
  serviceSwitcher: 'settings_popupToolbarServiceSwitcher',
} as const satisfies Record<PopupToolbarButton, MessageKey>;

/** The popup's parts in the order the user arranged them (`popupSections`). */
export function getPopupSections(stored: readonly string[]): PopupSection[] {
  return readShownIds(stored, POPUP_SECTIONS, POPUP_REQUIRED_SECTIONS);
}

/** The toolbar buttons in the order the user arranged them (`popupToolbarButtons`). */
export function getPopupToolbarButtons(stored: readonly string[]): PopupToolbarButton[] {
  return readShownIds(stored, POPUP_TOOLBAR_BUTTONS);
}
