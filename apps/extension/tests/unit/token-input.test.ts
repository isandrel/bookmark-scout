import { describe, expect, it } from 'vitest';
import { addTokens } from '@/components/ui/token-input';
import { parseBookmarkTags, tagKey } from '@/lib/bookmark-metadata-storage';

describe('addTokens', () => {
  it('adds new tokens in typed order and drops repeats by key', () => {
    expect(
      addTokens(['React'], parseBookmarkTags('react, docs、Docs，tools'), { keyOf: tagKey }),
    ).toEqual(['React', 'docs', 'tools']);
  });

  it('stops at the cap and skips tokens that are too long or not accepted', () => {
    expect(
      addTokens(['a'], ['bb', 'toolong', 'x', 'c', 'd'], {
        maxItems: 3,
        maxLength: 2,
        accept: (token) => token !== 'x',
      }),
    ).toEqual(['a', 'bb', 'c']);
  });

  it('returns the same values when nothing is added', () => {
    expect(addTokens(['a'], ['a'], {})).toEqual(['a']);
  });
});
