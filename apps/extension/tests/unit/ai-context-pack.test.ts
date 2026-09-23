import { describe, expect, it } from 'vitest';
import { buildAIContextPack, type AIContextPackOptions } from '@/services/ai-bookmark-tools';
import type { BookmarkTreeNode } from '@/types';

const nodes: BookmarkTreeNode[] = [
  {
    id: 'folder',
    title: 'Research',
    children: [
      {
        id: 'stored',
        parentId: 'folder',
        title: 'Stored bookmark title',
        url: 'https://example.test/path?a=1&b=2',
      },
      {
        id: 'missing',
        parentId: 'folder',
        title: 'Missing metadata title',
        url: 'https://example.test/missing',
      },
    ],
  },
];

const options: AIContextPackOptions = {
  format: 'markdown',
  includeFolderPath: false,
  includeDates: false,
  includeTags: true,
  includeSummaries: true,
  maxItems: 10,
  maxDepth: 10,
  excerptLength: 200,
};

describe('AI context packs', () => {
  it('includes only non-empty stored metadata in Markdown exports', () => {
    const packed = buildAIContextPack(nodes, options, {
      stored: {
        tags: ['research', 'quoted "tag"'],
        summary: 'A stored summary, not the bookmark title.',
      },
      missing: { tags: [], summary: '' },
    });

    expect(packed.content).toBe(
      [
        '# Bookmark Context',
        '',
        '## 1. Stored bookmark title',
        '- URL: https://example.test/path?a=1&b=2',
        '- Tags: ["research","quoted \\"tag\\""]',
        '- Summary: A stored summary, not the bookmark title.',
        '',
        '## 2. Missing metadata title',
        '- URL: https://example.test/missing',
        '',
      ].join('\n'),
    );
    expect(packed.content).not.toContain('Tags: []');
    expect(packed.content).not.toContain('Summary: Missing metadata title');
  });

  it('escapes stored metadata in XML and omits missing fields', () => {
    const packed = buildAIContextPack(
      nodes,
      { ...options, format: 'xml' },
      {
        stored: {
          tags: ['research & development', '<private>'],
          summary: 'Compare <A> & "B" before it\'s shared.',
        },
      },
    );

    expect(packed.content).toBe(
      '<bookmarks count="2">' +
        '<bookmark id="stored">' +
        '<title>Stored bookmark title</title>' +
        '<url>https://example.test/path?a=1&amp;b=2</url>' +
        '<tags><tag>research &amp; development</tag><tag>&lt;private&gt;</tag></tags>' +
        '<summary>Compare &lt;A&gt; &amp; &quot;B&quot; before it&apos;s shared.</summary>' +
        '</bookmark>' +
        '<bookmark id="missing">' +
        '<title>Missing metadata title</title>' +
        '<url>https://example.test/missing</url>' +
        '</bookmark>' +
        '</bookmarks>',
    );
    expect(packed.content).not.toContain('<tags></tags>');
    expect(packed.content).not.toContain('<summary>Missing metadata title</summary>');
  });

  it('omits stored metadata when its export options are disabled', () => {
    const packed = buildAIContextPack(
      nodes,
      { ...options, includeTags: false, includeSummaries: false },
      { stored: { tags: ['private'], summary: 'Private summary' } },
    );

    expect(packed.content).not.toContain('Tags:');
    expect(packed.content).not.toContain('Summary:');
    expect(packed.content).not.toContain('private');
  });
});
