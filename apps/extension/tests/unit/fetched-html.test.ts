import { DOMParser as LinkedomParser } from 'linkedom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFetchedHtml, stripActiveHtml } from '@/lib/fetched-html';

describe('fetched page HTML', () => {
  beforeEach(() => vi.stubGlobal('DOMParser', LinkedomParser));

  it('removes scripts, links, refresh meta tags, and event handlers', () => {
    const html = [
      '<html><head><title>Docs</title>',
      '<meta name="description" content="A guide">',
      '<meta http-equiv="refresh" content="0;url=https://e2e.invalid/x">',
      '<link rel="modulepreload" href="https://e2e.invalid/m.js">',
      '<script src="https://e2e.invalid/a.js"></script>',
      '<script>window.x = "</div>";</script>',
      '</head><body onload="go()" class="page">',
      '<img src="i.png" onerror=\'x()\' alt="i" ONCLICK=y()>',
      '<script src="https://e2e.invalid/unclosed.js">',
    ].join('');
    const stripped = stripActiveHtml(html);
    expect(stripped).not.toMatch(/<script|<link|http-equiv|onload|onerror|onclick/i);
    const doc = parseFetchedHtml(html);
    expect(doc.title).toBe('Docs');
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('A guide');
    expect(doc.body.className).toBe('page');
    expect(doc.querySelector('img')?.getAttribute('alt')).toBe('i');
  });

  it('never looks into attribute values: addresses and titles stay exact', () => {
    const html =
      '<a href="https://e2e.invalid/?q= onload=1&x=>y" title="Turn onload=on" data-on="1">Link</a>';
    const anchor = parseFetchedHtml(html).querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('https://e2e.invalid/?q= onload=1&x=>y');
    expect(anchor?.getAttribute('title')).toBe('Turn onload=on');
    expect(anchor?.getAttribute('data-on')).toBe('1');
    expect(anchor?.textContent).toBe('Link');
  });
});
