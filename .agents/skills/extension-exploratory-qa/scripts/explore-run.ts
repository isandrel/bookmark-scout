// Exploratory QA runner for a built Chromium extension.
// Usage (from the repository root):
//   QA_DIR=<scratch dir> RUN=<name> bun .agents/skills/extension-exploratory-qa/scripts/explore-run.ts <step.ts>
// EXT defaults to apps/extension/dist/chrome-mv3; set HEADED=1 to watch the browser.
// The step module default-exports `async (ctx: Ctx) => void`.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';

export type Ctx = {
  context: BrowserContext;
  id: string;
  sw: Worker;
  open: (pagePath: string, width?: number, height?: number) => Promise<Page>;
  shot: (page: Page, name: string, fullPage?: boolean) => Promise<void>;
  log: (line: string) => void;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const ext = path.resolve(process.env.EXT ?? path.join(repoRoot, 'apps/extension/dist/chrome-mv3'));
const qaDir = path.resolve(process.env.QA_DIR ?? 'qa');
const run = process.env.RUN ?? 'explore';
const shots = path.join(qaDir, run, 'shots');
mkdirSync(shots, { recursive: true });

const logs: string[] = [];
const context = await chromium.launchPersistentContext(path.join(qaDir, run, 'profile'), {
  channel: 'chromium',
  headless: process.env.HEADED !== '1',
  viewport: { width: 1400, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

let [sw] = context.serviceWorkers();
sw ??= await context.waitForEvent('serviceworker');
sw.on('console', (m) => {
  if (m.type() === 'error') logs.push(`[sw console.error] ${m.text()}`);
});
const id = new URL(sw.url()).host;

const ctx: Ctx = {
  context,
  id,
  sw,
  log: (line) => logs.push(line),
  open: async (pagePath, width = 1400, height = 900) => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') {
        logs.push(`[${pagePath} console.${m.type()}] ${m.text().slice(0, 300)}`);
      }
    });
    page.on('pageerror', (e) => logs.push(`[${pagePath} pageerror] ${e.message.slice(0, 300)}`));
    await page.goto(`chrome-extension://${id}/${pagePath}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(600);
    return page;
  },
  shot: async (page, name, fullPage = false) => {
    await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage });
    logs.push(`[shot] ${path.join(shots, `${name}.png`)}`);
  },
};

const step = await import(path.resolve(process.argv[2]));
try {
  await step.default(ctx);
} catch (error) {
  logs.push(`[STEP THREW] ${(error as Error).message.split('\n').slice(0, 6).join(' | ')}`);
}
await context.close();
console.log(logs.join('\n') || '(no errors)');
