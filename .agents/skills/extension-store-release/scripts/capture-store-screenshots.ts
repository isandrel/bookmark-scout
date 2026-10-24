// Store screenshot capture, run as a step of the extension-exploratory-qa runner against a granted
// build (see prepare-granted-build.ts). Seeds the tech and AI bookmark tree of the promo video on
// real public sites, saves their real icons with Refresh Site Icons, answers the three original
// article pages in ../assets/pages/ locally, then captures every store frame in light and dark at
// 2x into the runner's shots/. Frames carry no added text, so they suit every language.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
type Scheme = (typeof SCHEMES)[number];
/** Extension pages and articles, at the store size the UI is laid out for. */
const VIEWPORT = { width: 1280, height: 800 };
const POPUP = { width: 400, height: 600 };
/** The popup's own content; the rest of its 600px viewport is empty. */
const POPUP_CLIP = { x: 0, y: 0, width: 400, height: 500 };
/** Captures are re-rendered at this scale, so the compose step can enlarge them without blur. */
const SCALE = 2;
const SETTLE_MS = 1200;
const SHOTS = path.resolve(process.env.QA_DIR ?? 'qa', process.env.RUN ?? 'explore', 'shots');
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/pages');

/**
 * The pages being saved: original placeholder articles under fictional publications, on the
 * reserved example domains and answered locally, so no real site's content appears. Each origin
 * serves its own neutral icon (`<file>.svg` as /icon.svg), which Refresh Site Icons stores.
 */
const ARTICLES = {
  typed: {
    file: 'tensor-gazette',
    title: 'Fine-tuning small LLMs with LoRA',
    url: 'https://www.example.com/blog/fine-tuning-small-llms-with-lora',
  },
  quickSave: {
    file: 'toolcall-journal',
    title: 'Building agents with MCP',
    url: 'https://www.example.org/guides/building-agents-with-mcp',
  },
  ai: {
    file: 'prefix-weekly',
    title: 'Prompt caching, explained',
    url: 'https://www.example.net/issues/prompt-caching-explained',
  },
} as const;
type Article = (typeof ARTICLES)[keyof typeof ARTICLES];

