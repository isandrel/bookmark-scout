/**
 * Chrome's built-in AI with a fake Prompt API (`LanguageModel`, installed into every page by an
 * init script): the "Free on this computer" suggestion and the model download in Options, the
 * states Options shows, "Check this computer" (with a fake `navigator` for the version, platform,
 * cores, and memory), and folder suggestions in the popup from the model's pick, with the
 * download hint while the model is missing. Real model behavior is checked by hand.
 */
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { seedFolder } from './popup-helpers';
import { readStored, STORAGE_ITEMS, seedAIServices, setSettings } from './storage';

// The harness opens the popup as a tab, which gets no activeTab, so it reads the page with `tabs`.
test.use({ grantPermissions: ['tabs'] });

const BUILTIN = 'chrome_builtin';

type FakeModel = {
  availability: 'unavailable' | 'downloadable' | 'downloading' | 'available';
  /** `create()` rejects with this message (Chrome's policy error, for one). */
  createError?: string;
  /** The folder title the model picks from the shortlist it reads. */
  pick?: string;
};

/** Installs the fake `LanguageModel` in every page of the context. */
async function fakeLanguageModel(context: BrowserContext, model: FakeModel) {
  await context.addInitScript((options: FakeModel) => {
    const state = { ...options, creates: 0 };
    const session = () => ({
      contextUsage: 100,
      contextWindow: 9216,
      async prompt(input: string) {
        // The prompt lists the shortlist as "<id>: <path>" lines; answer with the picked one's id.
        const line = input
          .split('\n')
          .find((text) => state.pick && text.endsWith(`/${state.pick}`));
        return JSON.stringify({ folders: line ? [line.slice(0, line.indexOf(':'))] : [] });
      },
      destroy() {},
    });
    const fake = {
      availability: async () => state.availability,
      create: async (createOptions: { monitor?: (monitor: EventTarget) => void } = {}) => {
        state.creates += 1;
        if (state.createError) {
          throw new DOMException(state.createError, 'NotSupportedError');
        }
        if (createOptions.monitor) {
          const monitor = new EventTarget();
          createOptions.monitor(monitor);
          state.availability = 'downloading';
          for (const loaded of [0, 0.4, 1]) {
            await new Promise((resolve) => setTimeout(resolve, 150));
            monitor.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }));
          }
          state.availability = 'available';
        }
        return session();
      },
    };
    Object.defineProperty(globalThis, 'LanguageModel', { value: fake, configurable: true });
    Object.defineProperty(globalThis, '__fakeLanguageModel', { value: state });
  }, model);
}

