/**
 * Index Page Text, the quality gaps of the acceptance list: one download per address (S19),
 * blocks a phrase never crosses (S34), what is never kept (S11), files that are not web pages,
 * byte caps and charsets (S14-S16), addresses that may hold a secret, bookmarks restored or edited
 * during a run (S23, S24), a corrupt record (S29), CJK text (S32), page text that looks like HTML
 * (S35), access taken back (S46), the search notice while the index is off (S47), and AI page
 * reading kept apart from the index (S49).
 */
import { openDB } from 'idb';
import { DOMParser as LinkedomParser } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import {
  clearPageTexts,
  getPageTexts,
  isPageTextCurrent,
  PAGE_TEXT_LIMITS,
  removePageTexts,
  savePageTexts,
} from '@/lib/page-text-store';
import { buildSearchDocuments, searchDocuments } from '@/lib/search-documents';
import { parseSearchQuery, SEARCH_CONTENT_SNIPPET_CHARS } from '@/lib/search-query';
import { searchReasonLabel } from '@/lib/search-reasons';
import { describeSearchProblems } from '@/lib/search-syntax-help';
import { saveSettings } from '@/lib/settings-storage';
import { isUrlInOrigin } from '@/lib/site-access';
import { INDEXED_DATABASES } from '@/lib/storage/registry';
import { addPageText } from '@/services/page-reader';
import {
  listPageTextSites,
  type PageTextScanItem,
  readPageTextHtml,
  savePageTextResults,
  scanPageTexts,
} from '@/services/page-text';
import {
  purgePageTextsWithoutAccess,
  registerPageTextAccessCleanup,
} from '@/services/page-text-coverage';
import type { BookmarkTreeNode } from '@/types';
import { installFakeBookmarks } from '../fake-bookmarks';
import { installFakePermissions } from '../fake-permissions';

const OPTIONS = {
  skipPrivateHosts: true,
  skipSecretUrls: true,
  sensitiveParams: ['token', 'session*'],
  excludedSites: [],
};
const MAX = PAGE_TEXT_LIMITS.maxCharsPerPage;
const HTML_TYPE = { headers: { 'content-type': 'text/html' } };

const page = (body: string, head = '<title>Page</title>') =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

const folder = (children: { id: string; url: string; title?: string }[]): BookmarkTreeNode[] => [
  {
    id: 'f',
    parentId: '1',
    title: 'Folder',
    children: children.map(({ id, url, title }) => ({
      id,
      parentId: 'f',
      title: title ?? id,
      url,
    })),
  },
];

const statuses = (items: readonly PageTextScanItem[]) =>
  Object.fromEntries(items.map((item) => [item.id, item.status]));

