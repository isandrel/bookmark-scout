/**
 * Product screenshots (the store captures), shared by the website tour, social cards, and the
 * docs. Both sites serve the same files from `public/screenshots/`; a test checks that the
 * copies match. Alt text is copy, so it stays in each app.
 */

/** Every capture is 1280x800, the store screenshot size. */
export const SCREENSHOT_SIZE = { width: 1280, height: 800 } as const;

export const SCREENSHOTS = {
	popup: { light: "/screenshots/01-popup-light.png", dark: "/screenshots/01-popup-dark.png" },
	"quick-save": { light: "/screenshots/02-quick-save-light.png", dark: "/screenshots/02-quick-save-dark.png" },
	manager: { light: "/screenshots/03-manager-light.png", dark: "/screenshots/03-manager-dark.png" },
	duplicates: { light: "/screenshots/04-tools-duplicates-light.png", dark: "/screenshots/04-tools-duplicates-dark.png" },
	settings: { light: "/screenshots/05-settings-light.png", dark: "/screenshots/05-settings-dark.png" },
	"options-ai": { light: "/screenshots/06-options-ai-light.png", dark: "/screenshots/06-options-ai-dark.png" },
	"manager-cards": { light: "/screenshots/07-manager-cards-light.png", dark: "/screenshots/07-manager-cards-dark.png" },
} as const;

export type ScreenshotName = keyof typeof SCREENSHOTS;

export type ScreenshotPair = (typeof SCREENSHOTS)[ScreenshotName];

/** The capture used for Open Graph and Twitter cards and in structured data. */
export const SOCIAL_SCREENSHOT = { url: SCREENSHOTS.manager.dark, ...SCREENSHOT_SIZE } as const;
