// Store screenshot capture, run as a step of the extension-exploratory-qa runner against a granted
// build (see prepare-granted-build.ts). Seeds synthetic bookmarks, saves real site icons with
// Refresh Site Icons, then captures every store frame in light and dark into the runner's shots/.
import type { Page } from '@playwright/test';
import type { Ctx } from '../../extension-exploratory-qa/scripts/explore-run';

const SCHEMES = ['light', 'dark'] as const;
const PAGE = { width: 1280, height: 800 };
const POPUP = { width: 400, height: 600 };
const SETTLE_MS = 1200;

const seed = async () => {
  const mk = (parentId: string, title: string, url?: string) =>
    chrome.bookmarks.create({ parentId, title, url });
  const bar = '1';
  await mk(bar, 'Inbox');
  const recipes = await mk(bar, 'Recipes');
  await mk(recipes.id, 'Weeknight Pasta', 'https://www.example.com/recipes/weeknight-pasta');
  await mk(recipes.id, 'Weeknight Pasta (copy)', 'https://www.example.com/recipes/weeknight-pasta');
  await mk(recipes.id, 'Sourdough Starter Guide', 'https://www.example.org/baking/sourdough');
  const travel = await mk(bar, 'Travel');
  await mk(travel.id, 'Kyoto Itinerary', 'https://www.example.com/travel/kyoto');
  await mk(travel.id, 'Packing List', 'https://www.example.org/travel/packing');
  await mk(travel.id, 'Wikivoyage', 'https://en.wikivoyage.org/');
  const research = await mk(bar, 'Research');
  await mk(research.id, 'Wikipedia', 'https://en.wikipedia.org/');
  await mk(research.id, 'arXiv', 'https://arxiv.org/');
  await mk(research.id, 'Our World in Data', 'https://ourworldindata.org/');
  await mk(research.id, 'Internet Archive', 'https://archive.org/');
  const dev = await mk(bar, 'Dev Docs');
  const tailwind = await mk(dev.id, 'Tailwind CSS');
  await mk(tailwind.id, 'Tailwind CSS Docs', 'https://tailwindcss.com/docs');
  await mk(tailwind.id, 'Tailwind Play', 'https://play.tailwindcss.com/');
  await mk(dev.id, 'Chrome Extensions Docs', 'https://developer.chrome.com/docs/extensions');
  await mk(dev.id, 'MDN Web Docs', 'https://developer.mozilla.org/en-US/');
  await mk(dev.id, 'React Reference', 'https://react.dev/reference/react');
  await mk(dev.id, 'WXT Guide', 'https://wxt.dev/guide/');
  await mk(dev.id, 'MDN Web Docs', 'https://developer.mozilla.org/en-US/');
  await mk(dev.id, 'TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/intro.html');
  await mk(bar, 'Hacker News', 'https://news.ycombinator.com/');
  await mk(bar, 'GitHub', 'https://github.com/');
};

// Pages open as tabs, so the popup's "current tab" would be itself; report a public page instead.
const stubActiveTab = () => {
  const original = chrome.tabs.query.bind(chrome.tabs);
  // @ts-expect-error capture-only override
  chrome.tabs.query = async (query: chrome.tabs.QueryInfo) =>
    query?.active
      ? [{ id: 999, index: 0, windowId: 1, active: true, highlighted: true, pinned: false, incognito: false, title: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/' }]
      : original(query);
};

const runTool = async (page: Page, name: string) => {
  const title = page.getByText(name, { exact: true }).first();
  await title.scrollIntoViewIfNeeded();
  await title.locator('xpath=ancestor::*[.//button][1]').getByRole('button').last().click();
};

export default async ({ context, id, sw, shot, log }: Ctx) => {
  await sw.evaluate(seed);
  const url = (file: string) => `chrome-extension://${id}/${file}`;

  const icons = await context.newPage();
  await icons.setViewportSize(PAGE);
  await icons.goto(url('bookmarks.html'));
  await icons.getByRole('button', { name: 'Show tools' }).click();
  await runTool(icons, 'Refresh Site Icons');
  const dialog = icons.getByRole('dialog');
  const save = dialog.getByRole('button', { name: /^Save \d+ icons?/ });
  await save.waitFor({ timeout: 90_000 });
  log(`[icons] ${await save.innerText()}`);
  await save.click();
  await icons.close();

  for (const scheme of SCHEMES) {
    const page = await context.newPage();
    await page.setViewportSize(PAGE);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(url('bookmarks.html'));
    await page.waitForTimeout(SETTLE_MS);
    await page.getByRole('button', { name: 'Dev Docs', exact: true }).first().click();
    await page.waitForTimeout(SETTLE_MS);
    await page.mouse.move(PAGE.width / 2, PAGE.height - 10);
    await shot(page, `manager-${scheme}`);

    await page.getByRole('button', { name: 'Show tools' }).click();
    await runTool(page, 'Duplicate Cleaner');
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await shot(page, `duplicates-${scheme}`);

    await page.goto(url('options.html'));
    await page.waitForTimeout(SETTLE_MS);
    await page.getByRole('tab', { name: 'AI', exact: true }).first().click();
    await page.waitForTimeout(SETTLE_MS);
    await page.mouse.move(0, 0);
    await shot(page, `options-ai-${scheme}`);
    await page.close();

    for (const [name, query] of [['popup-tree', ''], ['popup-search', 'docs']] as const) {
      const popup = await context.newPage();
      await popup.setViewportSize(POPUP);
      await popup.emulateMedia({ colorScheme: scheme });
      await popup.addInitScript(stubActiveTab);
      await popup.goto(url('popup.html'));
      await popup.waitForTimeout(SETTLE_MS);
      const search = popup.getByPlaceholder(/Search bookmarks/);
      if (query) {
        await search.fill(query);
      } else {
        await popup.getByText('Bookmarks Bar', { exact: true }).first().click();
        await popup.getByText('Dev Docs', { exact: true }).first().click();
        await popup.getByText('Dev Docs', { exact: true }).first().hover();
      }
      await search.blur();
      await popup.waitForTimeout(SETTLE_MS);
      await shot(popup, `${name}-${scheme}`);
      await popup.close();
    }
  }
};
