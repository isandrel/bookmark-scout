import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { AISettings } from '@/services/ai-client';
import type { BookmarkTreeNode } from '@/types';

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
}));

vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('@/services/ai-client', () => ({
  createAIModel: vi.fn(() => ({})),
  validateAISettings: vi.fn(),
}));

const { generateReorganizationPlan } = await import('@/services/ai-reorganization');
const { saveSettings } = await import('@/lib/settings-storage');

const aiSettings: AISettings = {
  enabled: true,
  provider: 'openai',
  model: 'test-model',
  apiKey: 'synthetic-test-key',
};

const bookmarkTree: BookmarkTreeNode[] = [
  {
    id: '1',
    title: 'Bookmarks Bar',
    children: [{ id: 'b1', title: 'One', url: 'https://one.example' }],
  },
];

describe('AI reorganization folder limit settings', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    mocks.generateObject.mockReset();
    mocks.generateObject.mockResolvedValue({ object: { operations: [], summary: 'None' } });
  });

  it('sends the saved category and folder-size limits to the provider', async () => {
    await saveSettings({ aiMaxCategories: 4, aiMinItemsPerFolder: 2, aiMaxItemsPerFolder: 9 });
    await generateReorganizationPlan(bookmarkTree, aiSettings);

    const request = mocks.generateObject.mock.calls[0][0];
    expect(JSON.parse(request.prompt).config).toEqual({
      maxCategories: 4,
      minItemsPerFolder: 2,
      maxItemsPerFolder: 9,
    });
    expect(request.system).toContain('Aim for 2-9 bookmarks per folder');
    expect(request.system).toContain('Create at most 4 top-level categories');

    await saveSettings({ aiMaxCategories: 7 });
    await generateReorganizationPlan(bookmarkTree, aiSettings);
    expect(JSON.parse(mocks.generateObject.mock.calls[1][0].prompt).config.maxCategories).toBe(7);
  });

  it('leaves unlimited limits out of the prompt and the request instead of sending -1', async () => {
    await saveSettings({ aiMaxCategories: -1, aiMinItemsPerFolder: 3, aiMaxItemsPerFolder: -1 });
    await generateReorganizationPlan(bookmarkTree, aiSettings);

    const request = mocks.generateObject.mock.calls[0][0];
    expect(JSON.parse(request.prompt).config).toEqual({ minItemsPerFolder: 3 });
    // "-1" on its own, not the "(0-1)" confidence range.
    expect(request.system).not.toMatch(/(^|[^0-9])-1\b/);
    expect(request.system).not.toContain('top-level categories');
    expect(request.system).toContain('Aim for at least 3 bookmarks per folder.');

    // The default minimum of one goes without saying.
    await saveSettings({ aiMinItemsPerFolder: 1 });
    await generateReorganizationPlan(bookmarkTree, aiSettings);
    expect(mocks.generateObject.mock.calls[1][0].system).not.toContain('bookmarks per folder');
  });
});