async function openAITab(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html?category=ai`);
  await expect(page.getByRole('heading', { name: 'AI services' })).toBeVisible();
}

test('Options offers Free on this computer first, and downloads the model from a click', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await fakeLanguageModel(context, { availability: 'downloadable' });
  await setSettings(extensionWorker, { language: 'en' });
  await openAITab(page, extensionId);

  const intro = page.getByTestId('ai-intro');
  const suggestion = intro.getByTestId('builtin-ai-suggestion');
  await expect(suggestion).toContainText('Free on this computer');
  // English is a language the model reads, so there is no note about word matching.
  await expect(suggestion.getByTestId('builtin-ai-language-note')).toHaveCount(0);
  // It comes before the four points about hosted AI.
  const suggestionBox = await suggestion.boundingBox();
  const pointBox = await intro.locator('[data-point="what"]').boundingBox();
  expect(suggestionBox && pointBox && suggestionBox.y < pointBox.y).toBe(true);

  await suggestion.getByRole('button', { name: 'Use built-in AI' }).click();
  await expect(suggestion).toHaveCount(0);
  const services = await readStored<{ services: { provider: string }[] }>(
    page,
    STORAGE_ITEMS.aiServices,
  );
  expect(services?.services.map((service) => service.provider)).toEqual([BUILTIN]);
  // Adding it does not turn AI on.
  await expect(page.locator('[data-setting="aiEnabled"]').getByRole('switch')).not.toBeChecked();

  const status = page.getByTestId('builtin-ai-status');
  await expect(status).toHaveAttribute('data-status', 'downloadable');
  await expect(status).toContainText('The model is not on this computer yet');
  await expect(status).toContainText('22 GB of free disk space');
  await expect(status).toContainText(
    'Works best with English, Japanese, Spanish, German, and French',
  );
  // No key, model, or endpoint fields for a model on this computer.
  await expect(page.getByLabel('API Key')).toHaveCount(0);

  await status.getByRole('button', { name: 'Download the model' }).click();
  await expect(page.getByTestId('builtin-ai-progress')).toBeVisible();
  await expect(status).toContainText('Ready. Folder suggestions run on this computer.');
  await expect(status).toHaveAttribute('data-status', 'available');
  // Set up now, so the onboarding box gives the room back.
  await expect(intro).toHaveCount(0);
});

test('Options says when this computer cannot run it, or a policy turned it off', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await fakeLanguageModel(context, {
    availability: 'unavailable',
    createError:
      'The on-device model is not available because the enterprise policy disables the feature.',
  });
  await setSettings(extensionWorker, { language: 'en' });
  await openAITab(page, extensionId);

  // Not offered where it cannot run: neither the suggestion nor the Add service list.
  await expect(page.getByTestId('ai-intro')).toBeVisible();
  await expect(page.getByTestId('builtin-ai-suggestion')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add service' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an AI service' });
  await dialog.getByRole('combobox', { name: 'Provider' }).click();
  const options = page.locator('[data-slot="searchable-select-popup"]');
  await expect(options.getByRole('option', { name: 'OpenAI', exact: true })).toBeVisible();
  await expect(options.getByRole('option', { name: 'Built-in AI (on this computer)' })).toHaveCount(
    0,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // A service restored from elsewhere explains why it does not work here.
  await seedAIServices(extensionWorker, [{ provider: BUILTIN, name: 'Built-in AI' }]);
  const status = page.getByTestId('builtin-ai-status');
  await expect(status).toContainText("Your organization turned off Chrome's built-in AI.");
  // Nothing on this computer can change a policy: no checklist and no flag advice.
  await expect(page.getByTestId('builtin-ai-check')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Chrome flags' })).toHaveCount(0);
});

type FakeDevice = {
  /** Chrome's full version, as `fullVersionList` reports it. */
  chrome: string;
  platform: string;
  platformVersion: string;
  cores: number;
  memory: number;
};

const DEVICE: FakeDevice = {
  chrome: '141.0.7390.54',
  platform: 'macOS',
  platformVersion: '15.6.1',
  cores: 10,
  memory: 8,
};

/** Makes every page of the context report this computer through `navigator`. */
async function fakeDevice(context: BrowserContext, device: Partial<FakeDevice> = {}) {
  await context.addInitScript(
    (fake: FakeDevice) => {
      const brands = [
        { brand: 'Not)A;Brand', version: '8.0.0.0' },
        { brand: 'Chromium', version: fake.chrome },
        { brand: 'Google Chrome', version: fake.chrome },
      ];
      const data = {
        brands: brands.map(({ brand, version }) => ({ brand, version: version.split('.')[0] })),
        mobile: false,
        platform: fake.platform,
        getHighEntropyValues: async () => ({
          fullVersionList: brands,
          platform: fake.platform,
          platformVersion: fake.platformVersion,
        }),
      };
      Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => data });
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => fake.cores });
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => fake.memory });
    },
    { ...DEVICE, ...device },
  );
}

/** The checklist row for one requirement: its state and its text. */
function checkRow(scope: Page | Locator, id: string) {
  return scope.getByTestId('builtin-ai-check').locator(`[data-check="${id}"]`);
}

test('Check this computer fills in what the browser can tell, folded while the model can run', async ({
  context,
  extensionBrowser,
  extensionId,
  extensionWorker,
  page,
}) => {
  await fakeLanguageModel(context, { availability: 'available' });
  await fakeDevice(context);
  await setSettings(extensionWorker, { language: 'en' });
  await seedAIServices(extensionWorker, [{ provider: BUILTIN, name: 'Built-in AI' }]);
  await openAITab(page, extensionId);
  const status = page.getByTestId('builtin-ai-status');
  await expect(status).toContainText('Ready. Folder suggestions run on this computer.');
  const check = page.getByTestId('builtin-ai-check');
  // Chrome only: Edge names its switch differently ([check] browsers in config/ai/built-in.toml).
  if (extensionBrowser === 'msedge') {
    await expect(check).toHaveCount(0);
    return;
  }

  const fold = check.getByRole('button', { name: 'Check this computer' });
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await fold.click();
  const rows = check.getByRole('list', { name: 'Check this computer' }).getByRole('listitem');
  await expect(rows).toHaveCount(7);
  await expect(checkRow(page, 'model')).toHaveAttribute('data-state', 'pass');
  await expect(checkRow(page, 'model')).toContainText('Downloaded and ready');
  await expect(checkRow(page, 'browser')).toHaveAttribute('data-state', 'pass');
  await expect(checkRow(page, 'browser')).toContainText('Google Chrome 141.0.7390.54');
  await expect(checkRow(page, 'os')).toHaveAttribute('data-state', 'pass');
  await expect(checkRow(page, 'os')).toContainText('macOS 15.6.1');
  await expect(checkRow(page, 'cores')).toHaveAttribute('data-state', 'pass');
  // Chrome caps deviceMemory at 8 GB: "8 GB or more" is neither a pass nor a fail.
  const memory = checkRow(page, 'memory');
  await expect(memory).toHaveAttribute('data-state', 'unknown');
  await expect(memory).toContainText('8 GB or more');
  await expect(memory).toContainText('Chrome reports at most 8 GB');
  // No page can see free disk space or graphics memory: the requirement only.
  await expect(checkRow(page, 'disk')).toHaveAttribute('data-state', 'unknown');
  await expect(checkRow(page, 'disk')).toContainText('Browsers cannot see this');
  await expect(checkRow(page, 'disk')).toContainText('Needs 22 GB free');
  await expect(checkRow(page, 'gpu')).toContainText('Needs more than 4 GB');
  // Every icon has a screen-reader label.
  await expect(checkRow(page, 'browser')).toContainText('Meets the requirement');
  await expect(memory).toContainText('Cannot be checked here');
  // Flag advice is only for a model Chrome says cannot run.
  await expect(check.getByTestId('builtin-ai-check-guidance')).toHaveCount(0);
});

test('Check this computer keeps the download, and warns on few cores without failing', async ({
  context,
  extensionBrowser,
  extensionId,
  extensionWorker,
  page,
}) => {
  test.skip(extensionBrowser === 'msedge', 'The check is Chrome only');
  await fakeLanguageModel(context, { availability: 'downloadable' });
  await fakeDevice(context, { cores: 2, memory: 4 });
  await setSettings(extensionWorker, { language: 'en' });
  await seedAIServices(extensionWorker, [{ provider: BUILTIN, name: 'Built-in AI' }]);
  await openAITab(page, extensionId);

  const status = page.getByTestId('builtin-ai-status');
  await expect(status.getByRole('button', { name: 'Download the model' })).toBeVisible();
  await page.getByRole('button', { name: 'Check this computer' }).click();
  await expect(checkRow(page, 'model')).toContainText('not downloaded yet');
  await expect(checkRow(page, 'cores')).toHaveAttribute('data-state', 'warn');
  await expect(checkRow(page, 'cores')).toContainText('Without a graphics card, it needs 4 cores.');
  await expect(checkRow(page, 'memory')).toHaveAttribute('data-state', 'warn');
  await expect(checkRow(page, 'memory')).toContainText('About 4 GB');
  await expect(checkRow(page, 'memory')).toContainText('Without a graphics card, it needs 16 GB.');
});

test('when Chrome says the computer cannot run it, Options shows the checks, the flag, and Check again', async ({
  context,
  extensionBrowser,
  extensionId,
  extensionWorker,
  page,
}) => {
  test.skip(extensionBrowser === 'msedge', 'The check is Chrome only');
  await fakeLanguageModel(context, { availability: 'unavailable' });
  await fakeDevice(context);
  await setSettings(extensionWorker, { language: 'en' });
  await openAITab(page, extensionId);

  // Before any service exists, the Free on this computer box says so, with the check folded.
  const suggestion = page.getByTestId('builtin-ai-suggestion');
  await expect(suggestion).toHaveAttribute('data-status', 'unavailable');
  await expect(suggestion).toContainText('cannot run its built-in AI yet');
  await expect(suggestion.getByRole('button', { name: 'Use built-in AI' })).toHaveCount(0);
  await suggestion.getByRole('button', { name: 'Check this computer' }).click();
  await expect(suggestion.getByTestId('builtin-ai-check-guidance')).toContainText(
    'Enabled BypassPerfRequirement',
  );

  // A service restored from elsewhere opens the check at once.
  await seedAIServices(extensionWorker, [{ provider: BUILTIN, name: 'Built-in AI' }]);
  const status = page.getByTestId('builtin-ai-status');
  await expect(status).toContainText("This computer cannot run Chrome's built-in AI.");
  const check = status.getByTestId('builtin-ai-check');
  await expect(check.getByRole('button', { name: 'Check this computer' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(checkRow(status, 'model')).toHaveAttribute('data-state', 'fail');
  const guidance = check.getByTestId('builtin-ai-check-guidance');
  await expect(guidance).toContainText('Nothing above rules this computer out.');
  await expect(guidance).toContainText(
    'In Chrome flags, set the highlighted flag to Enabled BypassPerfRequirement, then restart Chrome.',
  );
  await expect(guidance).toContainText('chrome://flags/#optimization-guide-on-device-model');
  await expect(guidance).toContainText('chrome://on-device-internals');

  // Chrome lets the extension open its own pages in a tab.
  const [flags] = await Promise.all([
    context.waitForEvent('page'),
    guidance.getByRole('button', { name: 'Open Chrome flags' }).click(),
  ]);
  await expect(flags).toHaveURL('chrome://flags/#optimization-guide-on-device-model');
  await flags.close();
  const [internals] = await Promise.all([
    context.waitForEvent('page'),
    guidance.getByRole('button', { name: "See the model's state in Chrome" }).click(),
  ]);
  // With Chrome's internal debugging pages off (the default), Chrome shows how to turn them on.
  await expect(internals).toHaveURL(
    /^chrome:\/\/(on-device-internals\/?|debug-webuis-disabled\/\?host=chrome:\/\/on-device-internals\/?)$/,
  );
  await expect(guidance).toContainText('internal debugging pages');
  await internals.close();
  await expect(guidance).not.toContainText('Chrome did not open it');

  const checkAgain = guidance.getByRole('button', { name: 'Check again' });
  await checkAgain.click();
  await expect(guidance).toContainText('Chrome still says this computer cannot run it.');
  // After the flag and a restart, Chrome offers the download.
  await page.evaluate(() => {
    const fake = (globalThis as { __fakeLanguageModel?: { availability: string } })
      .__fakeLanguageModel;
    if (fake) fake.availability = 'downloadable';
  });
  await checkAgain.click();
  await expect(status).toHaveAttribute('data-status', 'downloadable');
  await expect(status.getByRole('button', { name: 'Download the model' })).toBeVisible();
  await expect(check.getByTestId('builtin-ai-check-guidance')).toHaveCount(0);
});

test('Check this computer gives no flag advice when the computer is ruled out', async ({
  context,
  extensionBrowser,
  extensionId,
  extensionWorker,
  page,
}) => {
  test.skip(extensionBrowser === 'msedge', 'The check is Chrome only');
  await fakeLanguageModel(context, { availability: 'unavailable' });
  await fakeDevice(context, { platformVersion: '12.7.6' });
  await setSettings(extensionWorker, { language: 'en' });
  await seedAIServices(extensionWorker, [{ provider: BUILTIN, name: 'Built-in AI' }]);
  await openAITab(page, extensionId);

  await expect(checkRow(page, 'os')).toHaveAttribute('data-state', 'fail');
  await expect(checkRow(page, 'os')).toContainText('Needs macOS 13 or later');
  const guidance = page.getByTestId('builtin-ai-check-guidance');
  await expect(guidance.getByRole('button', { name: 'Check again' })).toBeVisible();
  await expect(guidance.getByRole('button', { name: 'Open Chrome flags' })).toHaveCount(0);
});

test('without the API, Options keeps its message and names an old Chrome as the reason', async ({
  context,
  extensionBrowser,
  extensionId,
  extensionWorker,
  page,
}) => {
  test.skip(extensionBrowser === 'msedge', 'The check is Chrome only');
  await context.addInitScript(() => {
    Reflect.deleteProperty(globalThis, 'LanguageModel');
  });
  await fakeDevice(context, { chrome: '137.0.7151.68' });
  await setSettings(extensionWorker, { language: 'en' });
  await seedAIServices(extensionWorker, [{ provider: BUILTIN, name: 'Built-in AI' }]);
  await openAITab(page, extensionId);

  const status = page.getByTestId('builtin-ai-status');
  await expect(status).toHaveAttribute('data-status', 'unsupported');
  await expect(status).toContainText('This browser has no built-in AI.');
  await expect(page.getByTestId('builtin-ai-outdated')).toHaveText(
    'It needs Chrome 138 or later. This is Google Chrome 137.0.7151.68.',
  );
  await expect(page.getByTestId('builtin-ai-check')).toHaveCount(0);
  await expect(page.getByTestId('builtin-ai-suggestion')).toHaveCount(0);
});

test('Add service lists the built-in model first where it can run', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await fakeLanguageModel(context, { availability: 'available' });
  await setSettings(extensionWorker, { language: 'en' });
  await openAITab(page, extensionId);
  await page.getByRole('button', { name: 'Add service' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an AI service' });
  await dialog.getByRole('combobox', { name: 'Provider' }).click();
  const popup = page.locator('[data-slot="searchable-select-popup"]');
  const first = popup.getByRole('option').first();
  await expect(first).toHaveText('Built-in AI (on this computer)');
  await first.click();
  await dialog.getByRole('button', { name: 'Add service' }).click();
  await expect(dialog).toHaveCount(0);
  const services = page.getByTestId('ai-service');
  await expect(services).toHaveCount(1);

  // There is only one model on this computer: Add service no longer lists it, and it has no copy.
  await page.getByRole('button', { name: 'Add service' }).click();
  await dialog.getByRole('combobox', { name: 'Provider' }).click();
  await expect(popup.getByRole('option', { name: 'OpenAI', exact: true })).toBeVisible();
  await expect(popup.getByRole('option', { name: 'Built-in AI (on this computer)' })).toHaveCount(
    0,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await services
    .first()
    .getByRole('button', { name: /^Actions for / })
    .click();
  await expect(page.getByRole('menuitem', { name: 'Set as default' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(services).toHaveCount(1);
});

test('Options names the model, shows a download started elsewhere, and says which service does the rest', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await fakeLanguageModel(context, { availability: 'downloading' });
  await setSettings(extensionWorker, { language: 'en' });
  const builtin = { provider: BUILTIN, name: 'Built-in AI', model: 'gemini-nano' };
  await seedAIServices(extensionWorker, [builtin]);
  await openAITab(page, extensionId);

  // The model's name, not its id.
  const service = page.getByTestId('ai-service').first();
  await expect(service).toContainText('Gemini Nano');
  await expect(service).not.toContainText('gemini-nano');

  // A download this page did not start has no known progress, but it is still shown.
  const status = page.getByTestId('builtin-ai-status');
  await expect(status).toHaveAttribute('data-status', 'downloading');
  const progress = page.getByTestId('builtin-ai-progress');
  await expect(progress).toBeVisible();
  await expect(progress).not.toHaveAttribute('aria-valuenow');
  await expect(status).toContainText('Chrome keeps downloading in the background');

  const scope = page.getByTestId('builtin-ai-scope');
  await expect(scope).toContainText('use another AI service when you add one');
  await seedAIServices(extensionWorker, [builtin, { provider: 'deepseek', name: 'DeepSeek' }]);
  await expect(scope).toContainText('use your other AI services');
  await expect(scope).not.toContainText('when you add one');
});

test('in a language the model does not read, Options says pages in it may get word matches', async ({
  context,
  extensionId,
  extensionWorker,
  page,
}) => {
  await fakeLanguageModel(context, { availability: 'downloadable' });
  await setSettings(extensionWorker, { language: 'ko' });
  await page.goto(`chrome-extension://${extensionId}/options.html?category=ai`);
  const suggestion = page.getByTestId('builtin-ai-suggestion');
  await expect(suggestion.getByTestId('builtin-ai-language-note')).toContainText('한국어');
  await suggestion.getByRole('button').click();
  await expect(page.getByTestId('builtin-ai-languages')).toContainText('한국어');
  // Korean breaks lines between words, not inside them.
  expect(await page.evaluate(() => getComputedStyle(document.body).wordBreak)).toBe('keep-all');
});