/** The promo video's tree, on sites that serve their own icons. Two deliberate duplicates. */
const seed = async () => {
  const mk = (parentId: string, title: string, url?: string) =>
    chrome.bookmarks.create({ parentId, title, url });
  const bar = '1';
  const ai = await mk(bar, 'AI');
  const llms = await mk(ai.id, 'LLMs');
  const ft = await mk(llms.id, 'Fine-tuning');
  await mk(ft.id, 'LoRA: Low-Rank Adaptation', 'https://arxiv.org/abs/2106.09685');
  await mk(ft.id, 'QLoRA: Efficient Finetuning of Quantized LLMs', 'https://arxiv.org/abs/2305.14314');
  await mk(ft.id, 'PEFT library', 'https://github.com/huggingface/peft');
  await mk(ft.id, 'torchtune', 'https://pytorch.org/torchtune/');
  await mk(ft.id, 'Kaggle notebooks', 'https://www.kaggle.com/code');
  await mk(llms.id, 'PyTorch', 'https://pytorch.org/');
  await mk(llms.id, 'Keras', 'https://keras.io/');
  await mk(llms.id, 'Run models locally', 'https://ollama.com/library');
  const agents = await mk(ai.id, 'Agents');
  await mk(agents.id, 'MCP specification', 'https://modelcontextprotocol.io/specification');
  await mk(agents.id, 'GitHub', 'https://github.com/');
  await mk(agents.id, 'Gradio', 'https://gradio.app/');
  const papers = await mk(ai.id, 'Papers');
  await mk(papers.id, 'Attention Is All You Need', 'https://arxiv.org/abs/1706.03762');
  await mk(papers.id, 'Distill', 'https://distill.pub/');
  await mk(papers.id, 'LLM Powered Autonomous Agents', 'https://lilianweng.github.io/posts/2023-06-23-agent/');
  const dev = await mk(bar, 'Dev');
  const ts = await mk(dev.id, 'TypeScript');
  await mk(ts.id, 'TypeScript handbook', 'https://www.typescriptlang.org/docs/handbook/intro.html');
  await mk(ts.id, 'MDN Web Docs', 'https://developer.mozilla.org/en-US/');
  await mk(ts.id, 'React docs', 'https://react.dev/learn');
  const rust = await mk(dev.id, 'Rust');
  await mk(rust.id, 'Rust language', 'https://www.rust-lang.org/');
  await mk(rust.id, 'The Rust book', 'https://doc.rust-lang.org/book/');
  await mk(rust.id, 'docs.rs', 'https://docs.rs/');
  const py = await mk(dev.id, 'Python');
  await mk(py.id, 'Python docs', 'https://docs.python.org/3/');
  await mk(py.id, 'NumPy', 'https://numpy.org/');
  await mk(py.id, 'Jupyter', 'https://jupyter.org/');
  const design = await mk(bar, 'Design');
  const ui = await mk(design.id, 'UI');
  await mk(ui.id, 'Figma', 'https://www.figma.com/');
  await mk(ui.id, 'Material Design', 'https://material.io/');
  await mk(ui.id, 'Tailwind CSS', 'https://tailwindcss.com/docs');
  const tools = await mk(bar, 'Tools');
  await mk(tools.id, 'Vercel', 'https://vercel.com/');
  await mk(tools.id, 'Stack Overflow', 'https://stackoverflow.com/');
  await mk(tools.id, 'VS Code', 'https://code.visualstudio.com/');
  await mk(tools.id, 'MDN Web Docs', 'https://developer.mozilla.org/en-US/');
  const reading = await mk(bar, 'Reading list');
  await mk(reading.id, 'Hacker News', 'https://news.ycombinator.com/');
  await mk(reading.id, "Simon Willison's blog", 'https://simonwillison.net/');
  await mk(reading.id, 'Smashing Magazine', 'https://www.smashingmagazine.com/');
  await mk(bar, 'Hacker News', 'https://news.ycombinator.com/');
  await mk(bar, 'Excalidraw', 'https://excalidraw.com/');
  await mk(bar, 'Docker docs', 'https://docs.docker.com/');
  await mk('2', 'Deno', 'https://deno.com/');
  return { fineTuning: ft.id };
};

// Pages open as tabs, so the popup's "current tab" would be itself; report the article instead.
const stubActiveTab = (sample: { title: string; url: string }) => {
  const original = chrome.tabs.query.bind(chrome.tabs);
  // @ts-expect-error capture-only override
  chrome.tabs.query = async (query: chrome.tabs.QueryInfo) =>
    query?.active
      ? [{ id: 999, index: 0, windowId: 1, active: true, highlighted: true, pinned: false, incognito: false, ...sample }]
      : original(query);
};

// Headless Chromium cannot run the built-in model, and Settings would say so; show what a computer
// that can run it sees (the model offered for download) instead. Nothing is downloaded or run.
const stubBuiltInModel = () => {
  const fake = {
    availability: async () => 'downloadable',
    create: async () => {
      throw new DOMException('Not available in the store capture', 'NotSupportedError');
    },
  };
  Object.defineProperty(globalThis, 'LanguageModel', { value: fake, configurable: true });
};

// Folder suggestions from a stubbed AI provider; no request leaves the machine.
const AI_BASE_URL = 'https://ai.example.invalid/v1';
const AI_SUGGESTIONS = JSON.stringify({
  recommendations: [
    { type: 'new', confidence: 0.91, folderPath: 'Bookmarks Bar/AI/LLMs/Inference', parentPath: '', reason: 'About serving models; LLMs has no inference folder yet' },
    { type: 'existing', confidence: 0.84, folderPath: 'Bookmarks Bar/AI/LLMs', parentPath: '', reason: 'Your other LLM bookmarks are here' },
  ],
});

// Bring your own AI: a cloud service with an obviously fake key (masked on screen) and a model on
// the user's own computer. The Settings page that shows them has every web request aborted.
const BYO_SERVICES = [
  { provider: 'openai', name: 'OpenAI', model: 'gpt-4o-mini', credentials: { apiKey: 'sk-demo-not-a-real-key-000000' } },
  { provider: 'ollama', name: 'Ollama (Local)', model: 'llama3' },
];

