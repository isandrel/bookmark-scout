/**
 * The popup and side panel open in their final layout: with AI on, a recent folder, the current
 * page already saved elsewhere, and the shortcut notice, nothing on the first frame moves or
 * changes afterwards. Every frame of the first second is recorded from inside the page.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { seedFolder } from './popup-helpers';
import { replaceSettings, STORAGE_ITEMS, seedAIServices, writeStored } from './storage';

// The side panel reads the current page only with `tabs`; the toolbar popup has activeTab.
test.use({ grantPermissions: ['tabs'] });

const SAVED_URL = 'https://e2e.invalid/open-stability/saved-page';
/** How long after the first frame to keep recording. */
const RECORD_MS = 1_200;

type Rect = [x: number, y: number, width: number, height: number];
type Frame = { time: number; placeholder: string | null; rects: Record<string, Rect> };

/**
 * Records, on every animation frame from the start of the page, where the parts a user aims at
 * are, plus the page's layout-shift score. Runs before the page's own scripts.
 */
function recordFrames(recordMs: number) {
  const frames: Frame[] = [];
  let shiftScore = 0;
  let firstAt: number | undefined;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & { value: number })[]) {
      shiftScore += entry.value;
    }
  }).observe({ type: 'layout-shift', buffered: true });
  const rectOf = (element: Element | null | undefined): Rect | undefined => {
    if (!element) return undefined;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return undefined;
    return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value)) as Rect;
  };
  const tick = () => {
    const input = document.querySelector<HTMLInputElement>('[data-slot="search-row"] input');
    if (input) {
      firstAt ??= performance.now();
      const rects: Record<string, Rect> = {};
      const add = (key: string, element: Element | null | undefined) => {
        const rect = rectOf(element);
        if (rect) rects[key] = rect;
      };
      add('search', input);
      for (const button of document.querySelectorAll('[data-slot="search-row-actions"] button')) {
        add(`button:${button.getAttribute('aria-label') ?? '?'}`, button);
      }
      add('firstRow', document.querySelector('.folder-item'));
      add('treeScroll', document.querySelector('[data-slot="popup-tree-scroll"]'));
      add('pageLine', document.querySelector('[data-testid="current-page-line"]'));
      add('savedIn', document.querySelector('[data-testid="current-page-saved-in"]'));
      add('recent', document.querySelector('[data-slot="recent-folder"]'));
      add(
        'notice',
        document.querySelector(
          '[data-testid="quick-save-shortcut-notice"], [data-testid="ai-setup-notice"]',
        ),
      );
      add('hints', document.querySelector('[data-testid="popup-hint-bar"]'));
      frames.push({ time: performance.now(), placeholder: input.placeholder, rects });
    }
    if (firstAt === undefined || performance.now() - firstAt < recordMs) {
      requestAnimationFrame(tick);
    } else {
      Object.assign(window, { __openFrames: { frames, shiftScore } });
    }
  };
  requestAnimationFrame(tick);
}

async function readFrames(page: Page): Promise<{ frames: Frame[]; shiftScore: number }> {
  await page.waitForFunction(() => '__openFrames' in window, undefined, { timeout: 15_000 });
  return page.evaluate(
    () =>
      (window as unknown as { __openFrames: { frames: Frame[]; shiftScore: number } }).__openFrames,
  );
}

/** Each part that moved, appeared, or went away after the first frame, at its first change. */
function changesAfterFirstFrame(frames: readonly Frame[]): string[] {
  const [first, ...rest] = frames;
  if (!first) return ['no frame showed the search box'];
  const changes = new Map<string, string>();
  const note = (key: string, message: string) => {
    if (!changes.has(key)) changes.set(key, message);
  };
  for (const frame of rest) {
    const at = Math.round(frame.time - first.time);
    if (frame.placeholder !== first.placeholder) {
      note(
        'placeholder',
        `placeholder "${first.placeholder}" -> "${frame.placeholder}" (+${at} ms)`,
      );
    }
    const keys = new Set([...Object.keys(first.rects), ...Object.keys(frame.rects)]);
    for (const key of keys) {
      const before = first.rects[key];
      const after = frame.rects[key];
      if (!before) note(key, `${key} appeared (+${at} ms)`);
      else if (!after) note(key, `${key} went away (+${at} ms)`);
      else if (before.some((value, index) => Math.abs(value - after[index]) > 1)) {
        note(key, `${key} moved ${before.join(',')} -> ${after.join(',')} (+${at} ms)`);
      }
    }
  }
  return [...changes.values()];
}

for (const surface of ['popup', 'sidepanel'] as const) {
  for (const language of ['en', 'zh_CN'] as const) {
    test(`[${surface}, ${language}] opens in its final layout with AI, a recent folder, and a saved page`, async ({
      extensionId,
      extensionWorker,
      page,
    }, testInfo) => {
      await replaceSettings(extensionWorker, {
        language,
        aiEnabled: true,
        aiAutoTriggerOnOpen: false,
      });
      // Two services also show the service switcher, the most buttons the header has.
      await seedAIServices(extensionWorker, [
        {
          provider: 'custom',
          id: 'one',
          name: 'One',
          model: 'm',
          credentials: { baseUrl: 'https://e2e.invalid/v1' },
        },
        {
          provider: 'custom',
          id: 'two',
          name: 'Two',
          model: 'm',
          credentials: { baseUrl: 'https://e2e.invalid/v1' },
        },
      ]);
      const { folderId } = await seedFolder(extensionWorker, 'E2E Open Stability', [
        { title: 'Saved page', url: SAVED_URL },
      ]);
      await writeStored(extensionWorker, STORAGE_ITEMS.recentFolders, [
        { id: folderId, title: 'E2E Open Stability', lastUsed: 1 },
      ]);
      // Pages open as tabs here, so the "current page" would be the page itself.
      await page.addInitScript((url) => {
        chrome.tabs.query = (async () => [
          { id: 99, index: 0, windowId: 1, active: true, title: 'E2E Saved page', url },
        ]) as unknown as typeof chrome.tabs.query;
      }, SAVED_URL);
      await page.addInitScript(recordFrames, RECORD_MS);
      await page.setViewportSize({ width: 400, height: 600 });

      await page.goto(`chrome-extension://${extensionId}/${surface}.html`);
      const { frames, shiftScore } = await readFrames(page);
      const changes = changesAfterFirstFrame(frames);
      const description = `${frames.length} frames, layout shift score ${shiftScore.toFixed(4)}, ${
        changes.length
      } changes${changes.length ? `: ${changes.join('; ')}` : ''}`;
      testInfo.annotations.push({ type: 'layout', description });
      // Printed too, so a run's log keeps the measurement for before-and-after comparisons.
      console.log(`[${surface}, ${language}] ${description}`);

      // The final layout has everything the scenario sets up, so the test checks the right page.
      const last = frames.at(-1)?.rects ?? {};
      expect(Object.keys(last)).toEqual(
        expect.arrayContaining(['firstRow', 'pageLine', 'savedIn', 'recent', 'notice', 'hints']),
      );
      expect(Object.keys(last).filter((key) => key.startsWith('button:'))).toHaveLength(5);
      expect(changes).toEqual([]);
      expect(shiftScore).toBeLessThan(0.01);
    });
  }
}
