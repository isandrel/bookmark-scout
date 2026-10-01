import { describe, expect, it } from 'vitest';
import { buildAIContextPack, type AIContextPackOptions } from '@/services/ai-bookmark-tools';
import {
  buildExportRoot,
  csvFormat,
  exportIncludesUrls,
  htmlFormat,
  jsonFormat,
  markdownFormat,
} from '@/services/bookmark-export';
import {
  type ExportPrivacyOptions,
  redactBookmarkNodes,
  reviewExportPrivacy,
} from '@/services/export-privacy';
import type { BookmarkTreeNode } from '@/types';

// Synthetic, obviously fake token shapes.
const FAKE_GITHUB = `ghp_${'a'.repeat(36)}`;
const FAKE_OPENAI = `sk-${'aB3'.repeat(14)}`;

const options: ExportPrivacyOptions = {
  sensitiveParams: ['token', 'api_key', 'password', 'code'],
  emailDetection: true,
  includeUrls: true,
};

function bookmark(url: string, title = 'Link', id = '1'): BookmarkTreeNode {
  return { id, parentId: 'folder', title, url };
}

function review(url: string, title?: string, overrides: Partial<ExportPrivacyOptions> = {}) {
  const node = bookmark(url, title);
  const opts = { ...options, ...overrides };
  const [item] = reviewExportPrivacy([node], opts);
  const [redacted] = redactBookmarkNodes([node], opts);
  return { fields: item?.fields ?? [], url: redacted.url, title: redacted.title };
}

describe('export privacy review: query parameters', () => {
  it('redacts a sensitive parameter value and keeps the rest of the URL byte for byte', () => {
    expect(review('https://app.test/cb?q=a+b%20c&token=abc123&page=2')).toEqual({
      fields: [{ kind: 'queryParam', location: 'url', name: 'token' }],
      url: 'https://app.test/cb?q=a+b%20c&token=REDACTED&page=2',
      title: 'Link',
    });
  });

  it('matches parameter names case-insensitively and reports each one', () => {
    const result = review('https://app.test/?API_KEY=k1&Password=p2');
    expect(result.fields.map((field) => field.name)).toEqual(['API_KEY', 'Password']);
    expect(result.url).toBe('https://app.test/?API_KEY=REDACTED&Password=REDACTED');
  });

  it('redacts token-like values under harmless parameter names', () => {
    expect(review(`https://app.test/?state=${FAKE_GITHUB}`)).toMatchObject({
      fields: [{ kind: 'token', location: 'url', name: 'state' }],
      url: 'https://app.test/?state=REDACTED',
    });
  });

  it('does not flag ordinary or empty parameter values', () => {
    expect(review('https://app.test/search?q=kittens&page=2&token=').fields).toEqual([]);
    expect(review('https://news.test/sk-telecom-annual-report-2024?ref=home').fields).toEqual([]);
  });
});

describe('export privacy review: fragments', () => {
  it('redacts OAuth tokens in fragment parameters even when not in the sensitive list', () => {
    expect(review('https://app.test/#access_token=abc&expires=3600')).toMatchObject({
      fields: [{ kind: 'fragmentParam', location: 'url', name: 'access_token' }],
      url: 'https://app.test/#access_token=REDACTED&expires=3600',
    });
  });

  it('keeps an SPA route prefix and redacts its parameters', () => {
    expect(review('https://app.test/#/callback?id_token=xyz&next=%2Fhome').url).toBe(
      'https://app.test/#/callback?id_token=REDACTED&next=%2Fhome',
    );
  });

  it('leaves plain anchors and routes alone but redacts a token-bearing fragment', () => {
    expect(review('https://docs.test/guide#section-2').fields).toEqual([]);
    expect(review('https://app.test/#/settings/profile').fields).toEqual([]);
    expect(review(`https://app.test/#${FAKE_OPENAI}`)).toMatchObject({
      fields: [{ kind: 'fragment', location: 'url' }],
      url: 'https://app.test/#REDACTED',
    });
  });
});

describe('export privacy review: email-like values and credentials', () => {
  it('redacts email-like values in parameters, paths, and mailto URLs', () => {
    expect(review('https://app.test/invite?user=alice%40example.com')).toMatchObject({
      fields: [{ kind: 'email', location: 'url', name: 'user' }],
      url: 'https://app.test/invite?user=REDACTED',
    });
    expect(review('https://app.test/users/alice@example.com/profile')).toMatchObject({
      fields: [{ kind: 'email', location: 'url' }],
      url: 'https://app.test/users/REDACTED/profile',
    });
    expect(review('mailto:alice@example.com?subject=hi').url).toBe('mailto:REDACTED?subject=hi');
  });

  it('ignores asset names that look like emails and respects the email detection setting', () => {
    expect(review('https://cdn.test/img/logo@2x.png').fields).toEqual([]);
    expect(
      review('https://app.test/users/alice@example.com', 'Link', { emailDetection: false }).fields,
    ).toEqual([]);
  });

  it('removes URL credentials without also reporting them as an email', () => {
    expect(review('https://alice:hunter2@example.com/app')).toEqual({
      fields: [{ kind: 'credentials', location: 'url' }],
      url: 'https://example.com/app',
      title: 'Link',
    });
  });

  it('redacts email-like and token-like values in titles', () => {
    expect(review('https://app.test/', `Inbox of bob@example.org ${FAKE_GITHUB}`)).toEqual({
      fields: [
        { kind: 'token', location: 'title' },
        { kind: 'email', location: 'title' },
      ],
      url: 'https://app.test/',
      title: 'Inbox of REDACTED REDACTED',
    });
  });

  it('reviews only titles when the export leaves URLs out', () => {
    const result = review('https://app.test/?token=abc', 'carol@example.net', {
      includeUrls: false,
    });
    expect(result.fields).toEqual([{ kind: 'email', location: 'title' }]);
    expect(result.url).toBe('https://app.test/?token=abc');
    expect(exportIncludesUrls(markdownFormat, false)).toBe(false);
    expect(exportIncludesUrls(csvFormat, false)).toBe(false);
    expect(exportIncludesUrls(htmlFormat, false)).toBe(true);
    expect(exportIncludesUrls(jsonFormat, false)).toBe(true);
  });
});

