import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  BOOKMARK_METADATA_STORAGE_KEY,
  getStoredBookmarkMetadata,
  mergeStoredBookmarkMetadata,
  reconcileStoredBookmarkMetadata,
  removeStoredBookmarkMetadata,
  saveBookmarkMetadata,
} from '@/lib/bookmark-metadata-storage';
import { suggestBookmarkTags, summarizeBookmarksWithAI } from '@/services/ai-bookmark-tools';
import type { AISettings } from '@/services/ai-client';
import type { BookmarkTreeNode } from '@/types';

const mocks = vi.hoisted(() => ({ generateObject: vi.fn() }));

vi.mock('ai', () => ({ generateObject: mocks.generateObject }));

async function readRawMetadata() {
  const result = await fakeBrowser.storage.local.get(BOOKMARK_METADATA_STORAGE_KEY);
  return result[BOOKMARK_METADATA_STORAGE_KEY];
}

describe('bookmark metadata storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    mocks.generateObject.mockReset();
  });

  it('saves, edits, reads, and removes metadata under the AI context export key', async () => {
    await saveBookmarkMetadata('b1', { tags: [' research ', 'Research', 'tools'], summary: ' A ' });

    expect(await readRawMetadata()).toEqual({ b1: { tags: ['research', 'tools'], summary: 'A' } });
    expect(await getStoredBookmarkMetadata(['b1', 'missing'])).toEqual({
      b1: { tags: ['research', 'tools'], summary: 'A' },
    });

    await saveBookmarkMetadata('b1', { tags: ['reading'], summary: '' });
    expect(await getStoredBookmarkMetadata(['b1'])).toEqual({ b1: { tags: ['reading'] } });

    await removeStoredBookmarkMetadata(['b1']);
    expect(await getStoredBookmarkMetadata(['b1'])).toEqual({});
    expect(await readRawMetadata()).toBeUndefined();
  });

  it('drops a record that is saved empty', async () => {
    await saveBookmarkMetadata('b1', { tags: ['keep'] });
    await saveBookmarkMetadata('b2', { tags: ['old'] });
    await saveBookmarkMetadata('b2', { tags: [], summary: '   ' });

    expect(await readRawMetadata()).toEqual({ b1: { tags: ['keep'] } });
  });

  it('ignores malformed stored values', async () => {
    await fakeBrowser.storage.local.set({
      [BOOKMARK_METADATA_STORAGE_KEY]: {
        good: { tags: ['ok', 3, ''], summary: 'fine' },
        bad: 'not-an-object',
        empty: { tags: [] },
      },
    });

    expect(await getStoredBookmarkMetadata(['good', 'bad', 'empty'])).toEqual({
      good: { tags: ['ok'], summary: 'fine' },
    });
  });

  it('appends tags with case-insensitive dedupe and keeps the untouched field', async () => {
    await saveBookmarkMetadata('b1', { tags: ['Research'], summary: 'Saved summary' });

    await mergeStoredBookmarkMetadata(
      { b1: { tags: ['research', 'ai'] } },
      { tagMode: 'append', summaryMode: 'replace', dedupeTags: true },
    );

    expect(await getStoredBookmarkMetadata(['b1'])).toEqual({
      b1: { tags: ['Research', 'ai'], summary: 'Saved summary' },
    });
  });

  it('appends tags without dedupe and replaces tags when requested', async () => {
    await saveBookmarkMetadata('b1', { tags: ['a'] });

    await mergeStoredBookmarkMetadata(
      { b1: { tags: ['a', 'b'] } },
      { tagMode: 'append', summaryMode: 'replace', dedupeTags: false },
    );
    expect((await getStoredBookmarkMetadata(['b1'])).b1?.tags).toEqual(['a', 'a', 'b']);

    await mergeStoredBookmarkMetadata(
      { b1: { tags: ['c'] } },
      { tagMode: 'replace', summaryMode: 'replace', dedupeTags: true },
    );
    expect((await getStoredBookmarkMetadata(['b1'])).b1?.tags).toEqual(['c']);
  });

  it('appends or replaces summaries according to the merge mode', async () => {
    await saveBookmarkMetadata('b1', { summary: 'First' });

    await mergeStoredBookmarkMetadata(
      { b1: { summary: 'Second' } },
      { tagMode: 'replace', summaryMode: 'append', dedupeTags: true },
    );
    expect((await getStoredBookmarkMetadata(['b1'])).b1?.summary).toBe('First\n\nSecond');

    await mergeStoredBookmarkMetadata(
      { b1: { summary: 'Third' } },
      { tagMode: 'replace', summaryMode: 'replace', dedupeTags: true },
    );
    expect((await getStoredBookmarkMetadata(['b1'])).b1?.summary).toBe('Third');
  });

  it('reconciles away metadata for bookmarks that no longer exist', async () => {
    await saveBookmarkMetadata('kept', { tags: ['a'] });
    await saveBookmarkMetadata('gone', { tags: ['b'] });

    await reconcileStoredBookmarkMetadata(['kept', 'unrelated']);

    expect(await readRawMetadata()).toEqual({ kept: { tags: ['a'] } });
  });
});

