/** Per-browser install steps. Copy lives in messages under `home.install.<id>`. */
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
