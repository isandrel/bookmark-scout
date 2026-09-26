import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkTreeNode } from '@/types';
import type { AISettings } from '@/services/ai-client';

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
}));

vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('@/services/ai-client', () => ({
  createAIModel: vi.fn(() => ({})),
  validateAISettings: vi.fn(),
}));

const { suggestBookmarkTags, summarizeBookmarksWithAI } = await import(
  '@/services/ai-bookmark-tools'
);
const { recommendFolders } = await import('@/services/ai-recommendation');

const settings: AISettings = {
  enabled: true,
  provider: 'openai',
  model: 'test-model',
  apiKey: 'synthetic-test-key',
};

const nodes: BookmarkTreeNode[] = [
  {
    id: 'folder',
    title: 'Research',
    children: [{ id: 'b1', title: 'Paper', url: 'https://paper.example/one' }],
  },
];

describe('AI tool prompt settings (mocked provider contract)', () => {
  beforeEach(() => {
    mocks.generateObject.mockReset();
    mocks.generateObject.mockResolvedValue({ object: { items: [] } });
  });

  it('puts the saved tag count and tag style into the auto-tagging prompt', async () => {
    await suggestBookmarkTags(nodes, settings, { minTags: 1, maxTags: 3, tagStyle: 'snake_case' });
    await suggestBookmarkTags(nodes, settings, { minTags: 4, maxTags: 8, tagStyle: 'kebab-case' });

    const [first, second] = mocks.generateObject.mock.calls.map(([request]) => request.system);
    expect(first).toContain('Suggest 1-3 tags per bookmark');
    expect(first).toContain('Write every tag in snake_case style');
    expect(second).toContain('Suggest 4-8 tags per bookmark');
    expect(second).toContain('Write every tag in kebab-case style');
    expect(first).not.toContain('{{');
  });

  it('puts the saved summary length into the summarizer prompt', async () => {
    await summarizeBookmarksWithAI(nodes, settings, { summaryLength: 60, includeDomainHint: false });
    await summarizeBookmarksWithAI(nodes, settings, { summaryLength: 400, includeDomainHint: false });

    const [first, second] = mocks.generateObject.mock.calls.map(([request]) => request.system);
    expect(first).toContain('Keep summary under 60 characters');
    expect(second).toContain('Keep summary under 400 characters');
    expect(first).not.toContain('{{');
  });

  it('asks for and returns at most the saved number of folder recommendations', async () => {
    const recommendation = (folderPath: string) => ({
      type: 'existing',
      folderPath,
      confidence: 0.9,
      reason: 'Fixture',
    });
    mocks.generateObject.mockResolvedValue({
      object: {
        recommendations: [recommendation('Research'), recommendation('Other'), recommendation('Third')],
      },
    });

    const result = await recommendFolders(
      { title: 'Paper', url: 'https://paper.example/one' },
      nodes,
      settings,
      2,
    );

    expect(mocks.generateObject.mock.calls[0][0].system).toContain(
      'Return exactly 2 folder recommendations',
    );
    expect(result.map((item) => item.folderPath)).toEqual(['Research', 'Other']);
  });
});
