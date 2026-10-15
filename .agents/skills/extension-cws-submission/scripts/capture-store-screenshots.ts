// Store screenshot capture, run as a step of the extension-exploratory-qa runner against a granted
// build (see prepare-granted-build.ts). Seeds everyday bookmarks on real public sites, saves their
// real icons with Refresh Site Icons, then captures every store frame in light and dark into the
// runner's shots/. Frames carry no added text, so they suit every language.
import type { Page } from '@playwright/test';
import type { Ctx } from '../../extension-exploratory-qa/scripts/explore-run';
import {
  removeStored,
  STORAGE_ITEMS,
  type StorageTarget,
  seedAIServices,
  setSettings,
  updateStored,
  writeStored,
} from '../../../../apps/extension/tests/e2e/storage';

const SCHEMES = ['light', 'dark'] as const;
const PAGE = { width: 1280, height: 800 };
const POPUP = { width: 400, height: 600 };
const SETTLE_MS = 1200;

// The page being saved: a public placeholder address, answered locally (no request leaves the
// machine) with a plain recipe page, so no real site's content appears in the frames.
const SAMPLE_PAGE = {
  title: 'Lemon ricotta pasta',
  url: 'https://www.example.com/recipes/lemon-ricotta-pasta',
};

const seed = async () => {
  const mk = (parentId: string, title: string, url?: string) =>
    chrome.bookmarks.create({ parentId, title, url });
  const bar = '1';
  const recipes = await mk(bar, 'Recipes');
  const italian = await mk(recipes.id, 'Italian');
  const pasta = await mk(italian.id, 'Pasta');
  await mk(pasta.id, 'Cacio e pepe', 'https://www.seriouseats.com/');
  await mk(pasta.id, 'Pasta recipes', 'https://www.bbcgoodfood.com/');
  const baking = await mk(recipes.id, 'Baking');
  await mk(baking.id, 'Sourdough for beginners', 'https://www.kingarthurbaking.com/');
  await mk(recipes.id, 'Weeknight dinners', 'https://www.allrecipes.com/');
  await mk(recipes.id, 'Weeknight dinners', 'https://www.allrecipes.com/');
  const school = await mk(bar, 'School');
  const math = await mk(school.id, 'Math');
  await mk(math.id, 'Algebra practice', 'https://www.khanacademy.org/');
  await mk(math.id, 'Algebra practice', 'https://www.khanacademy.org/');
  const science = await mk(school.id, 'Science');
  await mk(science.id, 'The solar system', 'https://science.nasa.gov/');
  await mk(school.id, 'Spanish lessons', 'https://www.duolingo.com/');
  await mk(school.id, 'Flashcards', 'https://quizlet.com/');
  const travel = await mk(bar, 'Travel');
  const japan = await mk(travel.id, 'Japan');
  const kyoto = await mk(japan.id, 'Kyoto');
  await mk(kyoto.id, 'Kyoto guide', 'https://www.japan-guide.com/');
  await mk(travel.id, 'Travel guides', 'https://en.wikivoyage.org/');
  await mk(travel.id, 'Train and bus routes', 'https://www.rome2rio.com/');
  const family = await mk(bar, 'Family');
  await mk(family.id, 'Birthday party ideas', 'https://www.parents.com/');
  await mk(family.id, 'School holidays', 'https://www.timeanddate.com/');
  await mk(family.id, 'Kids science activities', 'https://kids.nationalgeographic.com/');
  const shopping = await mk(bar, 'Shopping');
  await mk(shopping.id, 'Kitchen shelves', 'https://www.ikea.com/');
  await mk(shopping.id, 'Handmade gifts', 'https://www.etsy.com/');
  await mk(shopping.id, 'Camping gear', 'https://www.rei.com/');
  // A few everyday pages straight on the bar, as most people keep them.
  await mk(bar, 'Library catalog', 'https://www.worldcat.org/');
  await mk(bar, 'Maps', 'https://www.openstreetmap.org/');
  await mk(bar, 'Photo album', 'https://www.flickr.com/');
  await mk('2', 'Museum visit', 'https://www.metmuseum.org/');
};

// Pages open as tabs, so the popup's "current tab" would be itself; report the sample page instead.
const stubActiveTab = (sample: { title: string; url: string }) => {
  const original = chrome.tabs.query.bind(chrome.tabs);
  // @ts-expect-error capture-only override
  chrome.tabs.query = async (query: chrome.tabs.QueryInfo) =>
    query?.active
      ? [{ id: 999, index: 0, windowId: 1, active: true, highlighted: true, pinned: false, incognito: false, ...sample }]
      : original(query);
};