describe('AI-generated metadata with a deterministic provider stub', () => {
  const nodes: BookmarkTreeNode[] = [
    {
      id: 'folder',
      title: 'Research',
      children: [{ id: 'b1', parentId: 'folder', title: 'Docs', url: 'https://docs.example' }],
    },
  ];
  const enabledSettings: AISettings = {
    enabled: true,
    provider: 'custom',
    model: 'stub-model',
    apiKey: 'synthetic-test-key',
    baseUrl: 'https://provider.invalid/v1',
  };

  beforeEach(() => {
    fakeBrowser.reset();
    mocks.generateObject.mockReset();
  });

  it('does not call the provider when AI is disabled', async () => {
    await expect(
      suggestBookmarkTags(
        nodes,
        { ...enabledSettings, enabled: false },
        {
          minTags: 1,
          maxTags: 3,
          tagStyle: 'lowercase',
        },
      ),
    ).rejects.toThrow('AI features are disabled');
    await expect(
      summarizeBookmarksWithAI(
        nodes,
        { ...enabledSettings, enabled: false },
        {
          summaryLength: 100,
          includeDomainHint: false,
        },
      ),
    ).rejects.toThrow('AI features are disabled');
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it('persists reviewed stubbed suggestions using merge settings', async () => {
    await saveBookmarkMetadata('b1', { tags: ['manual'], summary: 'Manual note' });
    mocks.generateObject
      .mockResolvedValueOnce({
        object: {
          items: [
            { bookmarkId: 'b1', title: 'Docs', tags: ['Manual', 'reference'], reason: 'stub' },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: { items: [{ bookmarkId: 'b1', title: 'Docs', summary: 'Stub summary' }] },
      });

    const tags = await suggestBookmarkTags(nodes, enabledSettings, {
      minTags: 1,
      maxTags: 3,
      tagStyle: 'lowercase',
    });
    const summaries = await summarizeBookmarksWithAI(nodes, enabledSettings, {
      summaryLength: 100,
      includeDomainHint: false,
    });

    await mergeStoredBookmarkMetadata(
      Object.fromEntries(tags.map((item) => [item.bookmarkId, { tags: item.tags }])),
      { tagMode: 'append', summaryMode: 'replace', dedupeTags: true },
    );
    await mergeStoredBookmarkMetadata(
      Object.fromEntries(summaries.map((item) => [item.bookmarkId, { summary: item.summary }])),
      { tagMode: 'replace', summaryMode: 'append', dedupeTags: true },
    );

    expect(mocks.generateObject).toHaveBeenCalledTimes(2);
    expect(await getStoredBookmarkMetadata(['b1'])).toEqual({
      b1: { tags: ['manual', 'reference'], summary: 'Manual note\n\nStub summary' },
    });
  });
});
