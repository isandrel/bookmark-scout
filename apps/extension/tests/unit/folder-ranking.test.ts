import { describe, expect, it } from 'vitest';
import {
  buildFolderRankingIndex,
  FOLDER_RANKING_MIN_SCORE,
  getPageQueryWords,
  rankFolders,
  tokenizeHost,
  tokenizeText,
  tokenizeUrlPath,
} from '@/lib/folder-ranking';
import type { BookmarkTreeNode } from '@/types';

type Spec = { title: string; bookmarks?: [title: string, url: string][]; folders?: Spec[] };

let nextId = 0;
function folder(spec: Spec, parentId: string): BookmarkTreeNode {
  const id = `f${nextId++}`;
  return {
    id,
    parentId,
    title: spec.title,
    children: [
      ...(spec.bookmarks ?? []).map(([title, url]) => ({
        id: `b${nextId++}`,
        parentId: id,
        title,
        url,
      })),
      ...(spec.folders ?? []).map((child) => folder(child, id)),
    ],
  };
}

function tree(...bar: Spec[]): BookmarkTreeNode[] {
  return [
    { id: '0', title: '', children: [folder({ title: 'Bookmarks Bar', folders: bar }, '0')] },
  ];
}

function paths(nodes: BookmarkTreeNode[], page: { title?: string; url?: string }, limit = 3) {
  return rankFolders(buildFolderRankingIndex(nodes), page, { limit }).map((folder) =>
    folder.path.join('/'),
  );
}

describe('tokenizeText', () => {
  it('lowercases and drops stop words and short words', () => {
    expect(tokenizeText('How to Build a React App in TypeScript')).toEqual([
      'build',
      'react',
      'app',
      'typescript',
    ]);
  });

  it('splits Chinese and Japanese text into dictionary words', () => {
    expect(tokenizeText('机器学习入门教程')).toEqual(expect.arrayContaining(['机器', '学习']));
    expect(tokenizeText('東京の天気予報')).toEqual(expect.arrayContaining(['東京', '天気']));
    expect(tokenizeText('東京の天気予報')).not.toContain('の');
  });

  it('keeps single CJK characters, which count as two toward the minimum length', () => {
    expect(tokenizeText('猫')).toEqual(['猫']);
    expect(tokenizeText('x')).toEqual([]);
  });

  it('keeps Korean and accented words whole', () => {
    expect(tokenizeText('서울 맛집 추천')).toEqual(['서울', '맛집', '추천']);
    expect(tokenizeText('Été à Paris')).toEqual(['été', 'paris']);
  });
});

describe('URL words', () => {
  it('names a site by the labels before its public suffix, without www', () => {
    expect(tokenizeHost('https://www.github.com/x')).toEqual(['github']);
    expect(tokenizeHost('https://docs.python.org/3/')).toEqual(['docs', 'python']);
    expect(tokenizeHost('https://news.bbc.co.uk/')).toEqual(['news', 'bbc']);
    expect(tokenizeHost('not a url')).toEqual([]);
    expect(tokenizeHost('http://127.0.0.1:8080/')).toEqual([]);
    expect(tokenizeHost('http://[::1]/')).toEqual([]);
  });

  it('reads decoded path words and leaves out numbers alone', () => {
    expect(
      tokenizeUrlPath('https://example.com/blog/2024/10/react-server_components.html'),
    ).toEqual(['blog', 'react', 'server', 'components']);
    expect(
      tokenizeUrlPath('https://zh.wikipedia.org/wiki/%E6%9C%BA%E5%99%A8%E5%AD%A6%E4%B9%A0'),
    ).toEqual(expect.arrayContaining(['wiki', '机器', '学习']));
  });

  it('builds one query word list without repeats', () => {
    expect(
      getPageQueryWords({ title: 'React docs', url: 'https://react.dev/learn/react' }),
    ).toEqual(['react', 'docs', 'learn']);
  });
});