const clearAI = async (sw: StorageTarget) => {
  await updateStored<Record<string, unknown>>(sw, STORAGE_ITEMS.settings, (current = {}) => {
    const { aiEnabled, aiMaxRecommendations, ...rest } = current;
    return rest;
  });
  await removeStored(sw, STORAGE_ITEMS.aiServices);
  await removeStored(sw, STORAGE_ITEMS.aiCredentials);
  await removeStored(sw, STORAGE_ITEMS.quickSave);
};

/**
 * Re-renders the visible page (or a part of it) at SCALE, rather than upscaling a 1x screenshot.
 * The clip is in viewport coordinates; the protocol wants document coordinates.
 */
const capture = async (page: Page, name: string, clip = { x: 0, y: 0, ...VIEWPORT }) => {
  const scrollY = await page.evaluate(() => window.scrollY);
  const cdp = await page.context().newCDPSession(page);
  // Without its own override, the capture lays the page out at the headless window's height.
  const viewport = page.viewportSize() ?? VIEWPORT;
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false });
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...clip, y: clip.y + scrollY, scale: SCALE },
  });
  await cdp.detach();
  writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
};

const domClick = (locator: ReturnType<Page['locator']>) =>
  locator.evaluate((element) => (element as HTMLElement).click());
const toolCard = (page: Page, title: string) =>
  page
    .getByTestId('tools-sidebar')
    .getByRole('heading', { name: title, exact: true })
    .locator('xpath=ancestor::*[.//button][1]');

/** Fires the background's real quick save command for the article, as pressing the shortcut does. */
const quickSave = async (sw: Ctx['sw'], page: Page, article: Article) => {
  await page.bringToFront();
  await sw.evaluate(
    async ({ url, title }) => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const event = chrome.commands.onCommand as unknown as { dispatch(command: string, tab: unknown): void };
      event.dispatch('quick-save', { ...tab, url, title });
    },
    { url: article.url, title: article.title },
  );
};

const removeSaved = async (sw: Ctx['sw'], url: string) => {
  const saved = await sw.evaluate(async (pageUrl) => chrome.bookmarks.search({ url: pageUrl }), url);
  for (const bookmark of saved) await sw.evaluate(async (bookmarkId) => chrome.bookmarks.remove(bookmarkId), bookmark.id);
  await removeStored(sw, STORAGE_ITEMS.quickSave);
  await removeStored(sw, STORAGE_ITEMS.recentFolders);
  await removeStored(sw, STORAGE_ITEMS.searchHistory);
};

