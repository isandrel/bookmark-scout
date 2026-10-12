import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Worker } from '@playwright/test';
import { expect, test } from '../e2e/fixtures';
import { readStored, STORAGE_ITEMS, setSettings } from '../e2e/storage';
import { profileDir } from '../e2e/temp-dirs';

/**
 * The whole bridge, for real: the compiled bookmark-scout-mcp binary is registered as the test
 * browser's native host (in the profile's own NativeMessagingHosts folder), the extension starts
 * it, and this test drives `serve` over stdio as an MCP client would: list the tools, search,
 * propose a move, apply it after approving it in the extension's window, and undo it.
 *
 * Run with `nx run extension:test:e2e:bridge`, which builds the extension and the binary first.
 * Linux and macOS: Chromium reads user-level native hosts from the profile folder there; on
 * Windows it reads them from the registry only, so this suite does not run on Windows.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const BINARY =
  process.env.BOOKMARK_SCOUT_MCP_BIN ??
  path.resolve(here, '../../../../packages/mcp-bridge/dist/bookmark-scout-mcp');

// The native host inherits the browser's environment, and the browser this process's, so both
// ends meet in a fresh runtime folder instead of the user's real one.
const RUNTIME_DIR = mkdtempSync(path.join(tmpdir(), 'bsmcp-'));
process.env.BOOKMARK_SCOUT_MCP_RUNTIME_DIR = RUNTIME_DIR;
// The launcher goes under a temporary home too. On macOS, a program the browser starts from a
// protected folder (such as a checkout in ~/Documents) waits for a privacy prompt nobody sees, so
// locally set BOOKMARK_SCOUT_MCP_BIN to a copy of the binary outside such folders.
const HOME_DIR = mkdtempSync(path.join(tmpdir(), 'bsmcp-home-'));

test.use({ grantPermissions: ['nativeMessaging'] });

test.afterAll(() => {
  rmSync(RUNTIME_DIR, { recursive: true, force: true });
  rmSync(HOME_DIR, { recursive: true, force: true });
});

type RpcMessage = {
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  error?: unknown;
};
type ToolResult = {
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  content?: { text: string }[];
};

/** `serve` over stdio: newline-delimited JSON-RPC. */
function startServe() {
  const child: ChildProcessWithoutNullStreams = spawn(BINARY, ['serve'], { env: process.env });
  const messages: RpcMessage[] = [];
  let buffered = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buffered += chunk.toString('utf8');
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines) if (line.trim()) messages.push(JSON.parse(line));
  });
  let nextId = 0;
  const write = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = async (method: string, params: unknown = {}, timeout = 15_000) => {
    nextId += 1;
    const id = nextId;
    write({ jsonrpc: '2.0', id, method, params });
    await expect.poll(() => messages.some((message) => message.id === id), { timeout }).toBe(true);
    const reply = messages.find((message) => message.id === id) as RpcMessage;
    if (reply.error) throw new Error(JSON.stringify(reply.error));
    return reply.result ?? {};
  };
  const call = async (name: string, args: Record<string, unknown>, timeout?: number) =>
    (await request('tools/call', { name, arguments: args }, timeout)) as ToolResult;
  return { child, write, request, call };
}

async function parentOf(worker: Worker, id: string) {
  return worker.evaluate(
    async (bookmarkId) => (await chrome.bookmarks.get(bookmarkId))[0]?.parentId,
    id,
  );
}

/** Approves the one request the approval window shows. */
async function approveNext(page: Promise<Page>, change: RegExp) {
  const window = await page;
  const request = window.getByTestId('agent-approval');
  await expect(request).toContainText('From “bridge-e2e”');
  await expect(request).toContainText(change);
  await request.getByRole('button', { name: 'Approve' }).click();
}

