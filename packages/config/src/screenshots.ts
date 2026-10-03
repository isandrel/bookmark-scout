/**
 * Product screenshots (the store captures), shared by the website tour, social cards, and the
 * docs. Both sites serve the same files from `public/screenshots/`; a test checks that the
 * copies match. Alt text is copy, so it stays in each app.
 */

/** Every capture is 1280x800, the store screenshot size. */
export const SCREENSHOT_SIZE = { width: 1280, height: 800 } as const;

export const SCREENSHOTS = {
	popup: { light: "/screenshots/01-popup-light.png", dark: "/screenshots/05-popup-dark.png" },
	manager: { light: "/screenshots/02-manager-light.png", dark: "/screenshots/06-manager-dark.png" },
	duplicates: {
		light: "/screenshots/03-tools-duplicates-light.png",
		dark: "/screenshots/07-tools-duplicates-dark.png",
	},
	"options-ai": { light: "/screenshots/04-options-ai-light.png", dark: "/screenshots/08-options-ai-dark.png" },
} as const;

export type ScreenshotName = keyof typeof SCREENSHOTS;

export type ScreenshotPair = (typeof SCREENSHOTS)[ScreenshotName];

/** The capture used for Open Graph and Twitter cards and in structured data. */
export const SOCIAL_SCREENSHOT = { url: SCREENSHOTS.manager.dark, ...SCREENSHOT_SIZE } as const;
