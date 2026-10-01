import { describe, expect, it } from 'vitest';
import { readPageIndexFromHistory } from '@/hooks/use-bookmarks-page';

describe('readPageIndexFromHistory', () => {
  it('returns the table page saved on a history entry', () => {
    expect(readPageIndexFromHistory({ folderId: '7', pageIndex: 2 })).toBe(2);
  });

  it('starts on the first page for entries without a valid saved page', () => {
    expect(readPageIndexFromHistory(null)).toBe(0);
    expect(readPageIndexFromHistory({ folderId: '7' })).toBe(0);
    expect(readPageIndexFromHistory({ pageIndex: -1 })).toBe(0);
    expect(readPageIndexFromHistory({ pageIndex: 1.5 })).toBe(0);
    expect(readPageIndexFromHistory({ pageIndex: '3' })).toBe(0);
  });
});
