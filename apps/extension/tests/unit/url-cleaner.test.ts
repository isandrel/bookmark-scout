import { describe, expect, it } from 'vitest';
import { createParamNameMatcher } from '@/lib/param-name-patterns';
import { cleanBookmarkUrl, previewCleanUrls } from '@/services/bookmark-tooling';

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

describe('query parameter name patterns', () => {
  it('matches whole names, and every name a trailing * starts', () => {
    const matches = createParamNameMatcher(['utm_*', 'fbclid']);
    expect(['utm_source', 'UTM_Name', 'utm_', 'fbclid', 'FBCLID'].every(matches)).toBe(true);
    expect(['utm', 'xutm_source', 'fbclid2', 'ref'].some(matches)).toBe(false);
  });

  it('removes a Reddit share link parameter by the default pattern, and a preserved name wins', () => {
    const reddit = 'https://www.reddit.com/r/csMajors/comments/s2b1iy/x/?utm_name=iossmf';
    expect(cleanBookmarkUrl(reddit, { ...options, removeParams: ['utm_*'] })).toEqual({
      cleanedUrl: 'https://www.reddit.com/r/csMajors/comments/s2b1iy/x/',
      removedParams: ['utm_name'],
    });
    expect(
      cleanBookmarkUrl(`${reddit}&utm_source=x`, {
        ...options,
        removeParams: ['utm_*'],
        preserveParams: ['utm_name'],
      })?.cleanedUrl,
    ).toBe(`${reddit}`);
  });
});
