import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '@/services/ai-client';
import { suggestBookmarkTags, summarizeBookmarksWithAI } from '@/services/ai-bookmark-tools';
import type { BookmarkTreeNode } from '@/types';

const mocks = vi.hoisted(() => ({
  generateAIObject: vi.fn(),
  validateAISettings: vi.fn(),
}));

vi.mock('@/services/ai-client', () => ({
  generateAIObject: mocks.generateAIObject,
  validateAISettings: mocks.validateAISettings,
}));

const settings: AISettings = {
  enabled: true,
  provider: 'custom',
  model: 'synthetic-model',
  apiKey: '',
  baseUrl: 'https://provider.invalid/v1',
};

const nodes: BookmarkTreeNode[] = [
  {
    id: 'folder',
    title: 'Research',
    children: [
      {
        id: 'first',
        title: 'First local title',
        url: 'https://first.example/articles/one',
      },
      {
        id: 'second',
        title: 'Second local title',
        url: 'https://second.example/articles/two',
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateAISettings.mockImplementation((candidate: AISettings) => {
    if (!candidate.enabled) throw new Error('AI features are disabled');
  });
});

// These tests stub the AI client's model call: they verify our request/response contract, not live provider compatibility.
describe('provider-backed bookmark workflows (mocked provider contract)', () => {
  it('blocks auto-tagging and summarization before creating a provider when AI is disabled', async () => {
    const disabled = { ...settings, enabled: false };

    await expect(
      suggestBookmarkTags(nodes, disabled, {
        minTags: 1,
        maxTags: 3,
        tagStyle: 'kebab-case',
      }),
    ).rejects.toThrow('AI features are disabled');
    await expect(
      summarizeBookmarksWithAI(nodes, disabled, {
        summaryLength: 120,
        includeDomainHint: true,
      }),
    ).rejects.toThrow('AI features are disabled');

    expect(mocks.generateAIObject).not.toHaveBeenCalled();
  });

  it('sends a deterministic auto-tagging contract and trusts only requested bookmark identities', async () => {
    mocks.generateAIObject.mockResolvedValue({
      object: {
        items: [
          {
            bookmarkId: 'first',
            title: 'Provider changed this title',
            tags: ['machine-learning', 'research'],
            reason: 'Synthetic provider result',
          },
          {
            bookmarkId: 'unknown',
            title: 'Hallucinated bookmark',
            tags: ['ignore'],
            reason: 'Not in the request',
          },
          {
            bookmarkId: 'first',
            title: 'Duplicate provider item',
            tags: ['duplicate'],
            reason: 'Duplicate result',
          },
        ],
      },
    });

    const result = await suggestBookmarkTags(nodes, settings, {
      minTags: 1,
      maxTags: 3,
      tagStyle: 'kebab-case',
    });

    expect(mocks.generateAIObject).toHaveBeenCalledOnce();
    const request = mocks.generateAIObject.mock.calls[0][0];
    expect(request).toMatchObject({ settings, source: 'autoTagging' });
    expect(request.system).toContain('preserve bookmarkId/title exactly');
    expect(JSON.parse(request.prompt)).toEqual({
      bookmarks: [
        {
          bookmarkId: 'first',
          title: 'First local title',
          url: 'https://first.example/articles/one',
          folderPath: 'Research',
        },
        {
          bookmarkId: 'second',
          title: 'Second local title',
          url: 'https://second.example/articles/two',
          folderPath: 'Research',
        },
      ],
    });
    expect(result).toEqual([
      {
        bookmarkId: 'first',
        title: 'First local title',
        url: 'https://first.example/articles/one',
        tags: ['machine-learning', 'research'],
        reason: 'Synthetic provider result',
      },
    ]);
  });

  it('includes optional domain context and filters unknown or duplicate summarizer results', async () => {
    mocks.generateAIObject.mockResolvedValue({
      object: {
        items: [
          {
            bookmarkId: 'second',
            title: 'Provider changed this title',
            summary: 'A synthetic summary.',
          },
          {
            bookmarkId: 'unknown',
            title: 'Hallucinated bookmark',
            summary: 'Ignore this result.',
          },
          {
            bookmarkId: 'second',
            title: 'Duplicate provider item',
            summary: 'Duplicate summary.',
          },
        ],
      },
    });

    const result = await summarizeBookmarksWithAI(nodes, settings, {
      summaryLength: 120,
      includeDomainHint: true,
    });

    const request = mocks.generateAIObject.mock.calls[0][0];
    expect(JSON.parse(request.prompt).bookmarks).toEqual([
      expect.objectContaining({ bookmarkId: 'first', domain: 'first.example' }),
      expect.objectContaining({ bookmarkId: 'second', domain: 'second.example' }),
    ]);
    expect(result).toEqual([
      {
        bookmarkId: 'second',
        title: 'Second local title',
        url: 'https://second.example/articles/two',
        summary: 'A synthetic summary.',
      },
    ]);
  });

  it('propagates a provider failure without returning a partial preview', async () => {
    mocks.generateAIObject.mockRejectedValue(new Error('Synthetic provider unavailable'));

    await expect(
      summarizeBookmarksWithAI(nodes, settings, {
        summaryLength: 120,
        includeDomainHint: false,
      }),
    ).rejects.toThrow('Synthetic provider unavailable');
  });

  it('does not create or call a provider for an empty bookmark scope', async () => {
    await expect(
      suggestBookmarkTags([], settings, {
        minTags: 1,
        maxTags: 3,
        tagStyle: 'lowercase',
      }),
    ).resolves.toEqual([]);
    await expect(
      summarizeBookmarksWithAI([], settings, {
        summaryLength: 120,
        includeDomainHint: false,
      }),
    ).resolves.toEqual([]);

    expect(mocks.generateAIObject).not.toHaveBeenCalled();
  });
});
