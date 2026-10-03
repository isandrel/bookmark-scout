import { SCREENSHOTS, type ScreenshotPair } from "@bookmark-scout/config";

/** Product tour tabs on the home page. Copy lives in messages under `home.tour.<id>`. */
export type TourTabId = "find" | "organize" | "cleanUp" | "ai";

export type TourTab = {
    id: TourTabId;
    /** Light and dark captures from the shared screenshot manifest. */
    screenshot: ScreenshotPair;
    /** Whether the tab also lists the supported AI providers. */
    listsProviders: boolean;
};

/** Rendered width of a tour screenshot, for `sizes`: two thirds of the 1152px container on wide screens. */
export const SCREENSHOT_SIZES = "(min-width: 1152px) 704px, (min-width: 1024px) 62vw, calc(100vw - 2rem)";

export const TOUR_TABS: readonly TourTab[] = [
    { id: "find", screenshot: SCREENSHOTS.popup, listsProviders: false },
    { id: "organize", screenshot: SCREENSHOTS.manager, listsProviders: false },
    { id: "cleanUp", screenshot: SCREENSHOTS.duplicates, listsProviders: false },
    { id: "ai", screenshot: SCREENSHOTS["options-ai"], listsProviders: true },
];