beforeEach(async () => {
  await clearPageTexts();
  vi.stubGlobal('DOMParser', LinkedomParser);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('text kept as blocks (S34)', () => {
  const ARTICLE = page(`<article><h1>Notes</h1>
    <p>We walked along the shore and met the friendly two</p>
    <p>words appear in this other paragraph about a quokka by the river, far from the shore.</p>
    <ul><li>first point</li><li>second point</li></ul></article>`);

  it('keeps one block per line, each on one line', async () => {
    const reading = await readPageTextHtml(ARTICLE, MAX);
    if (reading.status !== 'read') throw new Error(reading.status);
    const lines = reading.text.split('\n');
    expect(lines).toContain('We walked along the shore and met the friendly two');
    expect(lines).toContain('first point');
    expect(lines).toContain('second point');
    // Plain text, not Markdown.
    expect(reading.text).not.toMatch(/^[#*-] /m);
  });

  it('reads a page Readability finds no article in the same way', async () => {
    const reading = await readPageTextHtml(
      page('<div>alpha beta</div><div>gamma <span>delta</span></div>'),
      MAX,
    );
    expect(reading).toEqual({ status: 'read', text: 'alpha beta\ngamma delta', truncated: false });
  });

  it('never matches a phrase across two paragraphs, and shows the paragraph a match is in', async () => {
    const reading = await readPageTextHtml(ARTICLE, MAX);
    if (reading.status !== 'read') throw new Error(reading.status);
    const tree = folder([{ id: 'a', url: 'https://notes.example/' }]);
    const texts = new Map([['a', { url: 'https://notes.example/', text: reading.text }]]);
    const find = (query: string) =>
      searchDocuments(buildSearchDocuments(tree, {}, texts), parseSearchQuery(query).query);
    expect(find('"two words"')).toEqual([]);
    expect(find('content:"two words"')).toEqual([]);
    expect(find('"point second"')).toEqual([]);
    // Inside one paragraph, a phrase matches, also with more spaces typed.
    expect(find('"friendly  two"')).toHaveLength(1);
    expect(find('two words')).toHaveLength(1);
    const [hit] = find('quokka');
    const reason = hit?.reasons.find((candidate) => candidate.field === 'content');
    const snippet = reason?.field === 'content' ? reason.snippet : '';
    // The paragraph the match is in, around the match, never the one before it.
    expect(snippet).toContain('about a quokka by the river');
    expect(snippet).not.toContain('friendly');
    expect(snippet).not.toContain('\n');
    expect(snippet.length).toBeLessThanOrEqual(SEARCH_CONTENT_SNIPPET_CHARS + 2);
  });
});

describe('what is never kept (S11)', () => {
  const PAGE = page(`<main><article><h1>Trip</h1>
    <p>We finally saw a quokka resting under a peppermint tree on the island today.</p>
    <form><input type="hidden" name="csrf" value="HIDDEN-FIELD-VALUE">
    <input name="q" value="TYPED-VALUE"><textarea>TEXTAREA-TEXT</textarea>
    <select><option>OPTION-TEXT</option></select><button>BUTTON-TEXT</button></form>
    <template><p>TEMPLATE-TEXT</p></template><noscript>NOSCRIPT-TEXT</noscript>
    <script>SCRIPT-TEXT</script><style>STYLE-TEXT</style>
    <div hidden>HIDDEN-ELEMENT-TEXT</div><span aria-hidden="true">ARIA-HIDDEN-TEXT</span>
    </article></main>`);
  const NEVER = [
    'HIDDEN-FIELD-VALUE',
    'TYPED-VALUE',
    'TEXTAREA-TEXT',
    'OPTION-TEXT',
    'BUTTON-TEXT',
    'TEMPLATE-TEXT',
    'NOSCRIPT-TEXT',
    'SCRIPT-TEXT',
    'STYLE-TEXT',
    'HIDDEN-ELEMENT-TEXT',
    'ARIA-HIDDEN-TEXT',
  ];

  it('keeps no hidden field, template, noscript, script, or hidden element of a downloaded page', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        requested.push(input);
        // Without Readability's article, the whole body is read the same way.
        const body = input.includes('bare.') ? PAGE.replace(/<\/?(main|article)>/g, '') : PAGE;
        return new Response(body, { headers: { 'content-type': 'text/html' } });
      }),
    );
    const { items } = await scanPageTexts(
      folder([
        { id: 'article', url: 'https://trip.example/' },
        { id: 'bare', url: 'https://bare.example/' },
      ]),
      OPTIONS,
    );
    expect(requested).toHaveLength(2);
    for (const item of items) {
      expect(item.status).toBe('read');
      expect(item.text).toContain('quokka');
      for (const secret of NEVER) expect(item.text).not.toContain(secret);
    }
  });
});

