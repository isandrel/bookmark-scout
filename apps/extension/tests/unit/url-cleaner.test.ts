import { beforeEach, describe, expect, it, vi } from 'vitest';

const live = vi.hoisted(() => ({ urls: new Map<string, string>(), failUpdate: new Set<string>() }));

vi.mock('@/services/bookmarks', () => ({
  getBookmark: vi.fn(async (id: string) => {
    if (!live.urls.has(id)) throw new Error('Bookmark not found.');
    return { id, url: live.urls.get(id) };
  }),
  updateBookmark: vi.fn(async (id: string, changes: { url: string }) => {
    if (live.failUpdate.has(id)) throw new Error('boom');
    live.urls.set(id, changes.url);
    return { id, url: changes.url };
  }),
}));

const { applyUrlCleanerPreviews, cleanBookmarkUrl, previewCleanUrls } = await import(
  '@/services/bookmark-tooling'
);

const options = {
  removeHash: false,
  sortQueryParams: true,
  dedupeQueryParams: true,
  preserveParams: [],
  removeParams: ['utm_source', 'fbclid'],
};

describe('URL cleaner', () => {
  it('preserves the encoding and valueless parameters of kept query entries', () => {
    expect(
      cleanBookmarkUrl('https://e2e.invalid/p?q=a%20b&amp&utm_source=x&plus=a+b', options),
    ).toEqual({
      cleanedUrl: 'https://e2e.invalid/p?amp&plus=a+b&q=a%20b',
      removedParams: ['utm_source'],
    });
  });

  it('does not report pure reordering or untouched URLs as cleanable', () => {
    expect(cleanBookmarkUrl('https://e2e.invalid/p?b=2&a=1', options)).toBeNull();
    expect(cleanBookmarkUrl('https://e2e.invalid/p?a=1#frag', options)).toBeNull();
  });

  it('removes tracking keys case-insensitively and keeps fragments unless configured', () => {
    expect(cleanBookmarkUrl('https://e2e.invalid/p?FBCLID=1&id=2#top', options)?.cleanedUrl).toBe(
      'https://e2e.invalid/p?id=2#top',
    );
    expect(
      cleanBookmarkUrl('https://e2e.invalid/p?id=2#top', { ...options, removeHash: true })
        ?.cleanedUrl,
    ).toBe('https://e2e.invalid/p?id=2');
  });

  it('dedupes identical key/value pairs only', () => {
    expect(cleanBookmarkUrl('https://e2e.invalid/p?a=1&a=1&a=2', options)).toEqual({
      cleanedUrl: 'https://e2e.invalid/p?a=1&a=2',
      removedParams: ['a'],
    });
  });

  it('skips non-web schemes', () => {
    expect(cleanBookmarkUrl('javascript:void(0)?utm_source=x', options)).toBeNull();
  });

  it('keeps raw titles so the view can localize untitled bookmarks', () => {
    const [preview] = previewCleanUrls(
      [{ id: '1', title: '', url: 'https://e2e.invalid/?utm_source=x' }],
      options,
    ).previews;
    expect(preview.title).toBe('');
  });
});

describe('applying URL cleaner previews', () => {
  const preview = (id: string, originalUrl: string) => ({
    id,
    title: id,
    folderPath: '',
    originalUrl,
    cleanedUrl: `${originalUrl.split('?')[0]}`,
    removedParams: ['utm_source'],
  });

  beforeEach(() => {
    live.urls = new Map([
      ['1', 'https://e2e.invalid/a?utm_source=x'],
      ['2', 'https://e2e.invalid/edited'],
      ['4', 'https://e2e.invalid/d?utm_source=x'],
    ]);
    live.failUpdate = new Set(['4']);
  });

  it('updates unchanged bookmarks and skips edited or deleted ones', async () => {
    const result = await applyUrlCleanerPreviews([
      preview('1', 'https://e2e.invalid/a?utm_source=x'),
      preview('2', 'https://e2e.invalid/b?utm_source=x'),
      preview('3', 'https://e2e.invalid/c?utm_source=x'),
      preview('4', 'https://e2e.invalid/d?utm_source=x'),
    ]);
    expect(result).toEqual({ updated: 1, skipped: 2, failed: 1 });
    expect(live.urls.get('1')).toBe('https://e2e.invalid/a');
    expect(live.urls.get('2')).toBe('https://e2e.invalid/edited');
  });
});
