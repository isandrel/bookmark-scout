/**
 * Latency and scrolling measurements for extension pages, taken from outside the app: an init
 * script records input timestamps, Long Animation Frames, and Event Timing entries, and a
 * requestAnimationFrame check reports the first frame in which the expected UI is on screen.
 * The extension itself carries no measurement code.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BrowserContext,
  type CDPSession,
  expect,
  type Page,
  type TestInfo,
  type Worker,
} from '@playwright/test';
import { parse } from 'smol-toml';
import { z } from 'zod';

const directory = path.dirname(fileURLToPath(import.meta.url));

/** How long an action may take before the scenario fails instead of reporting a number. */
const ACTION_TIMEOUT_MS = 60_000;

const perfConfigSchema = z.strictObject({
  library: z.strictObject({
    areas: z.number().int().positive(),
    topics_per_area: z.number().int().positive(),
    pages_per_topic: z.number().int().nonnegative(),
    url_base: z.url(),
  }),
  run: z.strictObject({
    cpu_throttle: z.number().min(1),
    ci_cpu_throttle: z.number().min(1),
    repeats: z.number().int().positive(),
    scroll_steps: z.number().int().positive(),
    scroll_step_px: z.number().int().positive(),
    long_frame_ms: z.number().positive(),
  }),
  jobs: z.strictObject({
    repeats: z.number().int().positive(),
    pause_after_items: z.number().int().positive(),
    concurrency: z.number().int().positive(),
  }),
  /** Upper bounds for the median of each metric, in milliseconds; a metric without one is only reported. */
  budgets_ms: z.record(z.string(), z.number().positive()),
});

export const perfConfig = perfConfigSchema.parse(
  parse(readFileSync(path.join(directory, 'perf.toml'), 'utf8')),
);

/**
 * CI runners are already slower than the laptop the budgets were set on, so they get a lighter
 * slowdown; the budgets then mean about the same on both.
 */
export const CPU_THROTTLE = process.env.CI
  ? perfConfig.run.ci_cpu_throttle
  : perfConfig.run.cpu_throttle;

/** Folder and page titles of the synthetic library, so scenarios can search for known names. */
export const libraryNames = {
  area: (a: number) => `Area ${a}`,
  topic: (a: number, b: number) => `Topic ${a}-${b}`,
  page: (a: number, b: number, c: number) => `Page ${a}-${b}-${c}`,
};

/**
 * Seeds the library from config into the bookmarks bar; returns how many nodes were created.
 * Page addresses start with `urlBase` (a local server for scenarios that request them).
 */
export async function seedLibrary(
  worker: Worker,
  urlBase = perfConfig.library.url_base,
): Promise<number> {
  return worker.evaluate(
    async ({ areas, topics_per_area, pages_per_topic, base }) => {
      const [root] = await chrome.bookmarks.getTree();
      const bar = root.children?.find((node) => node.children !== undefined);
      if (!bar) throw new Error('No writable bookmark root found');
      let created = 0;
      for (let a = 0; a < areas; a++) {
        const area = await chrome.bookmarks.create({ parentId: bar.id, title: `Area ${a}` });
        created += 1;
        await Promise.all(
          Array.from({ length: topics_per_area }, async (_, b) => {
            const topic = await chrome.bookmarks.create({
              parentId: area.id,
              title: `Topic ${a}-${b}`,
            });
            await Promise.all(
              Array.from({ length: pages_per_topic }, (_, c) =>
                chrome.bookmarks.create({
                  parentId: topic.id,
                  title: `Page ${a}-${b}-${c}`,
                  url: `${base}/${a}/${b}/${c}`,
                }),
              ),
            );
            created += 1 + pages_per_topic;
          }),
        );
      }
      return created;
    },
    { ...perfConfig.library, base: urlBase },
  );
}