test('an MCP client searches, moves a bookmark after approval in the extension, and undoes it', async ({
  context,
  extensionId,
  extensionWorker,
}, testInfo) => {
  test.skip(process.platform === 'win32', 'Chromium reads native hosts from the registry there');
  test.skip(!existsSync(BINARY), `Build the bridge first: ${BINARY}`);

  // Register the binary as this profile's native host, allowing this unpacked extension.
  const manifestDir = path.join(profileDir(testInfo), 'NativeMessagingHosts');
  mkdirSync(manifestDir, { recursive: true });
  execFileSync(BINARY, [
    'install',
    '--browser',
    'chromium',
    '--manifest-dir',
    manifestDir,
    '--home',
    HOME_DIR,
    '--extension-id',
    extensionId,
  ]);

  const { inbox, rust, book } = await extensionWorker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const bar = root.children?.find((node) => node.children !== undefined);
    if (!bar) throw new Error('No writable bookmark root');
    const inboxFolder = await chrome.bookmarks.create({ parentId: bar.id, title: 'Bridge Inbox' });
    const rustFolder = await chrome.bookmarks.create({ parentId: bar.id, title: 'Bridge Rust' });
    const created = await chrome.bookmarks.create({
      parentId: inboxFolder.id,
      title: 'The Rust Programming Language',
      url: 'https://doc.rust-lang.org/book/',
    });
    return { inbox: inboxFolder.id, rust: rustFolder.id, book: created.id };
  });

  await setSettings(extensionWorker, {
    language: 'en',
    agentBridgeEnabled: true,
    agentBridgeWrites: true,
  });
  // The whole status, so a failure shows the browser's reason.
  await expect
    .poll(() => readStored(extensionWorker, STORAGE_ITEMS.agentBridgeStatus), { timeout: 20_000 })
    .toEqual({ state: 'ready' });

  const serve = startServe();
  try {
    await serve.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'bridge-e2e', version: '1.0' },
    });
    serve.write({ jsonrpc: '2.0', method: 'notifications/initialized' });
    await expect
      .poll(
        async () =>
          ((await serve.request('tools/list')).tools as { name: string }[]).map(
            (tool) => tool.name,
          ),
        { timeout: 20_000 },
      )
      .toEqual(
        expect.arrayContaining(['searchBookmarks', 'proposeChanges', 'applyChanges', 'undoChange']),
      );

    const found = await serve.call('searchBookmarks', { query: 'rust programming language' });
    expect(found.isError).toBeFalsy();
    const results = found.structuredContent?.results as { ref: string; folder: string }[];
    expect(results[0]).toMatchObject({
      ref: `b:${book}`,
      folder: expect.stringMatching(/Bridge Inbox$/),
    });

    const proposed = await serve.call('proposeChanges', {
      summary: 'File the Rust book under Bridge Rust',
      changes: [{ action: 'moveBookmarks', input: { refs: [`b:${book}`], to: `f:${rust}` } }],
    });
    expect(proposed.isError).toBeFalsy();
    const planId = proposed.structuredContent?.planId as string;

    // Applying waits for the user, in the extension's approval window.
    const applyWindow = context.waitForEvent('page', (page) =>
      page.url().includes('agent-approval'),
    );
    const applying = serve.call('applyChanges', { planId }, 60_000);
    await approveNext(applyWindow, /Bridge Rust/);
    const applied = await applying;
    expect(applied.structuredContent).toMatchObject({ applied: 1 });
    expect(await parentOf(extensionWorker, book)).toBe(rust);

    const undoWindow = context.waitForEvent('page', (page) =>
      page.url().includes('agent-approval'),
    );
    const change = applied.structuredContent?.change as string;
    const undoing = serve.call('undoChange', { change }, 60_000);
    // The approval lists what the undo puts back, not just "Undo a change".
    await approveNext(undoWindow, /Move “The Rust Programming Language” back to Bridge Inbox/);
    expect((await undoing).isError).toBeFalsy();
    expect(await parentOf(extensionWorker, book)).toBe(inbox);

    // Applying the same plan or undoing the same change again is answered at once, with what to
    // do instead, and opens no approval window.
    const opened: string[] = [];
    const onPage = (page: Page) => opened.push(page.url());
    context.on('page', onPage);
    const again = await serve.call('applyChanges', { planId }, 10_000);
    expect(again.isError).toBe(true);
    expect(again.content?.[0]?.text).toContain(
      `Plan ${planId} does not exist, expired, or was already applied; call proposeChanges again.`,
    );
    const undoAgain = await serve.call('undoChange', { change }, 10_000);
    expect(undoAgain.isError).toBe(true);
    expect(undoAgain.content?.[0]?.text).toContain(
      `Change ${change} does not exist or was already undone; there is nothing to undo.`,
    );
    context.off('page', onPage);
    expect(opened.filter((url) => url.includes('agent-approval'))).toEqual([]);
  } finally {
    serve.child.kill();
  }
});
