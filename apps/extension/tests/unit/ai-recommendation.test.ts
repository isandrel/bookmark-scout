import { generateObject } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { SETTING_NUMBER_BOUNDS } from '@/lib/settings-schema';
import {
  createRecommendedFolderBookmark,
  type RecommendedFolderError,
  type FolderRecommendation,
  recommendFolders,
  resolveRecommendedFolderPath,
} from '@/services/ai-recommendation';
import { createBookmark, deleteBookmark, getBookmarkChildren } from '@/services/bookmarks';
import type { BookmarkTreeNode } from '@/types';

vi.mock('@/services/bookmarks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/bookmarks')>()),
  createBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  getBookmarkChildren: vi.fn(),
}));
vi.mock('ai', () => ({ generateObject: vi.fn() }));
vi.mock('@/services/ai-client', () => ({
  createAIModel: vi.fn(() => ({})),
  validateAISettings: vi.fn(),
}));

const bookmark = { title: 'Current page', url: 'https://e2e.invalid/current' };

function folderTree(children: BookmarkTreeNode[]): BookmarkTreeNode[] {
  return [
    {
      id: 'root',
      title: '',
      children: [{ id: 'bar', title: 'Bookmarks Bar', children }],
    },
  ];
}

function recommendation(folderPath: string, parentPath = ''): FolderRecommendation {
  return {
    type: 'new',
    folderPath,
    parentPath,
    confidence: 0.9,
    reason: 'Fixture recommendation',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteBookmark).mockResolvedValue();
  vi.mocked(getBookmarkChildren).mockResolvedValue([]);
});

describe('[mocked provider contract] folder recommendations', () => {
  const settings = { enabled: true, provider: 'openai', model: 'm', apiKey: 'synthetic-key' };
  const folders = folderTree([{ id: 'news', parentId: 'bar', title: 'News', children: [] }]);
  const suggestions = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      type: 'existing' as const,
      folderPath: 'Bookmarks Bar/News',
      parentPath: '',
      confidence: 0.9 - index / 100,
      reason: `Reason ${index}`,
    }));

  it.each([1, 3, 7, 10])('asks for and accepts %i recommendations', async (count) => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { recommendations: suggestions(count) },
    } as never);

    const result = await recommendFolders(bookmark, folders, settings, count);

    const [request] = vi.mocked(generateObject).mock.lastCall ?? [];
    const { schema, system } = request as unknown as { schema: z.ZodType; system: string };
    expect(schema.safeParse({ recommendations: suggestions(count) }).success).toBe(true);
    expect(system).toContain(`Return exactly ${count} folder recommendations`);
    // The rule once listed exactly three slots whatever the count.
    expect(system).not.toContain('third best');
    expect(result).toHaveLength(count);
    expect(result[0].folderId).toBe('news');
  });

  it('accepts more suggestions than the largest setting and keeps the requested count', async () => {
    const extra = SETTING_NUMBER_BOUNDS.aiMaxRecommendations.max + 2;
    vi.mocked(generateObject).mockResolvedValue({
      object: { recommendations: suggestions(extra) },
    } as never);

    const result = await recommendFolders(bookmark, folders, settings, 3);

    const [request] = vi.mocked(generateObject).mock.lastCall ?? [];
    const { schema } = request as unknown as { schema: z.ZodType };
    // A provider that ignores the count once failed the whole request.
    expect(schema.safeParse({ recommendations: suggestions(extra) }).success).toBe(true);
    expect(result.map((item) => item.reason)).toEqual(['Reason 0', 'Reason 1', 'Reason 2']);
  });
});