type Probe = {
  inputs: number[];
  loaf: { start: number; duration: number; blocking: number }[];
  events: { name: string; start: number; duration: number }[];
  firstSeen: Record<string, number>;
  frames: number[];
  recording: boolean;
};

/** Installed before any page script runs; `watch` lists selectors whose first frame on screen is recorded. */
function installProbe(watch: string[]) {
  const probe: Probe = {
    inputs: [],
    loaf: [],
    events: [],
    firstSeen: {},
    frames: [],
    recording: false,
  };
  (window as unknown as { __bsPerf: Probe }).__bsPerf = probe;
  const record = (event: Event) => probe.inputs.push(event.timeStamp);
  addEventListener('keydown', record, true);
  addEventListener('pointerdown', record, true);
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        blockingDuration: number;
      })[]) {
        probe.loaf.push({
          start: entry.startTime,
          duration: entry.duration,
          blocking: entry.blockingDuration,
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    // Long Animation Frames is Chromium-only.
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { interactionId?: number })[]) {
        if (entry.interactionId) {
          probe.events.push({ name: entry.name, start: entry.startTime, duration: entry.duration });
        }
      }
    }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  } catch {
    // Event Timing is unavailable.
  }
  const check = (now: number) => {
    for (const selector of watch) {
      if (probe.firstSeen[selector] === undefined && document.querySelector(selector)) {
        probe.firstSeen[selector] = now;
      }
    }
    if (watch.some((selector) => probe.firstSeen[selector] === undefined) && now < 60_000) {
      requestAnimationFrame(check);
    }
  };
  requestAnimationFrame(check);
}

/**
 * What the screen must show for an action to count as done: at least `minCount` (default 1)
 * visible elements matching `selector` (default `body`), each containing `text` when it is
 * given. Hidden elements do not count: collapsed panels keep their rows in the page.
 */
export type DoneWhen = { selector?: string; minCount?: number; text?: string };

