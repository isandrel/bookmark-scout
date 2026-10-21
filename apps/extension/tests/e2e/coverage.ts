/**
 * Collects V8 coverage from the extension's pages and its background service worker during the
 * Chromium suite when `BS_E2E_COVERAGE=1` (build/e2e-coverage.ts), and, as a global teardown,
 * turns what every worker saved into the reports in `coverage/e2e`. Off by default: then nothing
 * here runs.
 *
 * Playwright measures pages only, so the service worker is reached over a DevTools port the
 * browser opens in this mode (`coverageLaunchArgs`), from the moment its test's context opens.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { CoverageReport } from 'monocart-coverage-reports';
import { e2eCoverage, e2eCoverageEnabled } from '../../build/e2e-coverage';

const appRoot = path.resolve(import.meta.dirname, '../..');

function report() {
  return new CoverageReport({
    name: 'Bookmark Scout end-to-end coverage',
    outputDir: path.join(appRoot, e2eCoverage.reports_directory),
    reports: e2eCoverage.reporters,
    // Only the extension's own scripts; the inline source maps lead back to its sources.
    entryFilter: (entry) => entry.url.startsWith('chrome-extension://'),
    // The extension's own sources only: dependencies keep their node_modules path and are left out.
    sourcePath: (filePath) =>
      filePath.includes('node_modules') ? filePath : filePath.replace(/^(\.\.\/)+/, ''),
    sourceFilter: (sourcePath) =>
      !sourcePath.includes('node_modules') &&
      e2eCoverage.include.some((glob) => path.matchesGlob(sourcePath, glob)),
  });
}

/** The browser flag that opens the DevTools port the service worker is measured over. */
export function coverageLaunchArgs(): string[] {
  return e2eCoverageEnabled() ? ['--remote-debugging-port=0'] : [];
}

/** How long to wait for the port file and the worker, in ms, before measuring pages only. */
const WORKER_WAIT_MS = 10_000;
const WORKER_POLL_MS = 50;

/** A DevTools connection to one target, with replies matched to requests by id. */
type DevTools = { send<T>(method: string, params?: object): Promise<T>; close(): void };

async function connect(url: string): Promise<DevTools> {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let next = 0;
  const waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: { message: string };
    };
    const reply = message.id === undefined ? undefined : waiting.get(message.id);
    if (!reply || message.id === undefined) return;
    waiting.delete(message.id);
    if (message.error) reply.reject(new Error(message.error.message));
    else reply.resolve(message.result);
  });
  // A worker the test stopped closes the socket: whatever was asked fails rather than hangs.
  socket.addEventListener('close', () => {
    for (const reply of waiting.values()) reply.reject(new Error('DevTools connection closed'));
    waiting.clear();
  });
  return {
    send: <T>(method: string, params: object = {}) =>
      new Promise<T>((resolve, reject) => {
        next += 1;
        waiting.set(next, { resolve: resolve as (value: unknown) => void, reject });
        socket.send(JSON.stringify({ id: next, method, params }));
      }),
    close: () => socket.close(),
  };
}

/** Polls `read` until it returns a value or the wait is over. */
async function poll<T>(read: () => T | undefined | Promise<T | undefined>): Promise<T | undefined> {
  for (const deadline = Date.now() + WORKER_WAIT_MS; Date.now() < deadline; ) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, WORKER_POLL_MS));
  }
  return undefined;
}

/** Starts precise coverage in the extension's service worker, over the profile's DevTools port. */
async function startWorker(userDataDir: string): Promise<DevTools | undefined> {
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  const port = await poll(() =>
    existsSync(portFile) ? readFileSync(portFile, 'utf8').split('\n')[0] : undefined,
  );
  if (!port) return undefined;
  const target = await poll(async () => {
    const targets = (await (await fetch(`http://localhost:${port}/json/list`)).json()) as {
      type: string;
      url: string;
      webSocketDebuggerUrl: string;
    }[];
    return targets.find(
      (found) => found.type === 'service_worker' && found.url.startsWith('chrome-extension://'),
    );
  });
  if (!target) return undefined;
  const devtools = await connect(target.webSocketDebuggerUrl);
  await devtools.send('Profiler.enable');
  await devtools.send('Debugger.enable');
  await devtools.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  return devtools;
}

/** The worker's coverage so far, in the shape Playwright gives for pages. */
async function takeWorker(devtools: DevTools) {
  const { result } = await devtools.send<{
    result: { scriptId: string; url: string; functions: unknown[] }[];
  }>('Profiler.takePreciseCoverage');
  const scripts = result.filter((script) => script.url.startsWith('chrome-extension://'));
  return Promise.all(
    scripts.map(async (script) => ({
      ...script,
      source: (
        await devtools.send<{ scriptSource: string }>('Debugger.getScriptSource', {
          scriptId: script.scriptId,
        })
      ).scriptSource,
    })),
  );
}

const workers = new WeakMap<BrowserContext, Promise<DevTools | undefined>>();

const started = new WeakSet<Page>();

async function start(page: Page): Promise<void> {
  if (started.has(page)) return;
  started.add(page);
  await page.coverage.startJSCoverage({ resetOnNavigation: false }).catch(() => undefined);
}

/**
 * Starts collecting on every page of `context`, from the first script it runs, and in its service
 * worker, whose profile is `userDataDir`.
 */
export function watchCoverage(context: BrowserContext, userDataDir: string): void {
  if (!e2eCoverageEnabled()) return;
  for (const page of context.pages()) void start(page);
  context.on('page', (page) => void start(page));
  workers.set(
    context,
    startWorker(userDataDir).catch(() => undefined),
  );
}

/** Saves the coverage of the pages still open in `context`; call before it closes. */
export async function saveCoverage(context: BrowserContext): Promise<void> {
  if (!e2eCoverageEnabled()) return;
  const entries = (
    await Promise.all(
      context
        .pages()
        .filter((page) => started.has(page) && !page.isClosed())
        .map((page) => page.coverage.stopJSCoverage().catch(() => [])),
    )
  ).flat();
  const devtools = await workers.get(context);
  if (devtools) {
    // A worker the test stopped has nothing left to give; its pages still count.
    entries.push(...(await takeWorker(devtools).catch(() => [])));
    devtools.close();
  }
  if (entries.length > 0) await report().add(entries);
}

/** Global teardown: merges what the workers saved into the reports. */
export default async function generateCoverage(): Promise<void> {
  if (!e2eCoverageEnabled()) return;
  await report().generate();
}
