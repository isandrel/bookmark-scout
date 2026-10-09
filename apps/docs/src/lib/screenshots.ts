import {
  SCREENSHOTS as CAPTURES,
  SCREENSHOT_SIZE,
  type ScreenshotName,
} from "@bookmark-scout/config";
import { getCopy } from "@/lib/copy";

export { SCREENSHOT_SIZE, type ScreenshotName };

export type Screenshot = { light: string; dark: string; alt: string };

/**
 * A shared capture (paths and size from `@bookmark-scout/config`) with its alt text in the
 * page's language (`screenshots` in `src/lib/copy.ts`). Each capture has a light and a dark
 * version; the page shows the one matching the theme.
 */
export function getScreenshot(
  name: string,
  locale: string,
): Screenshot | undefined {
  if (!Object.hasOwn(CAPTURES, name)) return undefined;
  const key = name as ScreenshotName;
  const alt: Record<ScreenshotName, string> = getCopy(locale).screenshots;
  return { ...CAPTURES[key], alt: alt[key] };
}