describe('recommended folder paths', () => {
  // Real titles may contain the path separator.
  const folders = folderTree([
    {
      id: 'dev',
      parentId: 'bar',
      title: 'Dev',
      children: [
        { id: 'cicd', parentId: 'dev', title: 'CI/CD', children: [] },
        { id: 'ci', parentId: 'dev', title: 'CI', children: [] },
      ],
    },
    { id: 'script', parentId: 'bar', title: '<script>alert(1)</script>', children: [] },
  ]);

  it.each([
    ['Bookmarks Bar/Dev/CI/CD/Pipelines', ['Bookmarks Bar', 'Dev', 'CI/CD'], ['Pipelines']],
    ['Dev/CI/CD', ['Bookmarks Bar', 'Dev', 'CI/CD'], []],
    ['Dev/CI/Builds', ['Bookmarks Bar', 'Dev', 'CI'], ['Builds']],
    [
      'Bookmarks Bar/<script>alert(1)</script>/Sub',
      ['Bookmarks Bar', '<script>alert(1)</script>'],
      ['Sub'],
    ],
    ['bookmarks bar / dev / New/Deeper', ['Bookmarks Bar', 'Dev'], ['New', 'Deeper']],
  ])('resolves %s against real folder titles', (path, existingTitles, newTitles) => {
    const resolved = resolveRecommendedFolderPath(recommendation(path), folders);
    expect(resolved.existingTitles).toEqual(existingTitles);
    expect(resolved.newTitles).toEqual(newTitles);
  });

  it('creates only the missing folders inside a folder whose title contains "/"', async () => {
    vi.mocked(createBookmark)
      .mockResolvedValueOnce({ id: 'pipelines', parentId: 'cicd', title: 'Pipelines' })
      .mockResolvedValueOnce({ id: 'saved', parentId: 'pipelines', title: bookmark.title });

    const result = await createRecommendedFolderBookmark(
      recommendation('Bookmarks Bar/Dev/CI/CD/Pipelines'),
      bookmark,
      folders,
    );

    expect(createBookmark).toHaveBeenNthCalledWith(1, { parentId: 'cicd', title: 'Pipelines' });
    expect(result).toMatchObject({
      folderId: 'pipelines',
      folderTitles: ['Bookmarks Bar', 'Dev', 'CI/CD', 'Pipelines'],
      createdFolderIds: ['pipelines'],
    });
  });

  it('rejects a path with no folder names', () => {
    expect(() => resolveRecommendedFolderPath(recommendation(' / '), folders)).toThrow(
      'invalid-path',
    );
  });
});

describe('recommended folder bookmark creation', () => {
  it('creates missing path segments and saves the bookmark', async () => {
    vi.mocked(createBookmark)
      .mockResolvedValueOnce({ id: 'research', parentId: 'parent', title: 'Research' })
      .mockResolvedValueOnce({ id: 'agents', parentId: 'research', title: 'Agents' })
      .mockResolvedValueOnce({
        id: 'saved',
        parentId: 'agents',
        title: bookmark.title,
        url: bookmark.url,
      });

    const result = await createRecommendedFolderBookmark(
      recommendation('E2E Parent/Research/Agents'),
      bookmark,
      folderTree([{ id: 'parent', title: 'E2E Parent', children: [] }]),
    );

    expect(result).toEqual({
      status: 'created',
      folderId: 'agents',
      folderTitles: ['Bookmarks Bar', 'E2E Parent', 'Research', 'Agents'],
      bookmarkId: 'saved',
      createdFolderIds: ['research', 'agents'],
    });
    expect(createBookmark).toHaveBeenNthCalledWith(1, {
      parentId: 'parent',
      title: 'Research',
    });
    expect(createBookmark).toHaveBeenNthCalledWith(2, {
      parentId: 'research',
      title: 'Agents',
    });
    expect(createBookmark).toHaveBeenNthCalledWith(3, {
      parentId: 'agents',
      title: bookmark.title,
      url: bookmark.url,
    });
  });

  it('reuses an existing path and does not add a duplicate URL', async () => {
    vi.mocked(getBookmarkChildren).mockResolvedValue([
      { id: 'saved', parentId: 'agents', title: 'Already saved', url: bookmark.url },
    ]);

    const result = await createRecommendedFolderBookmark(
      recommendation('E2E Parent/Agents'),
      bookmark,
      folderTree([
        {
          id: 'parent',
          title: 'E2E Parent',
          children: [{ id: 'agents', parentId: 'parent', title: 'Agents', children: [] }],
        },
      ]),
    );

    expect(result.status).toBe('duplicate');
    expect(result.bookmarkId).toBe('saved');
    expect(createBookmark).not.toHaveBeenCalled();
  });

  it('rejects a bookmark that conflicts with a folder path segment', async () => {
    const promise = createRecommendedFolderBookmark(
      recommendation('E2E Parent/Blocked/Child'),
      bookmark,
      folderTree([
        {
          id: 'parent',
          title: 'E2E Parent',
          children: [
            {
              id: 'conflict',
              parentId: 'parent',
              title: 'Blocked',
              url: 'https://e2e.invalid/conflict',
            },
          ],
        },
      ]),
    );

    await expect(promise).rejects.toMatchObject<Partial<RecommendedFolderError>>({
      code: 'path-conflict',
      segment: 'Blocked',
    });
    expect(createBookmark).not.toHaveBeenCalled();
  });

  it('rolls back folders created before a bookmark creation failure', async () => {
    vi.mocked(createBookmark)
      .mockResolvedValueOnce({ id: 'research', parentId: 'parent', title: 'Research' })
      .mockRejectedValueOnce(new Error('Synthetic bookmark failure'));

    await expect(
      createRecommendedFolderBookmark(
        recommendation('E2E Parent/Research'),
        bookmark,
        folderTree([{ id: 'parent', title: 'E2E Parent', children: [] }]),
      ),
    ).rejects.toThrow('Synthetic bookmark failure');
    expect(deleteBookmark).toHaveBeenCalledWith('research');
  });
});