describe('redactBookmarkNodes', () => {
  const tree: BookmarkTreeNode[] = [
    {
      id: 'folder',
      parentId: '1',
      title: 'Work & Play',
      children: [
        bookmark('https://app.test/cb?token=s3cr3t&a=1', 'Callback <1>', 'secret'),
        {
          id: 'nested',
          parentId: 'folder',
          title: 'Nested',
          children: [bookmark('https://ok.test/', 'Safe', 'safe')],
        },
      ],
    },
  ];

  it('never modifies the input tree', () => {
    const before = structuredClone(tree);
    const redacted = redactBookmarkNodes(tree, options);
    expect(tree).toEqual(before);
    expect(redacted[0].children?.[0].url).toBe('https://app.test/cb?token=REDACTED&a=1');
    expect(redacted[0].children?.[1]).toEqual(tree[0].children?.[1]);
    expect(reviewExportPrivacy(tree, options).map((item) => item.id)).toEqual(['secret']);
  });

  describe.each([
    ['HTML', htmlFormat, 'HREF="https://app.test/cb?token=REDACTED&amp;a=1"'],
    ['JSON', jsonFormat, '"url": "https://app.test/cb?token=REDACTED&a=1"'],
    ['Markdown', markdownFormat, '(https://app.test/cb?token=REDACTED&a=1)'],
    ['CSV', csvFormat, 'https://app.test/cb?token=REDACTED&a=1,Work & Play'],
  ])('%s export', (_name, format, redactedFragment) => {
    const root = buildExportRoot(tree);
    const serialize = (nodes: BookmarkTreeNode[]) =>
      format.serialize({ ...root, children: nodes }, { includeUrls: true, includeDates: false });

    it('writes the original or the redacted value with the format escaping intact', () => {
      const original = serialize(root.children ?? []);
      const redacted = serialize(redactBookmarkNodes(root.children ?? [], options));
      expect(original).toContain('token=s3cr3t');
      expect(redacted).not.toContain('s3cr3t');
      expect(redacted).toContain(redactedFragment);
      expect(redacted).toContain('https://ok.test/');
    });
  });
});

describe('AI context exports with privacy review', () => {
  const nodes: BookmarkTreeNode[] = [
    {
      id: 'folder',
      title: 'Research',
      children: [
        bookmark('https://app.test/doc?api_key=k-123&lang=en', 'Doc <a&b>', 'stored'),
        bookmark('https://app.test/plain', 'Plain', 'plain'),
      ],
    },
  ];
  const metadata = { stored: { tags: ['ops', '<x>'], summary: 'Keys & tokens' } };
  const base: AIContextPackOptions = {
    format: 'markdown',
    includeFolderPath: false,
    includeDates: false,
    includeTags: true,
    includeSummaries: true,
    maxItems: 10,
    maxDepth: 10,
    excerptLength: 200,
  };

  it.each([
    ['with stored metadata', metadata],
    ['without stored metadata', {}],
  ])('Markdown %s redacts only the URL value', (_label, stored) => {
    const original = buildAIContextPack(nodes, base, stored).content;
    const redacted = buildAIContextPack(redactBookmarkNodes(nodes, options), base, stored).content;
    expect(original).toContain('- URL: https://app.test/doc?api_key=k-123&lang=en');
    expect(redacted).toContain('- URL: https://app.test/doc?api_key=REDACTED&lang=en');
    expect(redacted).not.toContain('k-123');
    expect(redacted).toContain('## 1. Doc <a&b>');
    if (stored === metadata) {
      expect(redacted).toContain('- Tags: ["ops","<x>"]');
      expect(redacted).toContain('- Summary: Keys & tokens');
    } else {
      expect(redacted).not.toContain('- Tags:');
      expect(redacted).not.toContain('- Summary:');
    }
  });

  it.each([
    ['with stored metadata', metadata],
    ['without stored metadata', {}],
  ])('XML %s escapes the redacted URL and metadata', (_label, stored) => {
    const xml = { ...base, format: 'xml' as const };
    const original = buildAIContextPack(nodes, xml, stored).content;
    const redacted = buildAIContextPack(redactBookmarkNodes(nodes, options), xml, stored).content;
    expect(original).toContain('<url>https://app.test/doc?api_key=k-123&amp;lang=en</url>');
    expect(redacted).toContain('<url>https://app.test/doc?api_key=REDACTED&amp;lang=en</url>');
    expect(redacted).not.toContain('k-123');
    expect(redacted).toContain('<title>Doc &lt;a&amp;b&gt;</title>');
    if (stored === metadata) {
      expect(redacted).toContain('<tags><tag>ops</tag><tag>&lt;x&gt;</tag></tags>');
      expect(redacted).toContain('<summary>Keys &amp; tokens</summary>');
    } else {
      expect(redacted).not.toContain('<tags>');
      expect(redacted).not.toContain('<summary>');
    }
  });
});