describe('files, sizes, and charsets (S14-S16)', () => {
  const bytes = (...parts: (string | number[])[]) =>
    new Uint8Array(
      parts.flatMap((part) =>
        typeof part === 'string' ? [...new TextEncoder().encode(part)] : part,
      ),
    );

  it('lists a PDF or an image as not a web page, without downloading it (S15)', async () => {
    const bodies: Response[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const type = input.endsWith('.pdf') ? 'application/pdf' : 'image/png';
        const response = new Response('%PDF-1.7 quokka', { headers: { 'content-type': type } });
        bodies.push(response);
        return response;
      }),
    );
    const { items } = await scanPageTexts(
      folder([
        { id: 'pdf', url: 'https://files.example/paper.pdf' },
        { id: 'png', url: 'https://files.example/photo.png' },
      ]),
      OPTIONS,
    );
    expect(statuses(items)).toEqual({ pdf: 'unsupported', png: 'unsupported' });
    expect(items.every((item) => item.text === undefined)).toBe(true);
    expect(bodies).toHaveLength(2);
  });

  it('reads no more than the byte cap of a huge page (S14)', async () => {
    const limits = PAGE_TEXT_LIMITS as { maxBytes: number };
    const maxBytes = limits.maxBytes;
    const huge = page(
      `<article><p>${'Plenty of filler words about the trip. '.repeat(200)}</p><p>quokka at the end</p></article>`,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(huge, { headers: { 'content-type': 'text/html' } })),
    );
    let items: PageTextScanItem[];
    try {
      limits.maxBytes = 2000;
      ({ items } = await scanPageTexts(folder([{ id: 'huge', url: 'https://big.example/' }]), {
        ...OPTIONS,
      }));
    } finally {
      limits.maxBytes = maxBytes;
    }
    const [item] = items;
    expect(item?.status).toBe('read');
    expect(item?.text).toContain('filler');
    expect(item?.text).not.toContain('quokka');
    expect(item?.text?.length).toBeLessThan(2000);
  });

  it('decodes windows-1251 and Shift_JIS pages, and recovers from a bad charset and broken markup (S16)', async () => {
    // "Привет мир" in windows-1251, and "日本語のテキスト" in Shift_JIS.
    const cyrillic = [0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x20, 0xec, 0xe8, 0xf0];
    const japanese = [
      0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x82, 0xcc, 0x83, 0x65, 0x83, 0x4c, 0x83, 0x58, 0x83,
      0x67,
    ];
    const pages: Record<string, { body: Uint8Array; type: string }> = {
      'https://ru.example/': {
        body: bytes('<html><body><p>', cyrillic, '</p></body></html>'),
        type: 'text/html; charset=windows-1251',
      },
      'https://jp.example/': {
        body: bytes(
          '<html><head><meta charset="Shift_JIS"></head><body><p>',
          japanese,
          '</p></body></html>',
        ),
        type: 'text/html',
      },
      'https://odd.example/': {
        body: bytes('<html><body><p>café <b>bold <div>unclosed</p>'),
        type: 'text/html; charset=x-no-such-charset',
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const answer = pages[input];
        if (!answer) throw new TypeError('Failed to fetch');
        return new Response(answer.body, { headers: { 'content-type': answer.type } });
      }),
    );
    const { items } = await scanPageTexts(
      folder(Object.keys(pages).map((url, index) => ({ id: `p${index}`, url }))),
      OPTIONS,
    );
    expect(items.map((item) => [item.status, item.text])).toEqual([
      ['read', 'Привет мир'],
      ['read', '日本語のテキスト'],
      ['read', 'café bold\nunclosed'],
    ]);
  });
});

describe('one download per address (S19, S20)', () => {
  it('downloads an address once for every bookmark of it, and each keeps its own row', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        requested.push(input);
        return new Response(page(`<p>Text of ${new URL(input).search || 'the page'} here.</p>`), {
          headers: { 'content-type': 'text/html' },
        });
      }),
    );
    const { items } = await scanPageTexts(
      folder([
        { id: 'one', url: 'https://same.example/a' },
        { id: 'two', url: 'https://same.example/a' },
        { id: 'three', url: 'https://same.example/a' },
        // A different query is a different page, never merged (S20).
        { id: 'other', url: 'https://same.example/a?page=2' },
      ]),
      OPTIONS,
    );
    expect(requested.sort()).toEqual(['https://same.example/a', 'https://same.example/a?page=2']);
    expect(items.map((item) => [item.id, item.status, item.text])).toEqual([
      ['one', 'read', 'Text of the page here.'],
      ['two', 'read', 'Text of the page here.'],
      ['three', 'read', 'Text of the page here.'],
      ['other', 'read', 'Text of ?page=2 here.'],
    ]);
    installFakeBookmarks(items.map((item) => ({ id: item.id, title: item.title, url: item.url })));
    expect(await savePageTextResults(items)).toEqual({ saved: 4, notSaved: 0 });
    expect([...(await getPageTexts()).keys()].sort()).toEqual(['one', 'other', 'three', 'two']);
  });
});

