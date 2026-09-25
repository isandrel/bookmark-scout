import { describe, expect, it } from 'vitest';
import {
  buildExportRoot,
  countExportedBookmarks,
  csvFormat,
  escapeCsvCell,
  escapeMarkdownLineStart,
  generateFilename,
  htmlFormat,
  jsonFormat,
  markdownFormat,
} from '@/services/bookmark-export';
import { htmlImportFormat, jsonImportFormat } from '@/services/bookmark-import';
import type { BookmarkTreeNode } from '@/types';

const browserTree: BookmarkTreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Bookmarks Bar',
        children: [
          {
            id: '10',
            parentId: '1',
            title: 'Tracking',
            children: [
              {
                id: '11',
                parentId: '10',
                title: 'Evil =HYPERLINK("x")',
                url: 'https://e2e.invalid/a',
                dateAdded: 1_700_000_000_000,
              },
            ],
          },
          { id: '12', parentId: '1', title: '[Docs] <script>', url: 'https://e2e.invalid/b (1)' },
        ],
      },
    ],
  },
];

const root = buildExportRoot(browserTree);

describe('bookmark export', () => {
  it('unwraps the unnamed browser root and keeps selected folders as a single entry', () => {
    expect(root.children?.map((node) => node.title)).toEqual(['Bookmarks Bar']);
    expect(countExportedBookmarks(root)).toBe(2);
    const tracking = buildExportRoot([
      browserTree[0].children?.[0].children?.[0] as BookmarkTreeNode,
    ]);
    expect(tracking.children?.map((node) => node.title)).toEqual(['Tracking']);
    expect(countExportedBookmarks(tracking)).toBe(1);
  });

  it('writes no nameless wrapper folder in any format', () => {
    const html = htmlFormat.serialize(root);
    expect(html).not.toContain('<H3></H3>');
    expect(html).not.toMatch(/<H3[^>]*><\/H3>/);
    expect(markdownFormat.serialize(root)).not.toContain('****');
    expect(jsonFormat.serialize(root)).not.toContain('"title": ""');
    expect(csvFormat.serialize(root)).not.toMatch(/,\/|\/\/Bookmarks/);
    expect(csvFormat.serialize(root)).toContain('Bookmarks Bar/Tracking');
  });

  it('round-trips HTML and JSON without adding an extra level', () => {
    for (const [format, parser] of [
      [htmlFormat, htmlImportFormat],
      [jsonFormat, jsonImportFormat],
    ] as const) {
      if (format === htmlFormat && typeof DOMParser === 'undefined') continue;
      const { bookmarks } = parser.parse(format.serialize(root));
      expect(bookmarks.map((node) => node.title)).toEqual(['Bookmarks Bar']);
      expect(bookmarks[0].children?.map((node) => node.title)).toEqual([
        'Tracking',
        '[Docs] <script>',
      ]);
    }
  });

  it('honors date, URL, and indentation preferences', () => {
    const json = jsonFormat.serialize(root, { includeDates: false, jsonIndentSize: 4 });
    expect(json).not.toContain('dateAdded');
    expect(json).toContain('\n    "title"');
    expect(htmlFormat.serialize(root, { includeDates: true })).toContain('ADD_DATE="1700000000"');
    expect(htmlFormat.serialize(root, { includeDates: false })).not.toContain('ADD_DATE');
    expect(htmlFormat.serialize(root, { htmlIndentSpaces: 3 })).toContain('\n   <DT><H3');
    const markdown = markdownFormat.serialize(root, {
      includeUrls: false,
      markdownIndentSpaces: 4,
    });
    expect(markdown).not.toContain('https://');
    expect(markdown).toContain('\n    - **Tracking**');
    const csv = csvFormat.serialize(root, { includeUrls: false, includeDates: false });
    expect(csv.split('\n')[0]).toBe('export_csvTitle,export_csvFolder');
    expect(csv).not.toContain('https://');
  });

  it('neutralizes spreadsheet formulas in CSV cells', () => {
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    for (const prefix of ['+', '-', '@', '\t', '\r']) {
      expect(escapeCsvCell(`${prefix}1`).replace(/^"/, '').startsWith(`'${prefix}`)).toBe(true);
    }
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(csvFormat.serialize(root)).toContain(`"Evil =HYPERLINK(""x"")"`);
  });

  it('escapes Markdown brackets and raw HTML in titles and link destinations', () => {
    const markdown = markdownFormat.serialize(root);
    expect(markdown).toContain('- [\\[Docs\\] &lt;script&gt;](https://e2e.invalid/b%20%281%29)');
    expect(markdown).not.toContain('<script>');
  });

  it('escapes line-start Markdown syntax in titles when URLs are off', () => {
    const titles = [
      '1. Intro',
      '2) Next',
      '# Heading',
      '- dash',
      '---',
      '> quote',
      '+ plus',
      '===',
      '~~~',
      'Plain',
    ];
    const markdown = markdownFormat.serialize(
      {
        id: 'r',
        title: 'Root',
        children: titles.map((title, index) => ({
          id: String(index),
          title,
          url: 'https://e2e.invalid/',
        })),
      },
      { includeUrls: false },
    );
    expect(markdown.split('\n').slice(2, -1)).toEqual([
      '- 1\\. Intro',
      '- 2\\) Next',
      '- \\# Heading',
      '- \\- dash',
      '- \\---',
      '- &gt; quote',
      '- \\+ plus',
      '- \\===',
      '- \\~~~',
      '- Plain',
    ]);
    expect(escapeMarkdownLineStart('Version 1. notes #1 - ok')).toBe('Version 1. notes #1 - ok');
  });

  it('names files with the saved prefix and the local date', () => {
    const now = new Date(2026, 0, 2, 23, 30);
    expect(
      generateFilename('My Folder', jsonFormat, { prefix: 'backup-', maxLength: 20, now }),
    ).toBe('backup-My_Folder_2026-01-02.json');
  });
});
