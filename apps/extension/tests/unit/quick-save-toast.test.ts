import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  counterZoom,
  isBoundPage,
  isToastOnScreen,
  TOAST_FONT_FAMILIES,
  TOAST_THEME,
  type ToastPlacement,
} from '@/entrypoints/quick-save-toast/toast';
import { languageDirection, SUPPORTED_LOCALES, toLanguageTag } from '@/hooks/use-i18n';
import { appRoot } from '../config-files';

/**
 * The decisions the quick save notification makes in the page, without a page: whether it is on
 * screen, whether the tab still shows the page it belongs to, and how it cancels a page's zoom.
 * Drawing it on real pages is covered by tests/e2e/quick-save-notification.spec.ts.
 */

const viewport = { width: 1200, height: 800 };
const placed = (rect: ToastPlacement['rect'], hitsCenter = true): ToastPlacement => ({
  rect,
  viewport,
  hitsCenter,
});

describe('isToastOnScreen', () => {
  it('accepts a notification inside the viewport that is on top at its center', () => {
    expect(isToastOnScreen(placed({ left: 824, top: 16, right: 1184, bottom: 120 }), 2)).toBe(true);
    // Rounding on a zoomed page may put it a pixel out.
    expect(isToastOnScreen(placed({ left: 824, top: -1, right: 1201, bottom: 120 }), 2)).toBe(true);
  });

  it('rejects one held in place by a transformed body and scrolled away', () => {
    // body { transform } made the body its containing block; the page is scrolled 1500px down.
    expect(isToastOnScreen(placed({ left: 824, top: -1484, right: 1184, bottom: -1380 }), 2)).toBe(
      false,
    );
    expect(
      isToastOnScreen(placed({ left: 824, top: 16, right: 1184, bottom: 120 }, false), 2),
    ).toBe(false);
  });

  it('rejects one partly outside the viewport, or with no size', () => {
    expect(isToastOnScreen(placed({ left: 1000, top: 16, right: 1360, bottom: 120 }), 2)).toBe(
      false,
    );
    expect(isToastOnScreen(placed({ left: 824, top: 700, right: 1184, bottom: 900 }), 2)).toBe(
      false,
    );
    expect(isToastOnScreen(placed({ left: 0, top: 0, right: 0, bottom: 0 }), 2)).toBe(false);
  });
});

describe('isBoundPage', () => {
  const page = { document: 'doc-1', url: 'https://news.example/a?x=1#section' };

  it('draws in the same document at the same address, scrolled to any fragment', () => {
    expect(isBoundPage(undefined, page)).toBe(true);
    expect(isBoundPage({ document: 'doc-1', url: 'https://news.example/a?x=1' }, page)).toBe(true);
    expect(isBoundPage({ url: 'https://news.example/a?x=1#top' }, page)).toBe(true);
  });

  it('refuses a new document or another address in the same tab', () => {
    expect(isBoundPage({ document: 'doc-0', url: 'https://news.example/a?x=1' }, page)).toBe(false);
    expect(isBoundPage({ document: 'doc-1', url: 'https://news.example/b' }, page)).toBe(false);
    expect(isBoundPage({ url: 'https://news.example/a?x=2' }, page)).toBe(false);
  });
});

describe('counterZoom', () => {
  it('cancels a zoom on the root element and leaves none alone', () => {
    expect(counterZoom('2')).toBe('0.5');
    expect(counterZoom('0.5')).toBe('2');
    expect(counterZoom('1')).toBe('1');
    // Browsers without CSS zoom report nothing.
    expect(counterZoom('')).toBe('1');
    expect(counterZoom('normal')).toBe('1');
  });
});

describe('languageDirection', () => {
  it('reads right-to-left languages and scripts', () => {
    expect(languageDirection('ar')).toBe('rtl');
    expect(languageDirection('he-IL')).toBe('rtl');
    expect(languageDirection('fa')).toBe('rtl');
    expect(languageDirection('az-Arab')).toBe('rtl');
    expect(languageDirection('en')).toBe('ltr');
    expect(languageDirection('not a tag')).toBe('ltr');
  });

  it('is left-to-right for every bundled language', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(languageDirection(toLanguageTag(locale)), locale).toBe('ltr');
    }
  });
});

/**
 * The notification copies the theme's colors, shadow, and fonts because the page has none of the
 * extension's CSS; these fail when a copy drifts from src/styles/theme.css.
 */
describe('the notification theme matches theme.css', () => {
  const css = readFileSync(path.join(appRoot, 'src/styles/theme.css'), 'utf8');
  /** The custom properties of the first rule with exactly this selector. */
  const tokens = (selector: string) => {
    const start = css.indexOf(`\n${selector} {`);
    const body = css.slice(start, css.indexOf('}', start));
    return Object.fromEntries(
      [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
    );
  };
  /** `H S% L%` channels as a lowercase hex color. */
  const hex = (channels: string) => {
    const [h, s, l] = channels.split(/\s+/).map((part) => Number.parseFloat(part));
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const channel = (n: number) => {
      const k = (n + h / 30) % 12;
      const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(value * 255)
        .toString(16)
        .padStart(2, '0');
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
  };
  const resolve = (value: string) => (/^[\d.]+ [\d.]+% [\d.]+%$/.test(value) ? hex(value) : value);

  it.each([
    ['light', ':root'],
    ['dark', '.dark'],
  ] as const)('in %s', (theme, selector) => {
    const themed = tokens(selector);
    for (const [name, entry] of Object.entries(TOAST_THEME)) {
      expect(themed[entry.token], `--${entry.token}`).toBeDefined();
      expect(entry[theme], `${name} (--${entry.token})`).toBe(resolve(themed[entry.token]));
    }
  });

  it('lists the theme fonts a page can use, in their order', () => {
    const stack = /\n\s*--font-sans:\s*([^;]+);/.exec(css)?.[1] ?? '';
    const bundled = new Set(
      [...css.matchAll(/@font-face\s*\{[^}]*font-family:\s*'([^']+)'/g)].map(
        ([, family]) => family,
      ),
    );
    const families = stack.split(',').map((family) => family.trim().replace(/^'|'$/g, ''));
    // A bundled face is usable only as an installed copy, named without "Variable".
    const usable = families.flatMap((family) => {
      if (!bundled.has(family)) return [family];
      return family.endsWith(' Variable') ? [family.slice(0, -' Variable'.length)] : [];
    });
    expect(usable.length).toBeGreaterThan(1);
    expect(TOAST_FONT_FAMILIES.filter((family) => usable.includes(family))).toEqual(usable);
  });
});
