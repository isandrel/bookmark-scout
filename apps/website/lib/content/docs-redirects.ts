/**
 * Website pages that were under `/<locale>/docs/` before the docs site replaced them, and the
 * docs path each one now points to. `scripts/generate-public-files.ts` turns each row into a
 * 301 in `_redirects` for every language, so old links still land somewhere useful; add a row
 * when a published docs URL on the website moves.
 */
export const LEGACY_DOCS_REDIRECTS: Readonly<Record<string, `/${string}`>> = {
    "": "/",
    "getting-started": "/",
    features: "/features",
    contributing: "/contributing",
};
