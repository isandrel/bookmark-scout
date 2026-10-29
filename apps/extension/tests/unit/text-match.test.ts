import { describe, expect, it } from 'vitest';
import {
  compileTextQuery,
  findTextMatches,
  joinRanges,
  matchesEveryTerm,
  type TextQuery,
} from '@/lib/text-match';

function query(text: string): TextQuery {
  const compiled = compileTextQuery(text);
  if (!compiled) throw new Error(`no words in "${text}"`);
  return compiled;
}

/** The marked parts of `text`, in order. */
function marked(text: string, search: string): string[] {
  return findTextMatches(text, query(search)).ranges.map(([start, end]) => text.slice(start, end));
}

describe('compileTextQuery', () => {
  it('reads words, folded, once each, and nothing from blank input', () => {
    expect(compileTextQuery('  Popup   WIDTH ')).toEqual({ terms: ['popup', 'width'] });
    expect(compileTextQuery('tab Tab TAB')).toEqual({ terms: ['tab'] });
    expect(compileTextQuery('Café')).toEqual({ terms: ['cafe'] });
    // Ideographic space separates words too.
    expect(compileTextQuery('書籤　資料夾')).toEqual({ terms: ['書籤', '資料夾'] });
    expect(compileTextQuery('   ')).toBeUndefined();
    expect(compileTextQuery('')).toBeUndefined();
  });
});

describe('findTextMatches', () => {
  it('ignores case and marks the text as written', () => {
    expect(marked('Show Favicons', 'FAVICON')).toEqual(['Favicon']);
  });

  it('ignores accents both ways and marks the accented letters', () => {
    expect(marked('Paramètres de résumé', 'resume')).toEqual(['résumé']);
    expect(marked('Resume later', 'résumé')).toEqual(['Resume']);
    // A decomposed accent (e + U+0301) is marked with its letter.
    const decomposed = 'Café au lait';
    expect(marked(decomposed, 'cafe')).toEqual(['Café']);
    expect(marked('Ärger über Größe', 'GROSSE')).toEqual([]);
    expect(marked('Ärger über Größe', 'grö')).toEqual(['Grö']);
  });

  it('marks every word wherever it is, with overlapping and touching marks joined', () => {
    // Words are marked one by one; the space between two of them is not a match.
    expect(marked('Popup width and popup height', 'popup height')).toEqual([
      'Popup',
      'popup',
      'height',
    ]);
    // "pop" and "popup" overlap; "ab" and "cd" touch.
    expect(findTextMatches('Popup', query('pop popup')).ranges).toEqual([[0, 5]]);
    expect(findTextMatches('abcd', query('ab cd')).ranges).toEqual([[0, 4]]);
    // Repeats inside one run overlap too.
    expect(findTextMatches('aaaa', query('aa')).ranges).toEqual([[0, 4]]);
  });

  it('reports which words it found', () => {
    expect([...findTextMatches('Popup width', query('width size popup')).terms]).toEqual([0, 2]);
  });

  it('matches Chinese, Japanese, and Korean text by substring', () => {
    expect(marked('在弹出窗口中显示网站图标', '网站图标')).toEqual(['网站图标']);
    expect(marked('ブックマークを検索', 'マーク')).toEqual(['マーク']);
    // Voiced kana stay distinct from unvoiced ones: ガ is not カ.
    expect(marked('ガイド', 'カイド')).toEqual([]);
    expect(marked('북마크 검색 기록', '검색')).toEqual(['검색']);
  });

  it('treats regular expression characters as text', () => {
    expect(marked('C++ (and C#) for a.*b', 'c++')).toEqual(['C++']);
    expect(marked('C++ (and C#) for a.*b', '(and')).toEqual(['(and']);
    expect(marked('C++ (and C#) for a.*b', '.*')).toEqual(['.*']);
    expect(marked('C++ (and C#) for axxb', '.*')).toEqual([]);
    expect(marked('[x] $1 ^start', '$1')).toEqual(['$1']);
  });

  it('matches full-width forms and marks whole characters', () => {
    expect(marked('ＡＩ設定', 'ai')).toEqual(['ＡＩ']);
    // "ﬁ" folds to two letters; a match on one of them marks the ligature.
    expect(marked('ﬁle names', 'f')).toEqual(['ﬁ']);
    // İ lowercases with a combining dot, which folds away.
    expect(marked('İstanbul', 'istan')).toEqual(['İstan']);
  });

  it('keeps offsets right around emoji', () => {
    const text = '📌 Pinned 📌 pins';
    expect(marked(text, 'pin')).toEqual(['Pin', 'pin']);
  });
});

describe('matchesEveryTerm', () => {
  it('needs every word, each in any of the texts', () => {
    expect(matchesEveryTerm(['Popup Width', 'How wide the popup is'], query('wide popup'))).toBe(
      true,
    );
    expect(matchesEveryTerm(['Popup Width'], query('popup height'))).toBe(false);
    expect(matchesEveryTerm([], query('popup'))).toBe(false);
  });
});

describe('joinRanges', () => {
  it('sorts and joins overlapping and touching ranges', () => {
    expect(
      joinRanges([
        [5, 7],
        [0, 2],
        [1, 3],
        [3, 4],
        [9, 10],
      ]),
    ).toEqual([
      [0, 4],
      [5, 7],
      [9, 10],
    ]);
  });
});
