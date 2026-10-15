// Turn raw captures into the store screenshots: frame the two popup captures side by side on the
// brand paper color, copy the page captures, and convert everything to 24-bit RGB without alpha
// (the Chrome Web Store rejects alpha). No text is added, so one set suits every language;
// headlines and captions belong in each page's own copy.
// Usage: bun compose-store-screenshots.ts <shots dir> <output dir>
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [shots, out] = process.argv.slice(2).map((p) => path.resolve(p));
if (!shots || !out) {
  throw new Error('Usage: bun compose-store-screenshots.ts <shots dir> <output dir>');
}
mkdirSync(out, { recursive: true });

// Brand tokens from DESIGN.md.
const THEMES = {
  light: { paper: '#f4f7fb', line: '#d6dfea', shadow: 'rgba(15,33,53,.14)' },
  dark: { paper: '#0d1b2a', line: '#23394f', shadow: 'rgba(0,0,0,.5)' },
} as const;
const POPUP_CROP = '400x500+0+0';

/** Page captures copied as they are: output name prefix, capture name. */
const PAGES: [string, string][] = [
  ['02-quick-save', 'quick-save'],
  ['03-manager', 'manager'],
  ['04-tools-duplicates', 'duplicates'],
  ['05-settings', 'settings'],
  ['06-options-ai', 'options-ai'],
];

const magick = (...args: string[]) => {
  const result = Bun.spawnSync(['magick', ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const [scheme, t] of Object.entries(THEMES)) {
  for (const [target, source] of PAGES) {
    copyFileSync(path.join(shots, `${source}-${scheme}.png`), path.join(out, `${target}-${scheme}.png`));
  }
  for (const name of ['popup-match', 'popup-ai']) {
    magick(path.join(shots, `${name}-${scheme}.png`), '-crop', POPUP_CROP, '+repage', path.join(shots, `crop-${name}-${scheme}.png`));
  }
  const html = `<!doctype html><html><head><style>
html,body{margin:0;width:1280px;height:800px;background:${t.paper};overflow:hidden}
.row{display:flex;gap:64px;justify-content:center;align-items:center;height:800px}
img{width:400px;height:500px;border-radius:16px;border:1px solid ${t.line};box-shadow:0 18px 40px ${t.shadow}}
</style></head><body>
<div class="row"><img src="file://${shots}/crop-popup-match-${scheme}.png"><img src="file://${shots}/crop-popup-ai-${scheme}.png"></div>
</body></html>`;
  const htmlPath = path.join(shots, `compose-${scheme}.html`);
  await Bun.write(htmlPath, html);
  await page.goto(`file://${htmlPath}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `01-popup-${scheme}.png`) });
}
await browser.close();

// Bun.spawnSync runs no shell, so expand the file list here rather than passing a glob.
const outputs = [...new Bun.Glob('*.png').scanSync(out)].map((file) => path.join(out, file));
// ImageMagick 7.1.2-33 cannot tell mogrify's output format without -format.
magick('mogrify', '-format', 'png', '-alpha', 'off', '-type', 'TrueColor', '-define', 'png:color-type=2', ...outputs);
console.log(`Store screenshots: ${out}`);
