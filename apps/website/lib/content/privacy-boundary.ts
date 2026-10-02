/** Data-boundary diagram on the home page. Copy lives in messages under `home.privacy`. */

/** Data kept inside the browser boundary. */
export const BOUNDARY_INSIDE = ["bookmarks", "settings", "keys"] as const;

/** Opt-in paths out of the browser, drawn dashed. */
export const BOUNDARY_OUTBOUND = ["ai", "websites"] as const;

/** Facts listed beside the diagram. */
export const PRIVACY_FACTS = ["noServer", "noTelemetry", "aiOptIn", "exports"] as const;