describe('addresses that may hold a secret', () => {
  const nodes = folder([
    { id: 'login', url: 'https://user:secret@private.example/' },
    { id: 'token', url: 'https://api.example/feed?Token=abc123' },
    { id: 'session', url: 'https://app.example/?sessionId=1' },
    { id: 'fine', url: 'https://fine.example/?page=2' },
  ]);
  let requested: string[] = [];
  beforeEach(() => {
    requested = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        requested.push(input);
        return new Response(page('<p>Fine page text.</p>'), {
          headers: { 'content-type': 'text/html' },
        });
      }),
    );
  });

  it('never requests an address with a password or a sensitive parameter, and says why', async () => {
    expect(await listPageTextSites(nodes, OPTIONS)).toEqual([{ site: 'fine.example', count: 1 }]);
    const { items } = await scanPageTexts(nodes, OPTIONS);
    expect(items.map((item) => [item.id, item.status, item.skipReason])).toEqual([
      ['login', 'skipped', 'credentials'],
      ['token', 'skipped', 'sensitiveParam'],
      ['session', 'skipped', 'sensitiveParam'],
      ['fine', 'read', undefined],
    ]);
    expect(requested).toEqual(['https://fine.example/?page=2']);
  });

  it('reads those addresses like any other with Skip Addresses with Sign-in Details or Secrets off', async () => {
    const options = { ...OPTIONS, skipSecretUrls: false };
    expect(await listPageTextSites(nodes, options)).toHaveLength(4);
    const { items } = await scanPageTexts(nodes, options);
    expect(items.map((item) => [item.id, item.status, item.skipReason])).toEqual([
      ['login', 'read', undefined],
      ['token', 'read', undefined],
      ['session', 'read', undefined],
      ['fine', 'read', undefined],
    ]);
    expect(requested).toHaveLength(4);
  });
});

describe('bookmarks restored or edited during a run (S23, S24)', () => {
  it('reads a restored bookmark with a new id again, and drops the old id when saving (S23)', async () => {
    const url = 'https://notes.example/a';
    await savePageTexts([{ bookmarkId: 'old', url, text: 'old text' }], 'download');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(page('<p>Fresh text.</p>'), HTML_TYPE)),
    );
    // The bookmark was deleted and restored: same address, new id.
    installFakeBookmarks([{ id: 'new', title: 'Notes', url }]);
    const { items } = await scanPageTexts(folder([{ id: 'new', url }]), OPTIONS);
    expect(statuses(items)).toEqual({ new: 'read' });
    await savePageTextResults(items);
    const stored = await getPageTexts();
    expect([...stored.keys()]).toEqual(['new']);
    expect(stored.get('new')?.text).toBe('Fresh text.');
  });

  it('removes the text of deleted bookmarks', async () => {
    await savePageTexts(
      [
        { bookmarkId: 'a', url: 'https://a.example/', text: 'a' },
        { bookmarkId: 'b', url: 'https://b.example/', text: 'b' },
      ],
      'download',
    );
    expect(await removePageTexts(['a', 'missing'])).toBe(1);
    expect([...(await getPageTexts()).keys()]).toEqual(['b']);
  });

  it('does not save text read before its bookmark moved to another address (S24)', async () => {
    installFakeBookmarks([
      { id: 'moved', title: 'Moved', url: 'https://new.example/' },
      { id: 'kept', title: 'Kept', url: 'https://kept.example/' },
    ]);
    const read = (id: string, url: string): PageTextScanItem => ({
      id,
      title: id,
      url,
      folderPath: '',
      status: 'read',
      text: `text of ${url}`,
    });
    const result = await savePageTextResults([
      read('moved', 'https://old.example/'),
      read('kept', 'https://kept.example/'),
    ]);
    expect(result).toEqual({ saved: 1, notSaved: 0 });
    const stored = await getPageTexts();
    expect([...stored.keys()]).toEqual(['kept']);
    expect(isPageTextCurrent(stored.get('kept'), 'https://kept.example/')).toBe(true);
  });
});

