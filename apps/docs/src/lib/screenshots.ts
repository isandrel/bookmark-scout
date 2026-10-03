import {
  SCREENSHOTS as CAPTURES,
  SCREENSHOT_SIZE,
  type ScreenshotName,
} from "@bookmark-scout/config";

export { SCREENSHOT_SIZE, type ScreenshotName };

/** Alt text for each shared capture (paths and size come from `@bookmark-scout/config`). */
const ALT: Record<ScreenshotName, string> = {
  popup:
    'The popup folder tree, and a search for "docs" with the matches highlighted',
  manager:
    "The bookmarks manager with the folder tree, the title and URL filters, and the bookmark table",
  duplicates:
    "The Duplicate Cleaner review over the manager, with the bookmark to keep in each group marked Keep",
  "options-ai":
    "The AI tab in Settings with AI Features turned off, the default",
};

/** Each capture has a light and a dark version; the page shows the one matching the theme. */
export const SCREENSHOTS = Object.fromEntries(
  (Object.keys(CAPTURES) as ScreenshotName[]).map((name) => [
    name,
    { ...CAPTURES[name], alt: ALT[name] },
  ]),
) as Record<ScreenshotName, { light: string; dark: string; alt: string }>;
