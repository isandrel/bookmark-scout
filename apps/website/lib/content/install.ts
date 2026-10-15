import { site } from "@bookmark-scout/config";

/** Per-browser install steps by hand. Copy lives in messages under `home.install.<id>`. */
export type InstallBrowser = {
    /** A browser id from `[browsers] supported` in config/project.toml. */
    id: string;
    /** Message keys under `home.install.<id>.steps`, in order. */
    steps: readonly string[];
    /** Optional message key under `home.install.<id>` shown after the steps. */
    note?: string;
};

export const INSTALL_BROWSERS: readonly InstallBrowser[] = [
    { id: "chrome", steps: ["download", "open", "load"], note: "crx" },
    { id: "edge", steps: ["download", "open", "load"] },
    { id: "firefox", steps: ["download", "open", "load"], note: "limits" },
];

/** Browsers whose store listing is live (`[stores]` in config/project.toml), in install order. */
export const LIVE_STORE_BROWSERS = INSTALL_BROWSERS.filter((browser) => site.store(browser.id).live);

/** Browsers still waiting for their store listing; the page says they are coming soon. */
export const UPCOMING_STORE_BROWSERS = INSTALL_BROWSERS.filter((browser) => !site.store(browser.id).live);
