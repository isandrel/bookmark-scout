# AI Asset Prompts (Chrome Web Store)

Prompts for an external image and video model to make the Bookmark Scout store artwork. Paths are relative to the repository root.

## Rules for every asset

- **Never generate screenshots or product UI.** Store screenshots and the demo part of the video must show the real extension (`store/screenshots/`, captured with the `extension-exploratory-qa` runner). AI-drawn UI misrepresents the product.
- **Never let the model draw the logo or the name.** Leave empty space and place the real logo and text afterwards. Models distort logos and misspell text.
- **Brand:** calm "map reader" look: paper, ink, compass. Gradient only `#2bb3b1` → `#4f6ce0` → `#8a3fd1`. Paper `#f4f7fb` (light) or `#0d1b2a` (dark). Ink `#0f2135`. Marker highlight `#ffe27a`. Flat vector, soft shadows, no people.
- **Store image format:** exact pixel size, JPEG or 24-bit PNG, **no alpha**. Convert after generating:
  ```bash
  magick <file>.png -alpha off -type TrueColor -define png:color-type=2 <file>.png
  ```

## Input files (upload as references)

| File | Size | Use |
| --- | --- | --- |
| `apps/extension/public/icon-128.png` | 128×128, real transparency | Logo reference for shape and colors |
| `apps/website/public/icon.png` | 128×128, real transparency | Same logo, website copy |
| `store/assets/icon-original.png` | 2048×2048, **no alpha** | High-resolution logo. The grey checkerboard is painted into the pixels, not real transparency; tell the model to ignore it |
| `store/screenshots/promo-small-440x280.png` | 440×280 | Current small tile, for comparison only |

## Output files

Save raw model outputs outside the repository in `~/.cache/bookmark-scout-assets/raw/`. Put only the final, converted files at these paths:

| Asset | Final path | Size | Required |
| --- | --- | --- | --- |
| Logo master | `store/assets/logo-master-2048.png` | 2048×2048, real transparency | Source for the icon below |
| Store icon | `store/assets/store-icon-128.png` | 128×128, artwork about 96×96 centered | Exists (made from `icon-128.png`); regenerate from the master for a sharper result |
| Marquee promo tile | `store/assets/marquee-1400x560.png` | 1400×560, no alpha | Optional, needed for homepage features |
| Small promo tile | `store/screenshots/promo-small-440x280.png` (replace) | 440×280, no alpha | Yes, already uploaded once |
| Video intro | `~/.cache/bookmark-scout-assets/video/intro.mp4` | 1920×1080, 3 to 5 s | For the YouTube promo video |
| Video outro | `~/.cache/bookmark-scout-assets/video/outro.mp4` | 1920×1080, 3 to 5 s | For the YouTube promo video |

Videos stay out of the repository; the store takes a YouTube URL.

## 1. Logo master (clean transparency)

Input: `store/assets/icon-original.png`.

```text
Recreate this exact logo as a clean vector-style image, 2048x2048 px, on a truly transparent background. The grey and white checkerboard in the input is not part of the logo; remove it completely. Keep the shape, proportions, and colors identical: a bookmark ribbon with a notched bottom, a magnifier ring on top with a handle to the lower right, and an eight-point compass star inside the ring, colored with a teal-to-violet gradient (#2bb3b1 to #4f6ce0 to #8a3fd1). Do not add text, shadows, or a background. Center the artwork with equal padding.
```

Then make the store icon (artwork about 96 px on a 128 px canvas):

```bash
magick store/assets/logo-master-2048.png -trim -resize 96x96 -gravity center -background none -extent 128x128 store/assets/store-icon-128.png
```

## 2. Marquee promo tile (1400×560)

Input: `apps/extension/public/icon-128.png` (style reference only).

```text
Wide banner, exactly 1400x560 px, for a browser extension called "Bookmark Scout". Calm, premium, minimal. Background: soft paper white #f4f7fb with a very faint topographic map contour pattern and a subtle compass rose in the far right, low contrast. Left third: leave clean empty space for a logo and the name (do not draw any text or letters). Right two thirds: an abstract composition of floating bookmark ribbons and folder shapes arranged like a tidy map, a few connected by thin dotted route lines, one ribbon highlighted with a soft yellow marker glow #ffe27a. Color accents only from a teal-to-violet gradient #2bb3b1 to #4f6ce0 to #8a3fd1, ink color #0f2135 for thin line work. Flat vector illustration, soft shadows, no 3D, no people, no browser UI, no text, no watermark. Opaque background, no transparency.
```

Afterwards: place `store/assets/logo-master-2048.png` (about 200 px tall) and "Bookmark Scout" in Bricolage Grotesque, ink `#0f2135`, in the empty left third.

## 3. Small promo tile (440×280)

Input: `apps/extension/public/icon-128.png` (style reference only).

```text
Small tile, exactly 440x280 px, for the browser extension "Bookmark Scout". Centered composition: leave a clear empty square in the center (about 140x140 px) for the app logo; do not draw a logo or any text. Around it: a soft radial glow in the teal-to-violet gradient #2bb3b1 to #4f6ce0 to #8a3fd1 at low opacity, a faint topographic contour pattern, and two or three small bookmark ribbon shapes orbiting at the edges. Background paper white #f4f7fb. Flat vector, minimal, calm, readable at small size. No text, no letters, no UI, no watermark. Opaque background, no transparency.
```

Afterwards: place the logo (about 120 px) in the center. Google's guidance is to avoid text on promo tiles, so the name is optional.

## 4. Video intro and outro (16:9)

Input: `store/assets/logo-master-2048.png` (color reference only).

Intro:

```text
5-second brand intro, 16:9, 1920x1080. A single bookmark ribbon in a teal-to-violet gradient (#2bb3b1 to #8a3fd1) unfurls on a paper-white background (#f4f7fb) with faint topographic map lines; a small compass star spins once and settles on the ribbon, then the scene gently fades to plain #f4f7fb, leaving empty space in the center for a logo. Calm, smooth, slow camera, flat vector motion-graphics style. No text, no people, no browser interface.
```

Outro:

```text
4-second brand outro, 16:9, 1920x1080. Paper-white background (#f4f7fb) with faint topographic map lines drifting slowly; a soft teal-to-violet glow (#2bb3b1 to #8a3fd1) pulses once in the center, leaving a clean empty center area for a logo and a website address. Calm, flat vector motion-graphics style. No text, no people, no browser interface.
```

Afterwards: overlay the logo, and on the outro add `bookmark-scout.com`. The middle 30 to 45 seconds is a real screen recording of the extension (popup search and save, manager, Duplicate Cleaner, AI folder suggestions) made from the built extension with synthetic bookmarks.

## Check before uploading

```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha store/assets/marquee-1400x560.png store/screenshots/promo-small-440x280.png store/assets/store-icon-128.png
```

Tiles must report `hasAlpha: no`. The 128 px icon may keep transparency.