async function openPopupOnPage(context: BrowserContext, worker: Worker, extensionId: string) {
  await context.route('https://current.e2e.invalid/rust-guide', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<title>Rust async guide</title><main>Fixture page</main>',
    }),
  );
  const site = await context.newPage();
  await site.goto('https://current.e2e.invalid/rust-guide');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://current.e2e.invalid/rust-guide' });
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { active: true });
  });
  return popup;
}

test('[mocked provider contract] the popup suggests the folder the built-in model picks', async ({
  context,
  extensionId,
  extensionWorker,
}) => {
  await fakeLanguageModel(context, { availability: 'available', pick: 'Rust' });
  await setSettings(extensionWorker, {
    language: 'en',
    aiEnabled: true,
    aiActivityRecording: true,
    aiMaxRecommendations: 2,
    recentFoldersEnabled: false,
  });
  await seedAIServices(extensionWorker, [{ provider: BUILTIN, name: 'Built-in AI' }]);
  const { ids } = await seedFolder(extensionWorker, 'Dev', [
    {
      title: 'Rust',
      children: [{ title: 'The Rust book', url: 'https://doc.rust-lang.org/book' }],
    },
    { title: 'Cooking', children: [{ title: 'Bread', url: 'https://bread.example/' }] },
  ]);

  const popup = await openPopupOnPage(context, extensionWorker, extensionId);
  // Ask AI needs a service that runs tools, so only the folder suggestion button shows.
  await expect(
    popup.getByRole('button', { name: 'Ask AI about your bookmarks or this page' }),
  ).toHaveCount(0);
  await popup.getByRole('button', { name: 'AI folder recommendation' }).click();

  const suggestions = popup.getByTestId('ai-suggestions');
  const rust = suggestions.getByRole('button', { name: /Dev\/Rust/ });
  await expect(rust).toBeVisible();
  await expect(rust).toHaveAttribute('title', 'Chosen by the built-in AI on this computer');
  await rust.click();
  await expect
    .poll(() =>
      extensionWorker.evaluate(
        async (folderId) => (await chrome.bookmarks.getChildren(folderId)).map((node) => node.url),
        ids.Rust,
      ),
    )
    .toContain('https://current.e2e.invalid/rust-guide');

  // No network request was made, so the call is logged on its own.
  type LogEntry = { method: string; source: string; requestBody?: string };
  await expect
    .poll(async () => (await readStored<LogEntry[]>(popup, STORAGE_ITEMS.aiActivity))?.[0])
    .toMatchObject({
      method: 'ON-DEVICE',
      source: 'folderRecommendation',
      requestBody: expect.stringContaining('Rust async guide'),
    });
  // Options names the on-device call in its status badge, where a request shows its HTTP status.
  const options = await context.newPage();
  await openAITab(options, extensionId);
  const entry = options.getByTestId('ai-activity').getByTestId('ai-activity-entry').first();
  await expect(entry.getByTestId('ai-activity-status')).toHaveText('On device');
});

test('the popup never downloads the model: it says to download it in Settings', async ({
  context,
  extensionId,
  extensionWorker,
}) => {
  await fakeLanguageModel(context, { availability: 'downloadable', pick: 'Rust' });
  await setSettings(extensionWorker, { language: 'en', aiEnabled: true });
  await seedAIServices(extensionWorker, [{ provider: BUILTIN, name: 'Built-in AI' }]);

  const popup = await openPopupOnPage(context, extensionWorker, extensionId);
  const notice = popup.getByTestId('ai-setup-notice');
  await expect(notice).toContainText('Download the built-in AI model in Settings');
  await expect(popup.getByRole('button', { name: 'AI folder recommendation' })).toHaveCount(0);
  expect(
    await popup.evaluate(
      () =>
        (globalThis as { __fakeLanguageModel?: { creates: number } }).__fakeLanguageModel?.creates,
    ),
  ).toBe(0);
});
