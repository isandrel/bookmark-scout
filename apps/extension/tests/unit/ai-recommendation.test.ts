import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRecommendedFolderBookmark,
  type RecommendedFolderError,
  type FolderRecommendation,
} from '@/services/ai-recommendation';
import { createBookmark, deleteBookmark, getBookmarkChildren } from '@/services/bookmarks';
import type { BookmarkTreeNode } from '@/types';

vi.mock('@/services/bookmarks', () => ({
  createBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  getBookmarkChildren: vi.fn(),
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
      folderPath: 'Bookmarks Bar/E2E Parent/Research/Agents',
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