export default async ({ context, id, sw, log }: Ctx) => {
  const ids = await sw.evaluate(seed);
  // A store frame shows the product, not the one-time offer to give quick save Ctrl+D.
  await writeStored(sw, STORAGE_ITEMS.dismissedNotices, ['quick-save-bookmark-key']);
  const url = (file: string) => `chrome-extension://${id}/${file}`;
  // The welcome page opens on install; it is not part of any frame.
  for (const page of context.pages()) if (page.url().includes('welcome')) await page.close();

  // Real site icons first, with no routes registered (request interception broke some sites' icon
  // requests), retried for slow sites; Refresh Site Icons keeps icons saved earlier when a site
  // fails. Then the article origins get theirs through temporary bookmarks, with their routes on.
  const refreshIcons = async (page: Page, tag: string) => {
    await page.goto(url('bookmarks.html'));
    await page.getByRole('button', { name: 'Show tools' }).click();
    // The sidebar opens on its Start Tab (Maintenance); Refresh Site Icons is under Page Details.
    await page.getByTestId('tools-tabs').getByRole('radio', { name: 'Page Details' }).click();
    await domClick(toolCard(page, 'Refresh Site Icons').getByRole('button', { name: 'Refresh', exact: true }));
    const save = page.getByRole('dialog').getByRole('button', { name: /^Save \d+ icons?/ });
    // The review opens when the run ends. A later pass may find no new icon, and then the review
    // has no Save button.
    await page.getByRole('dialog', { name: 'Refresh Site Icons' }).waitFor({ timeout: 180_000 });
    await page.waitForTimeout(3000);
    if (!(await save.count())) {
      log(`[icons] ${tag}: nothing new to save`);
      await page.keyboard.press('Escape');
      return;
    }
    let label = '';
    for (let second = 0; second < 30; second++) {
      await page.waitForTimeout(1000);
      const next = await save.innerText();
      if (next === label && second > 5) break;
      label = next;
    }
    log(`[icons] ${tag}: ${label}`);
    await save.click();
    // Saving finishes after the click; wait until the icons are stored before moving on.
    await page.waitForTimeout(6000);
  };
  const missingIcons = async () => {
    const cache = JSON.stringify(
      await sw.evaluate(async (key) => (await chrome.storage.local.get(key))[key] ?? null, 'site-icons.cache'),
    );
    const urls = await sw.evaluate(async () =>
      (await chrome.bookmarks.search({})).flatMap((bookmark) => (bookmark.url ? [bookmark.url] : [])),
    );
    return [...new Set(urls.map((address) => new URL(address).origin))].filter((origin) => !cache.includes(origin));
  };
  const icons = await context.newPage();
  await icons.setViewportSize(VIEWPORT);
  for (let attempt = 0; attempt < 3; attempt++) {
    await refreshIcons(icons, `real sites, pass ${attempt + 1}`);
    const left = await missingIcons();
    if (!left.length) break;
    log(`[icons] still without an icon: ${left.join(' ')}`);
  }
  for (const article of Object.values(ARTICLES)) {
    const html = readFileSync(path.join(ASSETS, `${article.file}.html`), 'utf8');
    const svg = readFileSync(path.join(ASSETS, `${article.file}.svg`), 'utf8');
    await context.route(`${new URL(article.url).origin}/**`, (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/icon.svg') return route.fulfill({ contentType: 'image/svg+xml', body: svg });
      if (pathname === article.url.replace(/^https:\/\/[^/]+/, '')) {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      }
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    });
  }
  const temporary = await sw.evaluate(
    async (urls) => Promise.all(urls.map((address) => chrome.bookmarks.create({ parentId: '2', title: 'temporary', url: address }))),
    Object.values(ARTICLES).map((article) => article.url),
  );
  await refreshIcons(icons, 'article origins');
  for (const bookmark of temporary) await sw.evaluate(async (bookmarkId) => chrome.bookmarks.remove(bookmarkId), bookmark.id);
  const missing = await missingIcons();
  await icons.close();
  if (missing.length) throw new Error(`Site icons missing for ${missing.join(' ')}`);
  log('[icons] every origin has its icon');

  const openPage = async (scheme: Scheme, address: string) => {
    const page = await context.newPage();
    await page.setViewportSize(VIEWPORT);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(address);
    return page;
  };
  const openPopup = async (scheme: Scheme, article: Article) => {
    const popup = await context.newPage();
    await popup.setViewportSize(POPUP);
    await popup.emulateMedia({ colorScheme: scheme });
    await popup.addInitScript(stubActiveTab, { title: article.title, url: article.url });
    await popup.goto(url('popup.html'));
    await popup.waitForTimeout(SETTLE_MS);
    return popup;
  };

  for (const scheme of SCHEMES) {
    // Quick save on any page: the in-page notification says where it went.
    const article = await openPage(scheme, ARTICLES.quickSave.url);
    await article.waitForTimeout(SETTLE_MS);
    await quickSave(sw, article, ARTICLES.quickSave);
    await article.waitForTimeout(SETTLE_MS * 2);
    await article.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 10);
    await capture(article, `quick-save-${scheme}`);
    await article.close();
    await removeSaved(sw, ARTICLES.quickSave.url);

    // Type a few letters of a nested folder's name; then save there for the manager frame.
    const typed = await openPopup(scheme, ARTICLES.typed);
    const search = typed.getByRole('combobox').first();
    await search.pressSequentially('fin', { delay: 80 });
    await typed.waitForTimeout(SETTLE_MS);
    await search.press('ArrowDown');
    await typed.waitForTimeout(SETTLE_MS / 2);
    await capture(typed, `popup-match-${scheme}`, POPUP_CLIP);
    await search.press('Enter');
    await typed.waitForTimeout(SETTLE_MS);
    await typed.close();
    const savedTo = await sw.evaluate(async (pageUrl) => chrome.bookmarks.search({ url: pageUrl }), ARTICLES.typed.url);
    log(`[popup] saved ${savedTo.length} into ${savedTo.map((bookmark) => bookmark.parentId).join(', ')}`);

    const manager = await openPage(scheme, url(`bookmarks.html?id=${ids.fineTuning}`));
    await manager.waitForTimeout(SETTLE_MS * 3);
    await manager.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 10);
    await capture(manager, `manager-${scheme}`);
    await removeSaved(sw, ARTICLES.typed.url);

    await manager.goto(url('bookmarks.html'));
    await manager.waitForTimeout(SETTLE_MS * 2);
    await manager.getByRole('button', { name: 'Show tools' }).click();
    await domClick(toolCard(manager, 'Duplicate Cleaner').getByRole('button').last());
    await manager.getByRole('dialog').waitFor();
    await manager.waitForTimeout(SETTLE_MS);
    await manager.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 10);
    await capture(manager, `duplicates-${scheme}`);
    await manager.close();

    const settings = await context.newPage();
    await settings.setViewportSize(VIEWPORT);
    await settings.emulateMedia({ colorScheme: scheme });
    await settings.addInitScript(stubBuiltInModel);
    await settings.goto(url('options.html'));
    await settings.waitForTimeout(SETTLE_MS);
    await settings.mouse.move(0, 0);
    await capture(settings, `settings-${scheme}`);
    await settings.close();

    // Settings > AI with two services the user brought: a cloud provider and a local model.
    await setSettings(sw, { aiEnabled: true });
    await seedAIServices(sw, BYO_SERVICES);
    const byo = await context.newPage();
    await byo.route(/^https?:\/\//, (route) => route.abort());
    await byo.setViewportSize(VIEWPORT);
    await byo.emulateMedia({ colorScheme: scheme });
    await byo.addInitScript(stubBuiltInModel);
    await byo.goto(url('options.html?category=ai'));
    await byo.waitForTimeout(SETTLE_MS);
    // Past the "AI is optional" box, to the switch and the services (the default one opens).
    await byo.getByText('AI Features', { exact: true }).first().evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY - 40;
      window.scrollTo({ top, behavior: 'instant' });
    });
    await byo.waitForTimeout(SETTLE_MS);
    await byo.mouse.move(0, 0);
    await capture(byo, `options-ai-${scheme}`);
    await byo.close();
    await clearAI(sw);

    // AI folder suggestions for the page, including a new folder.
    await setSettings(sw, { aiEnabled: true, aiMaxRecommendations: 2 });
    await seedAIServices(sw, [{ provider: 'custom', model: 'demo-model', credentials: { baseUrl: AI_BASE_URL } }]);
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
    const suggest = await openPopup(scheme, ARTICLES.ai);
    await suggest.getByTitle('AI folder recommendation').click();
    await suggest.getByRole('button', { name: /Inference/ }).first().waitFor({ timeout: 15_000 });
    await suggest.mouse.move(0, 0);
    await suggest.waitForTimeout(SETTLE_MS / 2);
    await capture(suggest, `popup-ai-${scheme}`, POPUP_CLIP);
    await suggest.close();
    await context.unroute(`${AI_BASE_URL}/**`);
    await clearAI(sw);
  }

  // The cards frame, last so no other frame counts its bookmarks: the three articles join Reading
  // list, and Fetch Covers keeps each one's preview image. That image is the article's own top,
  // rendered from the local page at the usual 1200x630 and named by an og:image tag only in the
  // copy Fetch Covers reads; the real sites in the folder are blocked during the run, so no
  // third-party image is requested, and their cards show the placeholder tile.
  const ogImages = new Map<string, Buffer>();
  const render = await context.newPage();
  await render.setViewportSize({ width: 1200, height: 630 });
  for (const article of Object.values(ARTICLES)) {
    await render.goto(article.url);
    await render.waitForTimeout(SETTLE_MS / 2);
    ogImages.set(new URL(article.url).origin, await render.screenshot({ type: 'png' }));
  }
  await render.close();
  for (const article of Object.values(ARTICLES)) {
    const { origin, pathname } = new URL(article.url);
    const html = readFileSync(path.join(ASSETS, `${article.file}.html`), 'utf8').replace(
      '<head>',
      '<head><meta property="og:image" content="/og.png">',
    );
    await context.route(`${origin}/**`, (route) => {
      const requested = new URL(route.request().url()).pathname;
      if (requested === '/og.png') {
        return route.fulfill({ contentType: 'image/png', body: ogImages.get(origin) ?? Buffer.alloc(0) });
      }
      if (requested === pathname) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      return route.fallback();
    });
  }
  const readingList = await sw.evaluate(async () => {
    const [folder] = (await chrome.bookmarks.search({ title: 'Reading list' })).filter((node) => !node.url);
    return folder.id;
  });
  const added = await sw.evaluate(
    async ({ parentId, articles }) => {
      const ids: Record<string, string> = {};
      // First in the folder, so the covers lead the frame.
      for (const [index, article] of articles.entries()) {
        ids[article.url] = (await chrome.bookmarks.create({ parentId, index, title: article.title, url: article.url })).id;
      }
      return ids;
    },
    { parentId: readingList, articles: Object.values(ARTICLES).map(({ title, url: address }) => ({ title, url: address })) },
  );
  const idOf = async (address: string) =>
    (await sw.evaluate(async (pageUrl) => chrome.bookmarks.search({ url: pageUrl }), address))[0]?.id ?? '';
  await writeStored(sw, STORAGE_ITEMS.bookmarkMetadata, {
    [added[ARTICLES.typed.url] ?? '']: {
      tags: ['llm', 'fine-tuning'],
      summary: 'Train a small model on your own data with LoRA adapters, on one GPU.',
    },
    [added[ARTICLES.quickSave.url] ?? '']: {
      tags: ['agents', 'mcp'],
      summary: 'Give an agent tools through a small, typed MCP server.',
    },
    [added[ARTICLES.ai.url] ?? '']: {
      tags: ['llm', 'performance'],
      summary: 'Why reusing a prompt prefix makes answers faster and cheaper.',
    },
    [await idOf('https://news.ycombinator.com/')]: { tags: ['news'] },
    [await idOf('https://simonwillison.net/')]: { tags: ['llm', 'blog'] },
    [await idOf('https://www.smashingmagazine.com/')]: { tags: ['design'] },
  });
  await setSettings(sw, { coversEnabled: true });
  const blockOthers = (route: Parameters<Parameters<typeof context.route>[1]>[0]) =>
    /^https?:\/\/www\.example\.(com|org|net)\//.test(route.request().url()) ? route.fallback() : route.abort();
  await context.route(/^https?:\/\//, blockOthers);
  const fetcher = await context.newPage();
  await fetcher.setViewportSize(VIEWPORT);
  await fetcher.goto(url(`bookmarks.html?id=${readingList}`));
  await fetcher.getByRole('button', { name: 'Show tools' }).click();
  await fetcher.getByTestId('tools-tabs').getByRole('radio', { name: 'Page Details' }).click();
  await domClick(toolCard(fetcher, 'Fetch Covers').getByRole('button', { name: 'Fetch', exact: true }));
  const saveCovers = fetcher.getByRole('dialog', { name: 'Fetch Covers' }).getByRole('button', { name: /^Save \d+ covers?/ });
  await saveCovers.waitFor({ timeout: 120_000 });
  log(`[covers] ${await saveCovers.innerText()}`);
  await saveCovers.click();
  await fetcher.waitForTimeout(SETTLE_MS * 2);
  await fetcher.close();
  await context.unroute(/^https?:\/\//, blockOthers);

  await setSettings(sw, { managerViewMode: 'cards' });
  for (const scheme of SCHEMES) {
    const cards = await openPage(scheme, url(`bookmarks.html?id=${readingList}`));
    await cards.waitForTimeout(SETTLE_MS * 3);
    await cards.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 10);
    await capture(cards, `manager-cards-${scheme}`);
    await cards.close();
  }
};
