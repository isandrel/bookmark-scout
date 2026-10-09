// Turn raw captures into the eight store screenshots: frame the two popup captures on the brand
// paper color with a heading, copy the page captures, and convert everything to 24-bit RGB
// without alpha (the Chrome Web Store rejects alpha).
// Usage: bun compose-store-screenshots.ts <shots dir> <granted build dir> <output dir>
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [shots, build, out] = process.argv.slice(2).map((p) => path.resolve(p));
if (!shots || !build || !out) {
  throw new Error('Usage: bun compose-store-screenshots.ts <shots dir> <build dir> <output dir>');
}
mkdirSync(out, { recursive: true });

// Brand tokens from DESIGN.md.
const THEMES = {
  light: { paper: '#f4f7fb', ink: '#0f2135', soft: '#4a5b70', line: '#d6dfea', shadow: 'rgba(15,33,53,.14)' },
  dark: { paper: '#0d1b2a', ink: '#e8eff6', soft: '#9fb2c6', line: '#23394f', shadow: 'rgba(0,0,0,.5)' },
} as const;
const HEADING = 'Find and file bookmarks from the toolbar';
const SUBHEADING = 'Folder tree, instant search with match options, and one-click save to any folder';
const POPUP_CROP = '400x500+0+0';

const magick = (...args: string[]) => {
  const result = Bun.spawnSync(['magick', ...args]);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
};
const font = (prefix: string) =>
  [...new Bun.Glob(`assets/${prefix}-latin-wght-normal-*.woff2`).scanSync(build)][0];

const files: Record<string, string> = {
  '02-manager-light.png': 'manager-light.png',
  '03-tools-duplicates-light.png': 'duplicates-light.png',
  '04-options-ai-light.png': 'options-ai-light.png',
  '06-manager-dark.png': 'manager-dark.png',
  '07-tools-duplicates-dark.png': 'duplicates-dark.png',
  '08-options-ai-dark.png': 'options-ai-dark.png',
};
for (const [target, source] of Object.entries(files)) copyFileSync(path.join(shots, source), path.join(out, target));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const [scheme, t] of Object.entries(THEMES)) {
  for (const name of ['popup-tree', 'popup-search']) {
    magick(path.join(shots, `${name}-${scheme}.png`), '-crop', POPUP_CROP, '+repage', path.join(shots, `crop-${name}-${scheme}.png`));
  }
  const html = `<!doctype html><html><head><style>
@font-face{font-family:Display;src:url(file://${path.join(build, font('bricolage-grotesque'))})}
@font-face{font-family:Body;src:url(file://${path.join(build, font('instrument-sans'))})}
html,body{margin:0;width:1280px;height:800px;background:${t.paper};overflow:hidden}
h1{font:700 40px/1.1 Display;color:${t.ink};text-align:center;margin:52px 0 10px;letter-spacing:-.01em}
p{font:400 19px/1.4 Body;color:${t.soft};text-align:center;margin:0}
.row{display:flex;gap:56px;justify-content:center;margin-top:40px}
img{width:400px;height:500px;border-radius:14px;border:1px solid ${t.line};box-shadow:0 18px 40px ${t.shadow}}
</style></head><body><h1>${HEADING}</h1><p>${SUBHEADING}</p>
<div class="row"><img src="file://${shots}/crop-popup-tree-${scheme}.png"><img src="file://${shots}/crop-popup-search-${scheme}.png"></div>
</body></html>`;
  const htmlPath = path.join(shots, `compose-${scheme}.html`);
  await Bun.write(htmlPath, html);
  await page.goto(`file://${htmlPath}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, scheme === 'light' ? '01-popup-light.png' : '05-popup-dark.png') });
}
await browser.close();

magick('mogrify', '-alpha', 'off', '-type', 'TrueColor', '-define', 'png:color-type=2', path.join(out, '*.png'));
console.log(`Store screenshots: ${out}`);
