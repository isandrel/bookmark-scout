/// <reference types="bun" />
/**
 * Generates AVIF and WebP variants of the PNG sources listed in `lib/images.ts`.
 * Runs before `next dev` and `next build`; skips variants newer than their source.
 *
 *   bun scripts/optimize-images.ts [--force]
 */
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import {
    IMAGE_FORMATS,
    IMAGE_QUALITY,
    IMAGE_SOURCE_DIRS,
    OPTIMIZED_DIR,
    SCREENSHOT_WIDTHS,
    variantPath,
} from "../lib/images";

const publicDir = resolve(import.meta.dir, "..", "public");
const force = process.argv.includes("--force");
let written = 0;
let skipped = 0;

for (const dir of IMAGE_SOURCE_DIRS) {
    const sourceDir = join(publicDir, dir);
    mkdirSync(join(sourceDir, OPTIMIZED_DIR), { recursive: true });
    for (const file of readdirSync(sourceDir).filter((name) => name.endsWith(".png"))) {
        const sourcePath = join(sourceDir, file);
        const sourceTime = statSync(sourcePath).mtimeMs;
        for (const width of SCREENSHOT_WIDTHS) {
            for (const format of IMAGE_FORMATS) {
                const outPath = join(publicDir, variantPath(`/${dir}/${file}`, width, format));
                try {
                    if (!force && statSync(outPath).mtimeMs >= sourceTime) {
                        skipped++;
                        continue;
                    }
                } catch {
                    // Missing variant: generate it.
                }
                await sharp(sourcePath)
                    .resize({ width, withoutEnlargement: true })
                    [format]({ quality: IMAGE_QUALITY[format], effort: format === "avif" ? 4 : 5 })
                    .toFile(outPath);
                written++;
            }
        }
    }
}

console.log(`Images: ${written} generated, ${skipped} up to date.`);
