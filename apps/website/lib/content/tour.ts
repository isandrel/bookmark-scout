/** Product tour tabs on the home page. Copy lives in messages under `home.tour.<id>`. */
export type TourTabId = "find" | "organize" | "cleanUp" | "ai";

export type TourTab = {
    id: TourTabId;
    /** Screenshot paths under `public/`, 1280x800. */
    screenshot: { light: string; dark: string };
    /** Whether the tab also lists the supported AI providers. */
    listsProviders: boolean;
};

/** Rendered width of a tour screenshot, for `sizes`: two thirds of the 1152px container on wide screens. */
export const SCREENSHOT_SIZES = "(min-width: 1152px) 704px, (min-width: 1024px) 62vw, calc(100vw - 2rem)";

export const SCREENSHOT_SIZE = { width: 1280, height: 800 } as const;

export const TOUR_TABS: readonly TourTab[] = [
    {
        id: "find",
        screenshot: { light: "/screenshots/01-popup-light.png", dark: "/screenshots/05-popup-dark.png" },
        listsProviders: false,
    },
    {
        id: "organize",
        screenshot: { light: "/screenshots/02-manager-light.png", dark: "/screenshots/06-manager-dark.png" },
        listsProviders: false,
    },
    {
        id: "cleanUp",
        screenshot: {
            light: "/screenshots/03-tools-duplicates-light.png",
            dark: "/screenshots/07-tools-duplicates-dark.png",
        },
        listsProviders: false,
    },
    {
        id: "ai",
        screenshot: { light: "/screenshots/04-options-ai-light.png", dark: "/screenshots/08-options-ai-dark.png" },
        listsProviders: true,
    },
];