/** Resolves with the time of the first frame that satisfies `done`, or rejects after `timeout` ms. */
function waitForFrame({ done, timeout }: { done: DoneWhen; timeout: number }): Promise<number> {
  const satisfied = () => {
    let count = 0;
    for (const element of document.querySelectorAll(done.selector ?? 'body')) {
      if (!element.checkVisibility()) continue;
      if (!done.text || (element.textContent ?? '').includes(done.text)) count += 1;
      if (count >= (done.minCount ?? 1)) return true;
    }
    return false;
  };
  const deadline = performance.now() + timeout;
  return new Promise((resolve, reject) => {
    const check = (now: number) => {
      if (satisfied()) resolve(now);
      else if (now > deadline)
        reject(new Error(`Not on screen within ${timeout} ms: ${JSON.stringify(done)}`));
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

const sessions = new WeakMap<Page, CDPSession>();

/**
 * Closes a page opened by `openMeasured`. A frozen page does not close, so after a few seconds
 * its renderer is crashed instead, which frees the CPU for the next run.
 */
export async function closeMeasured(page: Page): Promise<void> {
  const closed = await Promise.race([
    page.close().then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (closed) return;
  await sessions
    .get(page)
    ?.send('Page.crash')
    .catch(() => undefined);
  await page.close().catch(() => undefined);
}

/**
 * Opens `url` in a new, CPU-throttled page and returns it once every `watch` selector is on
 * screen, with the time (ms after navigation started) each first appeared.
 */
export async function openMeasured(
  context: BrowserContext,
  url: string,
  watch: string[],
  {
    size = { width: 1280, height: 900 },
    setup,
  }: { size?: { width: number; height: number }; setup?: (page: Page) => Promise<void> } = {},
): Promise<{ page: Page; firstSeen: Record<string, number> }> {
  const page = await context.newPage();
  await page.setViewportSize(size);
  await setup?.(page);
  await page.addInitScript(installProbe, watch);
  const cdp = await context.newCDPSession(page);
  sessions.set(page, cdp);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  await page.goto(url);
  await page.waitForFunction(
    (selectors) => {
      const seen = (window as unknown as { __bsPerf: Probe }).__bsPerf.firstSeen;
      return selectors.every((selector) => seen[selector] !== undefined);
    },
    watch,
    { timeout: 60_000 },
  );
  const firstSeen = await page.evaluate(
    () => (window as unknown as { __bsPerf: Probe }).__bsPerf.firstSeen,
  );
  return { page, firstSeen };
}

export type InteractionResult = {
  /**
   * The screen did not show the result within the action timeout. The page may be frozen, so
   * nothing more can be read from it; the other fields are then 0.
   */
  timedOut: boolean;
  /** From the last key press or click of the action to the first frame showing the result. */
  latency: number;
  /** Longest Event Timing duration among the action's inputs (input to next paint). */
  worstInput: number;
  /** Long Animation Frame blocking time while the action ran. */
  blocking: number;
};

/**
 * Resolves with `promise`, or with null after the action timeout. A frozen page runs no frames
 * and answers no evaluate calls, so every wait on it is bounded from here.
 */
async function withinTimeout<T>(promise: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ACTION_TIMEOUT_MS + 5_000);
    }),
  ]).catch(() => null);
  clearTimeout(timer);
  return result;
}

const TIMED_OUT: InteractionResult = { timedOut: true, latency: 0, worstInput: 0, blocking: 0 };

/** Input timing for an action that ran from `from` to `to` (page time), read from the probe. */
function readInputTiming({ from, to }: { from: number; to: number }) {
  const probe = (window as unknown as { __bsPerf: Probe }).__bsPerf;
  const inputs = probe.inputs.filter((time) => time >= from && time <= to);
  const events = probe.events.filter((event) => event.start >= from && event.start <= to);
  return {
    lastInput: inputs.at(-1) ?? from,
    worstInput: Math.max(0, ...events.map((event) => event.duration)),
    blocking: probe.loaf
      .filter((entry) => entry.start >= from && entry.start <= to)
      .reduce((total, entry) => total + entry.blocking, 0),
  };
}

/** Runs `act` and measures until the screen satisfies `done`. */
export async function measureInteraction(
  page: Page,
  act: () => Promise<void>,
  done: DoneWhen,
): Promise<InteractionResult> {
  const start = await page.evaluate(() => performance.now());
  const frame = page.evaluate(waitForFrame, { done, timeout: ACTION_TIMEOUT_MS });
  // Read only after `act`; a rejection before then must not go unhandled.
  frame.catch(() => undefined);
  await act();
  const end = await withinTimeout(frame);
  if (end === null) return TIMED_OUT;
  const timing = await withinTimeout(page.evaluate(readInputTiming, { from: start, to: end }));
  if (timing === null) return TIMED_OUT;
  return {
    timedOut: false,
    latency: end - timing.lastInput,
    worstInput: timing.worstInput,
    blocking: timing.blocking,
  };
}

/**
 * Runs `act` (typing, usually) and measures from its last input until the content of `root`
 * stops changing for `quietMs`: when the results of an incremental search have settled. Typing
 * a prefix already shows results, so "results are on screen" would end the measurement too early.
 */
export async function measureSettled(
  page: Page,
  act: () => Promise<void>,
  root: string,
  quietMs = 1_000,
): Promise<InteractionResult> {
  const start = await withinTimeout(
    page.evaluate((selector) => {
      const probe = (window as unknown as { __bsPerf: Probe & { lastMutation?: number } }).__bsPerf;
      probe.lastMutation = undefined;
      const target = document.querySelector(selector) ?? document.body;
      new MutationObserver(() => {
        probe.lastMutation = performance.now();
      }).observe(target, { subtree: true, childList: true, characterData: true, attributes: true });
      return performance.now();
    }, root),
  );
  if (start === null) return TIMED_OUT;
  await act();
  const settled = await withinTimeout(
    page.evaluate(
      ({ quiet, timeout }) =>
        new Promise<{ last: number | null }>((resolve, reject) => {
          const probe = (window as unknown as { __bsPerf: Probe & { lastMutation?: number } })
            .__bsPerf;
          const deadline = performance.now() + timeout;
          const check = (now: number) => {
            const last = probe.lastMutation ?? 0;
            const lastInput = probe.inputs.at(-1) ?? 0;
            if (now - Math.max(last, lastInput) >= quiet)
              resolve({ last: probe.lastMutation ?? null });
            else if (now > deadline) reject(new Error('Results never settled'));
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }),
      { quiet: quietMs, timeout: ACTION_TIMEOUT_MS },
    ),
  );
  if (settled === null) return TIMED_OUT;
  const end = await withinTimeout(page.evaluate(() => performance.now()));
  if (end === null) return TIMED_OUT;
  const timing = await withinTimeout(page.evaluate(readInputTiming, { from: start, to: end }));
  if (timing === null) return TIMED_OUT;
  return {
    timedOut: false,
    // Nothing changed after the last input: the results were already final.
    latency: settled.last === null ? 0 : Math.max(0, settled.last - timing.lastInput),
    worstInput: timing.worstInput,
    blocking: timing.blocking,
  };
}

export type ScrollResult = {
  /** Pixels the list under the pointer moved; 0 means nothing scrolled. */
  distance: number;
  /** Frames longer than `run.long_frame_ms` during the scroll. */
  longFrames: number;
  /** Longest gap between two frames. */
  worstFrame: number;
  /** 95th percentile frame time. */
  p95Frame: number;
  blocking: number;
};

/** Scrolls the page's main list with the mouse wheel and records every frame time. */
export async function measureScroll(page: Page): Promise<ScrollResult> {
  const { scroll_steps, scroll_step_px, long_frame_ms } = perfConfig.run;
  const start = await page.evaluate(() => {
    const probe = (window as unknown as { __bsPerf: Probe }).__bsPerf;
    probe.frames = [];
    probe.recording = true;
    let last = performance.now();
    const loop = (now: number) => {
      probe.frames.push(now - last);
      last = now;
      if (probe.recording) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return last;
  });
  // Expanding panels animate their height, so the list overflows only once they have opened.
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('*')].some(
          (element) =>
            element.scrollHeight > element.clientHeight &&
            /auto|scroll/.test(getComputedStyle(element).overflowY),
        ),
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  // The list that scrolls the furthest, tagged so every reading is of the same element.
  const target = await page.evaluate(() => {
    let best: Element | undefined;
    for (const element of document.querySelectorAll('*')) {
      const room = element.scrollHeight - element.clientHeight;
      if (room > 0 && /auto|scroll/.test(getComputedStyle(element).overflowY)) {
        if (!best || room > best.scrollHeight - best.clientHeight) best = element;
      }
    }
    if (!best) return null;
    best.setAttribute('data-perf-scroller', '');
    const box = best.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 200) };
  });
  if (!target) throw new Error('Nothing on the page scrolls');
  await page.mouse.move(target.x, target.y);
  const scrollTop = () =>
    page.evaluate(() => document.querySelector('[data-perf-scroller]')?.scrollTop ?? 0);
  const before = await scrollTop();
  for (let step = 0; step < scroll_steps; step++) {
    await page.mouse.wheel(0, scroll_step_px);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(300);
  const distance = (await scrollTop()) - before;
  await page.evaluate(() =>
    document.querySelector('[data-perf-scroller]')?.removeAttribute('data-perf-scroller'),
  );
  const frames = await page.evaluate(
    ({ from, longFrame }) => {
      const probe = (window as unknown as { __bsPerf: Probe }).__bsPerf;
      probe.recording = false;
      const frames = [...probe.frames].sort((a, b) => a - b);
      const blocking = probe.loaf
        .filter((entry) => entry.start >= from)
        .reduce((total, entry) => total + entry.blocking, 0);
      return {
        longFrames: frames.filter((frame) => frame > longFrame).length,
        worstFrame: frames.at(-1) ?? 0,
        p95Frame: frames[Math.floor(frames.length * 0.95)] ?? 0,
        blocking,
      };
    },
    { from: start, longFrame: long_frame_ms },
  );
  return { distance, ...frames };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Collects samples per metric for one test and writes them, with their medians, to the report. */
export class PerfReport {
  private readonly samples = new Map<string, number[]>();

  private readonly units = new Map<string, string>();
  private readonly timeouts = new Map<string, number>();

  /**
   * Records an interaction's latency as `metric`, and its slowest input as `inputMetric` when
   * given. Returns false when it timed out, so the run can stop using the page.
   */
  addInteraction(metric: string, result: InteractionResult, inputMetric?: string): boolean {
    if (result.timedOut) {
      this.timedOut(metric);
      return false;
    }
    this.add(metric, result.latency);
    if (inputMetric) this.add(inputMetric, result.worstInput);
    return true;
  }

  /** Records that `metric` did not finish within the action timeout in one run. */
  timedOut(metric: string) {
    this.timeouts.set(metric, (this.timeouts.get(metric) ?? 0) + 1);
    console.log(`  ${metric}: timed out after ${ACTION_TIMEOUT_MS} ms`);
  }

  /** Records one sample; `unit` is "ms" unless the metric counts something. */
  add(metric: string, value: number, unit = 'ms') {
    this.samples.set(metric, [...(this.samples.get(metric) ?? []), Math.round(value)]);
    this.units.set(metric, unit);
    // Progress, so a slow step shows up while the run is still going.
    console.log(`  ${metric}: ${Math.round(value)} ${unit}`);
  }

  /** Medians, with the budget each is held to. */
  summary() {
    const timedOutOnly = [...this.timeouts.keys()].filter((metric) => !this.samples.has(metric));
    return [
      ...[...this.samples],
      ...timedOutOnly.map((metric): [string, number[]] => [metric, []]),
    ].map(([metric, values]) => ({
      metric,
      unit: this.units.get(metric) ?? 'ms',
      median: values.length ? median(values) : null,
      max: values.length ? Math.max(...values) : null,
      timedOut: this.timeouts.get(metric) ?? 0,
      budget: perfConfig.budgets_ms[metric],
      samples: values,
    }));
  }

  /**
   * Writes `test-results/perf/<test>.json`, attaches it to the test, and fails the test (after
   * writing) for each metric whose median is over its budget or that timed out.
   */
  async write(testInfo: TestInfo) {
    const rows = this.summary();
    const out = path.resolve(directory, '../../test-results/perf');
    mkdirSync(out, { recursive: true });
    const file = path.join(out, `${testInfo.titlePath.at(-1)?.replace(/\W+/g, '-')}.json`);
    const report = {
      date: new Date().toISOString(),
      library: perfConfig.library,
      run: perfConfig.run,
      metrics: rows,
    };
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    await testInfo.attach('perf', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
    console.log(
      rows
        .map(
          ({ metric, unit, median: value, max, budget, timedOut }) =>
            `${metric.padEnd(30)} median ${String(value ?? '-').padStart(6)} ${unit.padEnd(6)} max ${String(max ?? '-').padStart(6)}${budget ? `  budget ${budget}` : ''}${timedOut ? `  timed out ${timedOut}x (> ${ACTION_TIMEOUT_MS} ms)` : ''}`,
        )
        .join('\n'),
    );
    for (const { metric, median: value, budget, timedOut } of rows) {
      if (budget === undefined) continue;
      expect.soft(timedOut, `${metric} timed out`).toBe(0);
      if (value !== null) expect.soft(value, `${metric} median`).toBeLessThanOrEqual(budget);
    }
    return rows;
  }
}
