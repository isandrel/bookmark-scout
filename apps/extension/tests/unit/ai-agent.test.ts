import { describe, expect, it } from 'vitest';
import { searchBookmarksForAI, supportsWebSearch } from '@/services/ai-agent';
import { formatToday, getPromptPreviewVariables, PROMPT_TASKS } from '@/services/prompt-config';
import type { BookmarkTreeNode } from '@/types';

const node = (id: string, title: string, url?: string, children?: BookmarkTreeNode[]) =>
  ({ id, title, url, children, parentId: '0' }) as BookmarkTreeNode;

const tree: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      node('1', 'Design', undefined, [
        node('11', 'Design systems handbook', 'https://example.com/handbook'),
        node('12', 'Color tools', 'https://colors.example.com/'),
      ]),
      node('2', 'Rust', undefined, [node('21', 'Ownership guide', 'https://rust.example/ownership')]),
    ],
  } as BookmarkTreeNode,
];

describe('searchBookmarksForAI', () => {
  it('ranks title matches above URL, folder, and saved-metadata matches', () => {
    const hits = searchBookmarksForAI(tree, { '12': { tags: ['design'] } }, 'design');
    expect(hits.map((hit) => hit.title)).toEqual(['Design systems handbook', 'Color tools']);
    expect(hits[0]).toMatchObject({ folder: 'Design', url: 'https://example.com/handbook' });
    expect(hits[1].tags).toEqual(['design']);
  });

  it('matches several words, ignores case, and respects the limit', () => {
    expect(searchBookmarksForAI(tree, {}, 'RUST ownership')[0]?.title).toBe('Ownership guide');
    expect(searchBookmarksForAI(tree, {}, 'example', 1)).toHaveLength(1);
    expect(searchBookmarksForAI(tree, {}, '   ')).toEqual([]);
    expect(searchBookmarksForAI(tree, {}, 'nothing-matches')).toEqual([]);
  });
});

describe('Ask AI setup', () => {
  it('offers web search only for providers with a built-in search tool', () => {
    expect(['openai', 'anthropic', 'google', 'xai'].every(supportsWebSearch)).toBe(true);
    expect(supportsWebSearch('custom')).toBe(false);
    expect(supportsWebSearch('ollama')).toBe(false);
  });

  it('has an editable prompt that knows today', () => {
    expect(PROMPT_TASKS.ask_ai.system).toContain('{{today}}');
    expect(formatToday(new Date('2026-10-02T12:00:00Z'))).toBe('2026-10-02');
    expect(getPromptPreviewVariables('ask_ai', {} as Settings).today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
