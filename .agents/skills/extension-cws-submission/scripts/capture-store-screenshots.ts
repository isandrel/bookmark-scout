// Store screenshot capture, run as a step of the extension-exploratory-qa runner against a granted
// build (see prepare-granted-build.ts). Seeds synthetic bookmarks, saves real site icons with
// Refresh Site Icons, then captures every store frame in light and dark into the runner's shots/.
import type { Page } from '@playwright/test';
import type { Ctx } from '../../extension-exploratory-qa/scripts/explore-run';
import {
  removeStored,
  STORAGE_ITEMS,
  type StorageTarget,
  setSettings,
  updateStored,
  writeStored,
} from '../../../../apps/extension/tests/e2e/storage';

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
  // Nested folders, so the popup's folder matches show a folder deep in the tree.
  const italian = await mk(recipes.id, 'Italian');
  const pasta = await mk(italian.id, 'Pasta');
  await mk(pasta.id, 'Cacio e Pepe', 'https://www.example.com/recipes/cacio-e-pepe');
  const baking = await mk(recipes.id, 'Baking');
  await mk(baking.id, 'Pastry');
  const travel = await mk(bar, 'Travel');
  const japan = await mk(travel.id, 'Japan');
  const kyoto = await mk(japan.id, 'Kyoto');
  await mk(kyoto.id, 'Kyoto Itinerary', 'https://www.example.com/travel/kyoto');
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

// Pages open as tabs, so the popup's "current tab" would be itself; report a sample page instead.
const stubActiveTab = () => {
  const original = chrome.tabs.query.bind(chrome.tabs);
  // @ts-expect-error capture-only override
  chrome.tabs.query = async (query: chrome.tabs.QueryInfo) =>
    query?.active
      ? [{ id: 999, index: 0, windowId: 1, active: true, highlighted: true, pinned: false, incognito: false, title: 'Weeknight carbonara in 20 minutes', url: 'https://www.example.com/recipes/weeknight-carbonara' }]
      : original(query);
};

// Folder suggestions from a stubbed AI provider; no request leaves the machine.
const AI_BASE_URL = 'https://ai.example.invalid/v1';
const AI_SUGGESTIONS = JSON.stringify({
  recommendations: [
    { type: 'existing', confidence: 0.94, folderPath: 'Bookmarks Bar/Recipes/Italian/Pasta', parentPath: '', reason: 'A pasta recipe, like the others in this folder' },
    { type: 'new', confidence: 0.71, folderPath: 'Bookmarks Bar/Recipes/Quick Dinners', parentPath: '', reason: 'A 20-minute weeknight dinner' },
  ],
});

const enableStubAI = async (sw: StorageTarget, baseUrl: string) => {
  await setSettings(sw, { aiEnabled: true, aiProvider: 'custom', aiModel: 'demo-model', aiMaxRecommendations: 2 });
  await writeStored(sw, STORAGE_ITEMS.aiCredentials, { custom: { baseUrl, customModel: 'demo-model' } });
};

const disableStubAI = async (sw: StorageTarget) => {
  await updateStored<Record<string, unknown>>(sw, STORAGE_ITEMS.settings, (current = {}) => {
    const { aiEnabled, aiProvider, aiModel, aiMaxRecommendations, ...rest } = current;
    return rest;
  });
  await removeStored(sw, STORAGE_ITEMS.aiCredentials);
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

    // The two ways to pick a folder: type part of its name, or ask AI for suggestions.
    const openPopup = async () => {
      const popup = await context.newPage();
      await popup.setViewportSize(POPUP);
      await popup.emulateMedia({ colorScheme: scheme });
      await popup.addInitScript(stubActiveTab);
      await popup.goto(url('popup.html'));
      await popup.waitForTimeout(SETTLE_MS);
      return popup;
    };
    const match = await openPopup();
    const search = match.getByPlaceholder(/Search bookmarks/);
    await search.pressSequentially('pas', { delay: 80 });
    await match.waitForTimeout(SETTLE_MS);
    await search.press('ArrowDown');
    await match.waitForTimeout(SETTLE_MS / 2);
    await shot(match, `popup-match-${scheme}`);
    await match.close();

    await enableStubAI(sw, AI_BASE_URL);
    await context.route(`${AI_BASE_URL}/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          id: 'store-capture',
          model: 'demo-model',
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: AI_SUGGESTIONS } }],
        }),
      }),
    );
    const ai = await openPopup();
    await ai.getByTitle('AI folder recommendation').click();
    await ai.getByRole('button', { name: /Quick Dinners/ }).first().waitFor({ timeout: 15_000 });
    await ai.mouse.move(0, 0);
    await ai.waitForTimeout(SETTLE_MS / 2);
    await shot(ai, `popup-ai-${scheme}`);
    await ai.close();
    await context.unroute(`${AI_BASE_URL}/**`);
    await disableStubAI(sw);
  }
};
