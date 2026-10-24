# Store and marketing screenshots

One image set serves every store, the website, and the docs. The record of how the current set was made is "How they were made" in `store/README.md`; update it with every recapture.

## What the capture script does

`scripts/capture-store-screenshots.ts` (run through the `extension-exploratory-qa` runner) seeds the tech and AI bookmark tree of the promo video (AI / LLMs / Fine-tuning, AI / Agents, AI / Papers, Dev, Design / UI, Tools, Reading list) on real public sites and saves their real icons with Refresh Site Icons. The granted build from `scripts/prepare-granted-build.ts` skips the permission prompts; real sites are refreshed before any route is registered, then the article origins through temporary bookmarks, and the run stops if any origin is left without an icon. It answers the three original article pages in `assets/pages/` locally on the reserved example domains (each with its own neutral icon), stubs the popup's active tab, the AI provider, and the built-in `LanguageModel`, and captures light and dark at 2x. The cards frame comes last, so no other frame counts its bookmarks: the articles join Reading list, and Fetch Covers keeps each one's preview image, which is the article's own top rendered locally and named by an og:image tag only in the copy Fetch Covers reads; every other request is aborted during that run, so no third-party image is fetched.

`scripts/compose-store-screenshots.ts` puts each capture in a window with a 1px line border and one soft shadow on brand paper with faint static contour lines, sets the popup pair side by side, and writes fourteen 1280×800 RGB PNGs with no alpha.

## Rules the maintainer set

- The example and the look follow the promo video, at the maintainer's request (2026-10-18); the frames before that used everyday, non-developer bookmarks.
- Frames carry no added text (no headline baked in), so one set suits every language; captions belong in each page's copy.
- Each frame must show something the others do not: the maintainer rejected a second popup frame that only added a Recent entry, which became stubbed AI folder suggestions instead (with AI turned off again before the Options captures, PR #606).
- A new capture name goes in `SCREENSHOTS` (`packages/config/src/screenshots.ts`) with alt text in `apps/docs/src/lib/copy*.ts` and the website messages for every language.
- New dismissible notices must be dismissed in the capture script, or they appear in every popup frame.
- Promo art (icon, tiles, logo master) is not captured. Its prompts, inputs, and output paths are in `store/ai-asset-prompts.md`. Never use AI-generated UI as screenshots.

## Traps when capturing by hand

- A fresh profile shows generic globe icons, because the browser's favicon cache is empty. Run Refresh Site Icons first in a copy of the build with optional website access pre-granted.
- Stub `tabs.query` so the popup's "current tab" is a public page, not the extension page.
- Keep the app theme on `system` and switch with `page.emulateMedia({ colorScheme })`.
- Export 1280×800 24-bit RGB PNGs without alpha (Chrome rejects alpha): `magick mogrify -format png -alpha off -type TrueColor -define png:color-type=2 *.png` (ImageMagick 7.1.2-33 and later fail without `-format png`).
- Compose frames and the 440×280 promo tile by rendering HTML in the same runner.