describe('rankFolders', () => {
  const library = tree(
    {
      title: 'Dev',
      folders: [
        {
          title: 'React',
          bookmarks: [
            ['Hooks reference', 'https://react.dev/reference/react'],
            ['Thinking in React', 'https://react.dev/learn/thinking-in-react'],
          ],
        },
        { title: 'Python', bookmarks: [['Tutorial', 'https://docs.python.org/3/tutorial/']] },
      ],
    },
    {
      title: 'Cooking',
      bookmarks: [
        ['Pasta carbonara recipe', 'https://www.seriouseats.com/carbonara'],
        ['Sourdough bread', 'https://www.kingarthurbaking.com/recipes/sourdough'],
      ],
    },
    { title: '机器学习', bookmarks: [['深度学习入门', 'https://zh.d2l.ai/']] },
  );

  it('ranks the folder whose name and bookmarks match the page first', () => {
    expect(
      paths(library, {
        title: 'useEffect – React',
        url: 'https://react.dev/reference/react/useEffect',
      }),
    ).toEqual(['Bookmarks Bar/Dev/React']);
  });

  it('matches a folder by the site of the bookmarks in it', () => {
    expect(
      paths(library, {
        title: 'Classes',
        url: 'https://docs.python.org/3/tutorial/classes.html',
      })[0],
    ).toBe('Bookmarks Bar/Dev/Python');
  });

  it('matches by bookmark titles when the folder name says nothing', () => {
    expect(
      paths(library, { title: 'Easy pasta recipe for weeknights', url: 'https://food.example/x' }),
    ).toEqual(['Bookmarks Bar/Cooking']);
  });

  it('matches Chinese titles against a Chinese folder name', () => {
    expect(
      paths(library, { title: '机器学习：从入门到实践', url: 'https://example.cn/ml' }),
    ).toEqual(['Bookmarks Bar/机器学习']);
  });

  it('returns nothing when no folder scores the minimum', () => {
    expect(paths(library, { title: 'Weather in Oslo', url: 'https://yr.no/' })).toEqual([]);
    expect(FOLDER_RANKING_MIN_SCORE).toBeGreaterThan(0);
  });

  it('leaves out excluded folders and respects the limit', () => {
    const index = buildFolderRankingIndex(library);
    const page = { title: 'React and Python', url: 'https://example.com/' };
    const all = rankFolders(index, page, { limit: 5, minScore: 0.01 });
    expect(all.map((folder) => folder.path.at(-1))).toEqual(['React', 'Python']);
    const [best] = all;
    expect(rankFolders(index, page, { limit: 1, minScore: 0.01 })).toHaveLength(1);
    expect(
      rankFolders(index, page, { limit: 5, minScore: 0.01, excludeIds: new Set([best.id]) }).map(
        (folder) => folder.path.at(-1),
      ),
    ).toEqual(['Python']);
  });

  it('never offers the invisible root or folders the browser manages', () => {
    const managed: BookmarkTreeNode[] = [
      {
        id: '0',
        title: '',
        children: [
          { id: 'm', parentId: '0', title: 'React', unmodifiable: 'managed', children: [] },
          { id: 'r', parentId: '0', title: 'Other', children: [] },
        ],
      },
    ];
    expect(
      rankFolders(
        buildFolderRankingIndex(managed),
        { title: 'React' },
        { limit: 5, minScore: 0 },
      ).map((folder) => folder.id),
    ).not.toContain('m');
  });

  it('keeps untrusted titles as plain words', () => {
    const hostile = tree({
      title: '<img src=x onerror=alert(1)>',
      bookmarks: [['<b>x</b>', 'javascript:alert(1)']],
    });
    expect(() => paths(hostile, { title: '<img src=x>', url: 'javascript:void(0)' })).not.toThrow();
  });

  it('indexes and ranks 1,500 folders with 19,500 bookmarks quickly', () => {
    const words = [
      'react',
      'python',
      'design',
      'travel',
      'recipes',
      'finance',
      'music',
      'news',
      'rust',
      'go',
    ];
    const folders: Spec[] = Array.from({ length: 1500 }, (_, i) => ({
      title: `${words[i % words.length]} ${i}`,
      bookmarks: Array.from({ length: 13 }, (_, j) => [
        `${words[(i + j) % words.length]} article ${j} about topic ${i} 東京 ${j % 3 ? '' : '学习'}`,
        `https://site${i % 97}.example.com/${words[j % words.length]}/${j}`,
      ]),
    }));
    const big = tree(...folders);
    const started = performance.now();
    const index = buildFolderRankingIndex(big);
    const ranked = rankFolders(
      index,
      { title: 'Learning Rust ownership', url: 'https://site5.example.com/rust/1' },
      { limit: 4 },
    );
    const elapsed = performance.now() - started;
    expect(index.documents).toHaveLength(1501);
    expect(ranked.length).toBeGreaterThan(0);
    // The background caches the index, but even uncached it must stay well under a key press.
    expect(elapsed).toBeLessThan(1000);
  });
});