const samplePageHtml = (scheme: 'light' | 'dark') => {
  const dark = scheme === 'dark';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${SAMPLE_PAGE.title}</title><style>
body{margin:0;font:18px/1.6 Georgia,serif;background:${dark ? '#1c1b19' : '#fbf8f3'};color:${dark ? '#ece6dc' : '#2b2622'}}
header{height:64px;border-bottom:1px solid ${dark ? '#37332e' : '#e8e0d4'}}
main{max-width:760px;margin:48px auto;padding:0 24px}
h1{font-size:44px;line-height:1.15;margin:0 0 24px}
.hero{height:300px;border-radius:12px;background:linear-gradient(135deg,#f2d27a,#e8a948 45%,#c9733a)}
.lines div{height:14px;border-radius:7px;margin:18px 0;background:${dark ? '#37332e' : '#e8e0d4'}}
</style></head><body><header></header><main><h1>${SAMPLE_PAGE.title}</h1><div class="hero"></div>
<div class="lines"><div style="width:92%"></div><div style="width:86%"></div><div style="width:60%"></div></div></main></body></html>`;
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
  await setSettings(sw, { aiEnabled: true, aiMaxRecommendations: 2 });
  await seedAIServices(sw, [{ provider: 'custom', model: 'demo-model', credentials: { baseUrl } }]);
};

const disableStubAI = async (sw: StorageTarget) => {
  await updateStored<Record<string, unknown>>(sw, STORAGE_ITEMS.settings, (current = {}) => {
    const { aiEnabled, aiMaxRecommendations, ...rest } = current;
    return rest;
  });
  await removeStored(sw, STORAGE_ITEMS.aiServices);
  await removeStored(sw, STORAGE_ITEMS.aiCredentials);
  await removeStored(sw, STORAGE_ITEMS.quickSave);
};

const runTool = async (page: Page, name: string) => {
  const title = page.getByText(name, { exact: true }).first();
  await title.scrollIntoViewIfNeeded();
  await title.locator('xpath=ancestor::*[.//button][1]').getByRole('button').last().click();
};

/** Fires the background's real quick save command for `page`, as pressing the shortcut does. */
const quickSave = async (sw: StorageTarget & { evaluate: Ctx['sw']['evaluate'] }, page: Page) => {
  await page.bringToFront();
  await sw.evaluate(
    async ({ url, title }) => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const event = chrome.commands.onCommand as unknown as { dispatch(command: string, tab: unknown): void };
      event.dispatch('quick-save', { ...tab, url, title });
    },
    { url: page.url(), title: await page.title() },
  );
};

export default async ({ context, id, sw, shot, log }: Ctx) => {
  await sw.evaluate(seed);
  // A store frame shows the product, not the one-time offer to give quick save Ctrl+D.
  await writeStored(sw, STORAGE_ITEMS.dismissedNotices, ['quick-save-bookmark-key']);
  const url = (file: string) => `chrome-extension://${id}/${file}`;
  // The welcome page opens on install; it is not part of any frame.
  for (const page of context.pages()) if (page.url().includes('welcome')) await page.close();

  const icons = await context.newPage();
  await icons.setViewportSize(PAGE);
  await icons.goto(url('bookmarks.html'));
  await icons.getByRole('button', { name: 'Show tools' }).click();
  await runTool(icons, 'Refresh Site Icons');
  const dialog = icons.getByRole('dialog');
  const save = dialog.getByRole('button', { name: /^Save \d+ icons?/ });
  await save.waitFor({ timeout: 120_000 });
  log(`[icons] ${await save.innerText()}`);
  await save.click();
  // Saving finishes after the click; wait until the icons are stored before closing the page.
  for (let attempt = 0; attempt < 60; attempt++) {
    const stored = await sw.evaluate(async (key) => Boolean((await chrome.storage.local.get(key))[key]), 'site-icons.cache');
    if (stored) break;
    await icons.waitForTimeout(500);
  }
  await icons.close();

  for (const scheme of SCHEMES) {
    await context.route(`${SAMPLE_PAGE.url}*`, (route) =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: samplePageHtml(scheme) }),
    );

    // Quick save from a page: the in-page notification says where it went.
    const article = await context.newPage();
    await article.setViewportSize(PAGE);
    await article.emulateMedia({ colorScheme: scheme });
    await article.goto(SAMPLE_PAGE.url);
    await quickSave(sw as never, article);
    await article.waitForTimeout(SETTLE_MS * 2);
    await article.mouse.move(PAGE.width / 2, PAGE.height - 10);
    await shot(article, `quick-save-${scheme}`);
    // Undo, so the page is not already saved in the popup frames.
    const saved = await sw.evaluate(async (pageUrl) => chrome.bookmarks.search({ url: pageUrl }), SAMPLE_PAGE.url);
    for (const bookmark of saved) await sw.evaluate(async (bookmarkId) => chrome.bookmarks.remove(bookmarkId), bookmark.id);
    await removeStored(sw, STORAGE_ITEMS.quickSave);
    await removeStored(sw, STORAGE_ITEMS.recentFolders);
    await article.close();
    await context.unroute(`${SAMPLE_PAGE.url}*`);

    const page = await context.newPage();
    await page.setViewportSize(PAGE);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(url('bookmarks.html'));
    await page.waitForTimeout(SETTLE_MS * 3);
    await page.mouse.move(PAGE.width / 2, PAGE.height - 10);
    await shot(page, `manager-${scheme}`);

    await page.getByRole('button', { name: 'Show tools' }).click();
    await runTool(page, 'Duplicate Cleaner');
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await shot(page, `duplicates-${scheme}`);

    await page.goto(url('options.html'));
    await page.waitForTimeout(SETTLE_MS);
    await page.mouse.move(0, 0);
    await shot(page, `settings-${scheme}`);
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
      await popup.addInitScript(stubActiveTab, SAMPLE_PAGE);
      await popup.goto(url('popup.html'));
      await popup.waitForTimeout(SETTLE_MS);
      return popup;
    };
    const match = await openPopup();
    const search = match.getByRole('combobox').first();
    await search.pressSequentially('pas', { delay: 80 });
    await match.waitForTimeout(SETTLE_MS);
    await search.press('ArrowDown');
    await match.waitForTimeout(SETTLE_MS / 2);
    await shot(match, `popup-match-${scheme}`);
    await match.close();
    await removeStored(sw, STORAGE_ITEMS.searchHistory);

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
