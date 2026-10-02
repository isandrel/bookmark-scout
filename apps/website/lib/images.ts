/**
 * Responsive image variants generated at build time by `scripts/optimize-images.ts`
 * from the PNG sources in `public/`. Components build `srcset` values from the same
 * settings, so the two can never disagree.
 */
export const IMAGE_FORMATS = ["avif", "webp"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** Widths generated for each source image, in pixels. */
export const SCREENSHOT_WIDTHS = [640, 960, 1280] as const;

/** Encoder quality per format (sharp scale, 1-100). */
export const IMAGE_QUALITY: Record<ImageFormat, number> = { avif: 55, webp: 78 };

/** Largest allowed generated file; `verify-build.ts` fails above this. */
export const IMAGE_BYTE_BUDGET = 80 * 1024;

/** Public folders whose PNGs are optimized, and where the variants are written. */
export const IMAGE_SOURCE_DIRS = ["screenshots"] as const;
export const OPTIMIZED_DIR = "optimized";

/** `/screenshots/02-manager-light.png` -> `/screenshots/optimized/02-manager-light-960.webp` */
export function variantPath(src: string, width: number, format: ImageFormat): string {
    const slash = src.lastIndexOf("/");
    const name = src.slice(slash + 1).replace(/\.png$/, "");
    return `${src.slice(0, slash)}/${OPTIMIZED_DIR}/${name}-${width}.${format}`;
}

export function srcSet(src: string, format: ImageFormat, widths: readonly number[] = SCREENSHOT_WIDTHS): string {
    return widths.map((width) => `${variantPath(src, width, format)} ${width}w`).join(", ");
}