describe('a corrupt record (S29)', () => {
  it('is ignored: the bookmark is read again and nothing else breaks', async () => {
    await savePageTexts(
      [{ bookmarkId: 'good', url: 'https://good.example/', text: 'good' }],
      'download',
    );
    const db = await openDB(INDEXED_DATABASES.pageText.name);
    await db.put('pages', { bookmarkId: 'bad', url: 42, text: null });
    db.close();
    const stored = await getPageTexts();
    expect([...stored.keys()]).toEqual(['good']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(page('<p>Read again.</p>'), HTML_TYPE)),
    );
    const { items } = await scanPageTexts(
      folder([
        { id: 'good', url: 'https://good.example/' },
        { id: 'bad', url: 'https://bad.example/' },
      ]),
      OPTIONS,
    );
    expect(statuses(items)).toEqual({ good: 'current', bad: 'read' });
  });
});

describe('CJK and HTML-looking text in search (S32, S35)', () => {
  it('finds words in Chinese and Japanese body text without spaces (S32)', async () => {
    const reading = await readPageTextHtml(
      page(
        '<article><p>我们今天讨论快速排序算法的实现细节和性能。</p><p>量子コンピュータの基礎を学びました。</p></article>',
      ),
      MAX,
    );
    if (reading.status !== 'read') throw new Error(reading.status);
    const tree = folder([{ id: 'cjk', url: 'https://cjk.example/', title: 'Notes' }]);
    const texts = new Map([['cjk', { url: 'https://cjk.example/', text: reading.text }]]);
    const find = (query: string) =>
      searchDocuments(buildSearchDocuments(tree, {}, texts), parseSearchQuery(query).query).map(
        (result) => result.document.id,
      );
    expect(find('快速排序')).toEqual(['cjk']);
    expect(find('content:量子コンピュータ')).toEqual(['cjk']);
    expect(find('"排序算法"')).toEqual(['cjk']);
    expect(find('content:冒泡排序')).toEqual([]);
  });

  it('keeps page text that looks like HTML as plain text in the snippet (S35)', async () => {
    await saveSettings({ language: 'en' });
    setLanguage('en');
    const reading = await readPageTextHtml(
      page('<article><p>Never paste &lt;img src=x onerror=alert(1)&gt; in a form.</p></article>'),
      MAX,
    );
    if (reading.status !== 'read') throw new Error(reading.status);
    expect(reading.text).toContain('<img src=x onerror=alert(1)>');
    const tree = folder([{ id: 'x', url: 'https://x.example/', title: 'Tips' }]);
    const texts = new Map([['x', { url: 'https://x.example/', text: reading.text }]]);
    const [hit] = searchDocuments(
      buildSearchDocuments(tree, {}, texts),
      parseSearchQuery('onerror').query,
    );
    expect(searchReasonLabel(hit?.reasons)).toBe(
      'page: Never paste <img src=x onerror=alert(1)> in a form.',
    );
  });
});

