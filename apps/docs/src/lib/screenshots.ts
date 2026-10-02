/**
 * Store screenshots (1280x800) copied from apps/website/public/screenshots.
 * Each has a light and a dark capture; the page shows the one matching the theme.
 */
export const SCREENSHOT_SIZE = { width: 1280, height: 800 } as const;

export const SCREENSHOTS = {
  popup: {
    light: "/screenshots/01-popup-light.png",
    dark: "/screenshots/05-popup-dark.png",
    alt: 'The popup folder tree, and a search for "docs" with the matches highlighted',
  },
  manager: {
    light: "/screenshots/02-manager-light.png",
    dark: "/screenshots/06-manager-dark.png",
    alt: "The bookmarks manager with the folder tree, the title and URL filters, and the bookmark table",
  },
  duplicates: {
    light: "/screenshots/03-tools-duplicates-light.png",
    dark: "/screenshots/07-tools-duplicates-dark.png",
    alt: "The Duplicate Cleaner review over the manager, with the bookmark to keep in each group marked Keep",
  },
  "options-ai": {
    light: "/screenshots/04-options-ai-light.png",
    dark: "/screenshots/08-options-ai-dark.png",
    alt: "The AI tab in Settings with AI Features turned off, the default",
  },
} as const;

export type ScreenshotName = keyof typeof SCREENSHOTS;
