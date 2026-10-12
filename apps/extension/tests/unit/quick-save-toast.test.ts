import { describe, expect, it } from 'vitest';
import {
  counterZoom,
  isBoundPage,
  isToastOnScreen,
  type ToastPlacement,
} from '@/entrypoints/quick-save-toast/toast';
import { languageDirection, SUPPORTED_LOCALES, toLanguageTag } from '@/hooks/use-i18n';

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
