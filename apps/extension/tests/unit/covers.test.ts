import { DOMParser as LinkedomParser } from 'linkedom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CoverImage,
  clearCovers,
  getCoverImage,
  getCoverInfos,
  getCoverSummary,
  isCoverCurrent,
  pruneCovers,
  saveCovers,
} from '@/lib/cover-store';
import { findCoverUrls, mayFetchCover } from '@/services/covers';

const PAGE = 'https://news.example.com/story/1';

describe('cover candidates in a page head', () => {
  beforeEach(() => vi.stubGlobal('DOMParser', LinkedomParser));

  it('takes Open Graph before Twitter cards, resolved against the page, web URLs only', () => {
    const html = [
      '<html><head>',
      '<meta name="twitter:image" content="https://cdn.example.net/card.jpg">',
      '<meta property="og:image" content="/cover.jpg#top">',
      '<meta property="og:image" content="javascript:alert(1)">',
      '<meta property="og:image" content="data:image/png;base64,AAAA">',
      '</head><body></body></html>',
    ].join('');
    expect(findCoverUrls(html, PAGE)).toEqual([
      'https://news.example.com/cover.jpg',
      'https://cdn.example.net/card.jpg',
    ]);
  });

  it('finds nothing in a page that names no image', () => {
    expect(findCoverUrls('<html><head><title>Plain</title></head></html>', PAGE)).toEqual([]);
  });
});

describe('where a cover may be downloaded from', () => {
  const noAccess = async () => false;

  it('allows the site of the page, including its other subdomains', async () => {
    expect(await mayFetchCover('https://img.example.com/a.jpg', PAGE, true, noAccess)).toBe(true);
  });

  it('refuses another site unless the user gave access to it', async () => {
    const image = 'https://cdn.example.net/a.jpg';
    expect(await mayFetchCover(image, PAGE, true, noAccess)).toBe(false);
    expect(await mayFetchCover(image, PAGE, true, async (site) => site === 'example.net')).toBe(
      true,
    );
  });

  it('refuses the local network while Skip Local Network Pages is on, and other schemes', async () => {
    const granted = async () => true;
    expect(await mayFetchCover('http://192.168.1.4/a.jpg', PAGE, true, granted)).toBe(false);
    expect(await mayFetchCover('http://192.168.1.4/a.jpg', PAGE, false, granted)).toBe(true);
    expect(await mayFetchCover('file:///etc/a.jpg', PAGE, false, granted)).toBe(false);
  });
});

const cover = (bookmarkId: string, bytes: number, url = `https://site.example/${bookmarkId}`) =>
  ({
    bookmarkId,
    url,
    width: 4,
    height: 2,
    type: 'image/webp',
    data: new Uint8Array(bytes).buffer,
  }) satisfies CoverImage;

describe('stored covers', () => {
  beforeEach(async () => {
    await clearCovers();
  });

  it('belong to the address they were fetched from', async () => {
    await saveCovers([cover('a', 10)], 1000);
    const info = (await getCoverInfos()).get('a');
    expect(isCoverCurrent(info, 'https://site.example/a')).toBe(true);
    expect(isCoverCurrent(info, 'https://site.example/moved')).toBe(false);
    expect((await getCoverImage('a', 'https://site.example/a'))?.size).toBe(10);
    expect(await getCoverImage('a', 'https://site.example/moved')).toBeUndefined();
  });

  it('remove the oldest past the storage limit', async () => {
    // Only the clock: IndexedDB needs real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1000);
      await saveCovers([cover('old', 60)], 100);
      vi.setSystemTime(2000);
      expect(await saveCovers([cover('new', 60)], 100)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
    expect([...(await getCoverInfos()).keys()]).toEqual(['new']);
    expect(await getCoverSummary()).toEqual({ covers: 1, bytes: 60 });
  });

  it('drop covers of bookmarks that are gone, and clear without touching anything else', async () => {
    await saveCovers([cover('a', 5), cover('gone', 5)], 1000);
    expect(await pruneCovers(new Set(['a']))).toBe(1);
    expect([...(await getCoverInfos()).keys()]).toEqual(['a']);
    await clearCovers();
    expect(await getCoverSummary()).toEqual({ covers: 0, bytes: 0 });
  });
});
