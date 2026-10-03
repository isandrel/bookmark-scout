/**
 * Website pages under `/<locale>/docs/` that the docs site replaced, and the docs path each
 * one now points to. They stay so old links still land somewhere useful; add a row when a
 * published docs URL on the website moves.
 */
export const LEGACY_DOCS_REDIRECTS: Readonly<Record<string, `/${string}`>> = {
    "": "/",
    "getting-started": "/",
    features: "/features",
    contributing: "/contributing",
};
