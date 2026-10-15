/**
 * AI quick save with Chrome's built-in AI and a fake Prompt API: in the service worker (set
 * through `extensionWorker.evaluate`) and in the AI host page (an offscreen document Playwright
 * does not list, opened by the test first and given the fake through the DevTools protocol,
 * `evaluateInHost`). The model's pick is saved, the call reaches the AI activity
 * log through the background, and two saves share one warm session in the host page; a model not
 * yet downloaded saves by the local word match without opening the host page.
 */
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { seedFolder, setSettings } from './popup-helpers';
import { finishedRecord, pressShortcut, startQuickSaveServer } from './quick-save-helpers';
import { readStored, STORAGE_ITEMS, seedAIServices } from './storage';

// The key press grants activeTab, which a dispatched command does not; website access stands in.
test.use({ grantWebHostAccess: true });

type FakeModel = {
  availability: 'downloadable' | 'available';
  /** The folder title the model picks from the shortlist it reads. */
  pick: string;
};

/** The fake `LanguageModel`, as a function that runs in any extension context. */
function installFake(options: FakeModel) {
  const state = { ...options, creates: 0, clones: 0 };
  const session = (): Record<string, unknown> => ({
    contextUsage: 100,
    contextWindow: 9216,
    async clone() {
      state.clones += 1;
      return session();
    },
    async prompt(input: string) {
      const line = input.split('\n').find((text) => text.endsWith(`/${state.pick}`));
      return JSON.stringify({ folders: line ? [line.slice(0, line.indexOf(':'))] : [] });
    },
    destroy() {},
  });
  Object.defineProperty(globalThis, 'LanguageModel', {
    configurable: true,
    value: {
      availability: async () => state.availability,
      create: async () => {
        state.creates += 1;
        return session();
      },
    },
  });
  Object.defineProperty(globalThis, '__fakeLanguageModel', { value: state, configurable: true });
}

async function fakeLanguageModel(context: BrowserContext, worker: Worker, model: FakeModel) {
  await context.addInitScript(installFake, model);
  await worker.evaluate(installFake, model);
}

/**
 * Runs `expression` in the AI host page (Chrome's offscreen document), which Playwright does not
 * list as a page, through the DevTools protocol of an open page; resolves with its JSON value.
 */
async function evaluateInHost(page: Page, expression: string): Promise<unknown> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const host = targetInfos.find((target) => target.url.endsWith('/ai-host.html'));
    if (!host) throw new Error('The AI host page is not open');
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: host.targetId,
      flatten: false,
    });
    const reply = new Promise<unknown>((resolve) => {
      cdp.on('Target.receivedMessageFromTarget', (event) => {
        const message = JSON.parse(event.message) as {
          id?: number;
          result?: { result?: { value?: unknown } };
        };
        if (event.sessionId === sessionId && message.id === 1) {
          resolve(message.result?.result?.value);
        }
      });
    });
    await cdp.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    });
    const value = await reply;
    await cdp.send('Target.detachFromTarget', { sessionId });
    return value;
  } finally {
    await cdp.detach();
  }
}

async function offscreenDocuments(worker: Worker) {
  return worker.evaluate(
    async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length,
  );
}

async function folderTitle(worker: Worker, id: string | undefined) {
  return worker.evaluate(
    async (folderId) => (await chrome.bookmarks.get(folderId))[0].title,
    id ?? '',
  );
}

test('[mocked provider contract] AI quick save saves to the built-in model pick from a warm session', async ({
  context,
  extensionWorker,
}) => {
  const server = await startQuickSaveServer();
  try {
    const model: FakeModel = { availability: 'available', pick: 'Databases' };
    await fakeLanguageModel(context, extensionWorker, model);
    // The host page opens as quick save would, and gets the fake before the first save; quick
    // save reuses an open host page.
    await extensionWorker.evaluate(() =>
      chrome.offscreen.createDocument({
        url: '/ai-host.html',
        reasons: [chrome.offscreen.Reason.DOM_PARSER],
        justification: 'E2E test of AI quick save',
      }),
    );
    const page = await context.newPage();
    await evaluateInHost(page, `(${installFake.toString()})(${JSON.stringify(model)})`);
    await seedFolder(extensionWorker, 'Dev', [
      { title: 'Databases', children: [{ title: 'SQL basics', url: 'https://sql.example/' }] },
      { title: 'Frontend', children: [{ title: 'CSS grid', url: 'https://css.example/' }] },
    ]);
    await setSettings(extensionWorker, {
      language: 'en',
      aiEnabled: true,
      aiActivityRecording: true,
    });
    await seedAIServices(extensionWorker, [{ provider: 'chrome_builtin', name: 'Built-in AI' }]);

    for (const slug of ['Postgres-indexing-guide', 'Redis-caching-notes']) {
      await page.goto(`${server.origin}/articles/${slug}`);
      await pressShortcut(extensionWorker, page, 'ai-quick-save');
      const record = await finishedRecord(extensionWorker);
      expect(record.status).toBe('saved');
      expect(await folderTitle(extensionWorker, record.folderId)).toBe('Databases');
    }
    // No request left the browser for the model.
    expect(server.ai.requests).toBe(0);

    // Each call is in the AI activity log, recorded by the background for the host page.
    await expect
      .poll(async () => {
        const entries =
          (await readStored<{ source: string; method: string }[]>(
            extensionWorker,
            STORAGE_ITEMS.aiActivity,
          )) ?? [];
        return entries.map(({ source, method }) => `${source} ${method}`);
      })
      .toEqual(['folderRecommendation ON-DEVICE', 'folderRecommendation ON-DEVICE']);

    // The host page stays open with its warm session: one session made, one copy per save.
    expect(await offscreenDocuments(extensionWorker)).toBe(1);
    expect(
      await evaluateInHost(
        page,
        'JSON.parse(JSON.stringify({ creates: __fakeLanguageModel.creates, clones: __fakeLanguageModel.clones }))',
      ),
    ).toEqual({ creates: 1, clones: 2 });
  } finally {
    await server.close();
  }
});

test('AI quick save with the built-in model not downloaded saves by the word match', async ({
  context,
  extensionWorker,
}) => {
  const server = await startQuickSaveServer();
  try {
    await fakeLanguageModel(context, extensionWorker, {
      availability: 'downloadable',
      pick: 'Frontend',
    });
    await seedFolder(extensionWorker, 'Postgres', [
      { title: 'Postgres docs', url: 'https://postgresql.example/docs' },
      { title: 'Postgres indexing', url: 'https://postgresql.example/indexes' },
    ]);
    await seedFolder(extensionWorker, 'Frontend', [
      { title: 'CSS grid', url: 'https://css.example/' },
    ]);
    await setSettings(extensionWorker, { language: 'en', aiEnabled: true });
    await seedAIServices(extensionWorker, [{ provider: 'chrome_builtin', name: 'Built-in AI' }]);

    const page = await context.newPage();
    await page.goto(`${server.origin}/articles/Postgres-indexing-guide`);
    await pressShortcut(extensionWorker, page, 'ai-quick-save');
    const record = await finishedRecord(extensionWorker);
    expect(record.status).toBe('saved');
    expect(await folderTitle(extensionWorker, record.folderId)).toBe('Postgres');
    // The model was never asked, so no download could start, and no host page opened.
    expect(await offscreenDocuments(extensionWorker)).toBe(0);
    expect(
      await extensionWorker.evaluate(
        () =>
          (globalThis as { __fakeLanguageModel?: { creates: number } }).__fakeLanguageModel
            ?.creates,
      ),
    ).toBe(0);
  } finally {
    await server.close();
  }
});
