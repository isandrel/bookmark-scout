import type { Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import { seedFolder } from './popup-helpers';
import { readSettings, setSettings } from './storage';

/**
 * Access for local AI agents. The bridge program is not installed in the test browser, so the
 * worker's `runtime.connectNative` is replaced by a port the test plays the program on: it records
 * what the extension posts and delivers what the test sends.
 */

test.use({ grantPermissions: ['nativeMessaging'] });

type FakeBridge = { posted: Record<string, unknown>[]; connects: string[]; disconnects: number };

async function installFakeBridge(worker: Worker) {
  await worker.evaluate(() => {
    type Listener = (message: unknown) => void;
    const state = {
      posted: [] as unknown[],
      connects: [] as string[],
      disconnects: 0,
      deliver: undefined as Listener | undefined,
    };
    Object.assign(globalThis, { __fakeBridge: state });
    Object.defineProperty(chrome.runtime, 'connectNative', {
      configurable: true,
      value: (name: string) => {
        state.connects.push(name);
        const messageListeners: Listener[] = [];
        state.deliver = (message) => {
          for (const listener of messageListeners) listener(message);
        };
        return {
          name,
          postMessage: (message: unknown) => state.posted.push(JSON.parse(JSON.stringify(message))),
          disconnect: () => {
            state.disconnects += 1;
          },
          onMessage: { addListener: (listener: Listener) => messageListeners.push(listener) },
          onDisconnect: { addListener: () => undefined },
        };
      },
    });
  });
}

function bridgeState(worker: Worker): Promise<FakeBridge> {
  return worker.evaluate(() => {
    const { posted, connects, disconnects } = (
      globalThis as unknown as { __fakeBridge: FakeBridge }
    ).__fakeBridge;
    return { posted, connects, disconnects };
  });
}

function sendFromBridge(worker: Worker, message: unknown) {
  return worker.evaluate((sent) => {
    (
      globalThis as unknown as { __fakeBridge: { deliver?: (message: unknown) => void } }
    ).__fakeBridge.deliver?.(sent);
  }, message);
}

test('Options turns on access for local AI agents, which look up bookmarks through the bridge', async ({
  extensionBrowser,
  extensionId,
  extensionWorker,
  page,
}) => {
  await seedFolder(extensionWorker, 'Agent Docs', [
    { title: 'Bridge handbook', url: 'https://example.com/handbook?token=secret123' },
  ]);
  await installFakeBridge(extensionWorker);
  await setSettings(extensionWorker, { language: 'en' });

  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByRole('tab', { name: 'AI', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Allow local AI agents' });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect
    .poll(async () => (await readSettings(extensionWorker)).agentBridgeEnabled)
    .toBe(true);

  // The extension starts the bridge program and tells it which actions agents may use.
  await expect
    .poll(async () => (await bridgeState(extensionWorker)).connects)
    .toEqual(['com.bookmark_scout.bridge']);
  const [hello] = (await bridgeState(extensionWorker)).posted;
  // The build's browser: the Edge build reports itself as edge.
  const extensionBrowserId = extensionBrowser === 'msedge' ? 'edge' : 'chrome';
  expect(hello).toMatchObject({ type: 'hello', protocol: 1, browser: extensionBrowserId });
  const tools = ((hello?.tools ?? []) as { name: string }[]).map((tool) => tool.name);
  expect(tools).toContain('searchBookmarks');
  expect(tools).not.toContain('applyChanges');

  const status = page.getByTestId('agent-bridge-status').getByRole('status');
  await expect(status).toHaveText(/Starting the bridge program/);
  await sendFromBridge(extensionWorker, { type: 'ready' });
  await expect(status).toHaveText(/Ready\. AI agents on this computer/);

  // A call is answered from the bookmarks, with private values hidden.
  await sendFromBridge(extensionWorker, {
    type: 'call',
    id: '1.1',
    client: { name: 'E2E agent' },
    tool: 'searchBookmarks',
    args: { query: 'bridge handbook' },
  });
  await expect
    .poll(async () => (await bridgeState(extensionWorker)).posted.find((m) => m.id === '1.1'))
    .toMatchObject({
      type: 'result',
      isError: false,
      result: {
        results: [
          expect.objectContaining({
            title: 'Bridge handbook',
            url: 'https://example.com/handbook?token=REDACTED',
          }),
        ],
      },
    });

  // Turning an action off sends a new tool list without it, and a call for it is refused.
  await page
    .getByTestId('agent-bridge-actions')
    .getByRole('checkbox', { name: 'Search bookmarks' })
    .click();
  await expect
    .poll(async () => {
      const latest = (await bridgeState(extensionWorker)).posted.filter((m) => m.type === 'hello');
      return ((latest.at(-1)?.tools ?? []) as { name: string }[]).map((tool) => tool.name);
    })
    .not.toContain('searchBookmarks');
  await sendFromBridge(extensionWorker, {
    type: 'call',
    id: '1.2',
    client: { name: 'E2E agent' },
    tool: 'searchBookmarks',
    args: { query: 'bridge' },
  });
  await expect
    .poll(async () => (await bridgeState(extensionWorker)).posted.find((m) => m.id === '1.2'))
    .toMatchObject({ isError: true, result: { error: { code: 'not_allowed' } } });

  // Turning access off closes the connection.
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect.poll(async () => (await bridgeState(extensionWorker)).disconnects).toBe(1);
});