describe('website access taken back (S46)', () => {
  const PAGES = [
    { bookmarkId: 'a', url: 'https://docs.alpha.example/1', text: 'alpha' },
    { bookmarkId: 'b', url: 'http://beta.example/2', text: 'beta' },
    { bookmarkId: 'c', url: 'https://gamma.example/3', text: 'gamma' },
  ];

  it('matches host permission patterns by scheme and host', () => {
    expect(isUrlInOrigin('https://docs.alpha.example/x', 'https://*.alpha.example/*')).toBe(true);
    expect(isUrlInOrigin('https://alpha.example/', 'https://*.alpha.example/*')).toBe(true);
    expect(isUrlInOrigin('http://alpha.example/', 'https://*.alpha.example/*')).toBe(false);
    expect(isUrlInOrigin('https://notalpha.example/', 'https://*.alpha.example/*')).toBe(false);
    expect(isUrlInOrigin('http://127.0.0.1:8080/a', 'http://127.0.0.1/*')).toBe(true);
    expect(isUrlInOrigin('https://any.example/', '*://*/*')).toBe(true);
    expect(isUrlInOrigin('https://any.example/', '<all_urls>')).toBe(true);
    expect(isUrlInOrigin('javascript:void(0)', '<all_urls>')).toBe(false);
  });

  it("deletes a site's text when its access is removed, and keeps what other access still covers", async () => {
    await savePageTexts(PAGES, 'download');
    // One site removed, and no other access to it.
    expect(
      await purgePageTextsWithoutAccess(
        ['http://*.alpha.example/*', 'https://*.alpha.example/*'],
        async () => false,
      ),
    ).toBe(1);
    expect([...(await getPageTexts()).keys()].sort()).toEqual(['b', 'c']);
    // All websites removed, while beta.example stays granted on its own.
    expect(
      await purgePageTextsWithoutAccess(
        ['http://*/*', 'https://*/*'],
        async (site) => site === 'beta.example',
      ),
    ).toBe(1);
    expect([...(await getPageTexts()).keys()]).toEqual(['b']);
  });

  it('runs when the browser reports access removed, in Chrome and Firefox alike', async () => {
    await savePageTexts(PAGES, 'download');
    const permissions = installFakePermissions({
      origins: ['http://*.alpha.example/*', 'https://*.alpha.example/*', 'https://*/*'],
    });
    registerPageTextAccessCleanup();
    // https: on all websites still covers gamma.example and alpha.example.
    permissions.revoke({ origins: ['http://*.alpha.example/*', 'https://*.alpha.example/*'] });
    await vi.waitFor(async () => expect((await getPageTexts()).size).toBe(3));
    permissions.revoke({ origins: ['https://*/*'] });
    await vi.waitFor(async () => expect([...(await getPageTexts()).keys()].sort()).toEqual(['b']));
  });
});

describe('the search notice while Index Page Text is off (S47)', () => {
  beforeEach(async () => {
    await saveSettings({ language: 'en' });
    setLanguage('en');
  });

  it('says page text search is off for content: and has:content, and only then', () => {
    const notice =
      'Page text search is off, so content: and has:content find nothing. Turn on Index Page Text in Settings.';
    expect(describeSearchProblems('content:quokka', false)).toEqual([notice]);
    expect(describeSearchProblems('tag:x (has:content OR title:y)', false)).toEqual([notice]);
    expect(describeSearchProblems('-has:content', false)).toEqual([notice]);
    expect(describeSearchProblems('content:quokka', true)).toEqual([]);
    expect(describeSearchProblems('quokka title:content', false)).toEqual([]);
    expect(describeSearchProblems('foo:bar content:x', false)).toEqual([
      'foo: is not an operator, so it is searched as text.',
      notice,
    ]);
  });
});

describe('AI page reading and Index Page Text stay apart (S49)', () => {
  it('AI page reading off reads nothing, even with the index on and text indexed', async () => {
    await saveSettings({ pageTextEnabled: true, aiReadPageContent: false });
    await savePageTexts(
      [{ bookmarkId: 'a', url: 'https://a.example/', text: 'indexed' }],
      'download',
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const items = [{ url: 'https://a.example/' }];
    expect(await addPageText(items, false)).toEqual(items);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('AI page reading on keeps nothing in the index', async () => {
    await saveSettings({ pageTextEnabled: false, aiReadPageContent: true });
    installFakePermissions({ origins: ['http://*/*', 'https://*/*'] });
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(page('<p>Sent to the AI only.</p>'), HTML_TYPE)),
    );
    const [item] = await addPageText([{ url: 'https://a.example/' }], true);
    expect(item?.pageText).toContain('Sent to the AI only.');
    expect((await getPageTexts()).size).toBe(0);
  });
});
