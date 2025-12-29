/**
 * Simple wrapper around browser.i18n.getMessage
 * for type-safe i18n in the extension
 */

// Message keys available in messages.json
export type MessageKey =
	| "extName"
	| "extDescription"
	| "searchPlaceholder"
	| "newFolder"
	| "retry"
	| "error"
	| "folderCreated"
	| "errorCreatingFolder"
	| "bookmarkAdded"
	| "errorAddingBookmark"
	| "bookmarkDeleted"
	| "errorDeletingBookmark"
	| "folderDeleted"
	| "errorDeletingFolder"
	| "itemMoved"
	| "errorMovingItem"
	| "addBookmark"
	| "addFolder"
	| "deleteFolder"
	| "deleteBookmark"
	| "expandAll"
	| "collapseAll"
	| "enterFolderName"
	// Popup page
	| "noBookmarksFound"
	| "noBookmarksYet"
	| "tryDifferentSearch"
	| "lightMode"
	| "darkMode"
	// Options page
	| "settings"
	| "settingsDescription"
	| "searchSettings"
	| "loadingSettings"
	| "noSettingsMatch"
	| "settingsSaved"
	| "preferencesUpdated"
	| "errorSavingSettings"
	| "settingsReset"
	| "settingsResetDescription"
	| "errorResettingSettings"
	| "settingsExported"
	| "settingsExportedDescription"
	| "exportFailed"
	| "settingsImported"
	| "settingsImportedDescription"
	| "importFailed"
	| "invalidSettingsFile"
	| "export"
	| "import"
	| "resetAll"
	| "saving"
	| "saveChanges";

/**
 * Get localized message from browser.i18n
 * Falls back to key if message not found
 */
export function t(key: MessageKey, substitutions?: string | string[]): string {
	try {
		const message = browser.i18n.getMessage(key, substitutions);
		return message || key;
	} catch {
		// Fallback for non-extension environments (like tests)
		return key;
	}
}

/**
 * Hook for using i18n in React components
 * Returns the t function for translations
 */
export function useI18n() {
	return { t };
}
