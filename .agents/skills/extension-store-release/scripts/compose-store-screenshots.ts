// Turn raw captures into the store screenshots, in the promo video's style: brand paper with faint
// static contour lines, and the real UI large, flat, and upright in a window with a 1px line border
// and one soft shadow (no tilt, glow, gradient, or grain). The popup frame sets two popups side by
// side. Every output is 1280x800 24-bit RGB without alpha (the Chrome Web Store rejects alpha). No
// text is added, so one set suits every language; captions belong in each page's own copy.
// Usage: bun compose-store-screenshots.ts <shots dir> <output dir>
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [shots, out] = process.argv.slice(2).map((p) => path.resolve(p));
if (!shots || !out) {
  throw new Error('Usage: bun compose-store-screenshots.ts <shots dir> <output dir>');
}
mkdirSync(out, { recursive: true });

const FRAME = { width: 1280, height: 800 };
/** Page captures (1280x800, taken at 2x) shown at 7/8 size, with an even paper margin. */
const PAGE_WINDOW = { width: 1120, height: 700, radius: 16 };
/** Popup captures (400x500, taken at 2x) shown at 1.2x. */
const POPUP_WINDOW = { width: 480, height: 600, radius: 12, gap: 64 };

// Brand tokens from DESIGN.md; the dark contour line is the promo video's, a step fainter than Line.
const THEMES = {
  light: {
    paper: '#f4f7fb',
    contour: '#d6dfea',
    line: '#d6dfea',
    shadow: '0 30px 60px -28px rgba(15,33,53,.35), 0 2px 6px rgba(15,33,53,.06)',
  },
  dark: {
    paper: '#0d1b2a',
    contour: '#1d3046',
    line: '#23394f',
    shadow: '0 30px 60px -28px rgba(0,0,0,.65), 0 2px 6px rgba(0,0,0,.3)',
  },
} as const;

/** Output name prefix and the captures it shows: one page, or two popups side by side. */
const FRAMES: [string, string[]][] = [
  ['01-popup', ['popup-match', 'popup-ai']],
  ['02-quick-save', ['quick-save']],
  ['03-manager', ['manager']],
  ['04-tools-duplicates', ['duplicates']],
  ['05-settings', ['settings']],
  ['06-options-ai', ['options-ai']],
  ['07-manager-cards', ['manager-cards']],
];

/** The promo video's contour lines: deterministic, static, around three centers. */
const contours = (() => {
  const centers = [
    { x: 260, y: 900, rings: 9 },
    { x: 1700, y: 160, rings: 8 },
    { x: 1180, y: 1180, rings: 6 },
  ];
  return centers
    .flatMap((center) =>
      Array.from({ length: center.rings }, (_, index) => {
        const ring = index + 1;
        const radius = 70 * ring + 30;
        const points = Array.from({ length: 73 }, (_, step) => {
          const angle = (step / 72) * Math.PI * 2;
          const wobble =
            1 +
            0.09 * Math.sin(3 * angle + ring * 0.7 + center.x) +
            0.05 * Math.sin(5 * angle - ring * 0.4) +
            0.03 * Math.sin(7 * angle + center.y);
          const x = center.x + radius * 1.25 * wobble * Math.cos(angle);
          const y = center.y + radius * 0.85 * wobble * Math.sin(angle);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        return `<path d="M${points.join('L')}Z"/>`;
      }),
    )
    .join('');
})();

const magick = (...args: string[]) => {
  const result = Bun.spawnSync(['magick', ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: FRAME });
for (const [scheme, theme] of Object.entries(THEMES)) {
  for (const [target, sources] of FRAMES) {
    const size = sources.length > 1 ? POPUP_WINDOW : PAGE_WINDOW;
    const windows = sources
      .map((source) => `<img src="file://${path.join(shots, `${source}-${scheme}.png`)}" alt="">`)
      .join('');
    const html = `<!doctype html><html><head><style>
html,body{margin:0;width:${FRAME.width}px;height:${FRAME.height}px;overflow:hidden;background:${theme.paper}}
svg{position:absolute;inset:0;width:100%;height:100%}
path{fill:none;stroke:${theme.contour};stroke-width:1;vector-effect:non-scaling-stroke}
.row{position:relative;display:flex;gap:${POPUP_WINDOW.gap}px;justify-content:center;align-items:center;height:100%}
img{display:block;width:${size.width}px;height:${size.height}px;border:1px solid ${theme.line};border-radius:${size.radius}px;box-shadow:${theme.shadow}}
</style></head><body>
<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${contours}</svg>
<div class="row">${windows}</div>
</body></html>`;
    const htmlPath = path.join(shots, `compose-${target}-${scheme}.html`);
    await Bun.write(htmlPath, html);
    await page.goto(`file://${htmlPath}`);
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    await page.screenshot({ path: path.join(out, `${target}-${scheme}.png`) });
  }
}
await browser.close();

// Bun.spawnSync runs no shell, so expand the file list here rather than passing a glob.
const outputs = [...new Bun.Glob('*.png').scanSync(out)].map((file) => path.join(out, file));
// ImageMagick 7.1.2-33 cannot tell mogrify's output format without -format.
magick('mogrify', '-format', 'png', '-alpha', 'off', '-type', 'TrueColor', '-define', 'png:color-type=2', ...outputs);
console.log(`Store screenshots: ${out}`);
