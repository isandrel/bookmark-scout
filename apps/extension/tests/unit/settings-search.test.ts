import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import { getSettingsCategories, type Settings } from '@/lib/settings-schema';
import { hiddenSettingMatches, matchSetting } from '@/lib/settings-search';
import { compileTextQuery, type TextQuery } from '@/lib/text-match';

beforeEach(() => {
  setLanguage('en');
});

function query(text: string): TextQuery {
  const compiled = compileTextQuery(text);
  if (!compiled) throw new Error(`no words in "${text}"`);
  return compiled;
}

function marked(fieldKey: keyof Settings, search: string, source: 'label' | 'description' | 'id') {
  const match = matchSetting(fieldKey, query(search));
  if (!match) return undefined;
  const { text, ranges } = match[source];
  return ranges.map(([start, end]) => text.slice(start, end));
}

describe('settings search', () => {
  it('marks words in the label and description where they were found', () => {
    // "Popup Width" / "Width of the popup window (browsers allow at most 800 px)"
    expect(marked('popupWidth', 'WIDTH popup', 'label')).toEqual(['Popup', 'Width']);
    expect(marked('popupWidth', 'WIDTH popup', 'description')).toEqual(['Width', 'popup']);
    expect(marked('popupWidth', 'WIDTH popup', 'id')).toEqual(['popupWidth']);
  });

  it('needs every word, each in any of the texts', () => {
    // "window" is only in the description, "popup" in both.
    expect(matchSetting('popupWidth', query('popup window'))).toBeDefined();
    expect(matchSetting('popupWidth', query('popup height'))).toBeUndefined();
  });

  it('names the hidden text that explains a match, and only that', () => {
    const idOnly = matchSetting('popupWidth', query('popupwidth'));
    expect(idOnly && hiddenSettingMatches(idOnly, ['label', 'description'])).toEqual(['id']);

    // Every word is visible in the label, so the id needs no note though it matched too.
    const visible = matchSetting('popupWidth', query('popup width'));
    expect(visible && hiddenSettingMatches(visible, ['label', 'description'])).toEqual([]);

    // A row that shows only the label (a pair's caption) says where "window" was found.
    const inDescription = matchSetting('popupWidth', query('width window'));
    expect(inDescription && hiddenSettingMatches(inDescription, ['label'])).toEqual([
      'description',
    ]);
    // A section's switch shows neither text, and the id holds "width" too.
    expect(inDescription && hiddenSettingMatches(inDescription, [])).toEqual([
      'label',
      'description',
      'id',
    ]);
  });

  it('matches the same settings whatever the order of the words', () => {
    const fields = Object.values(getSettingsCategories()).flatMap((category) => category.fields);
    const matching = (search: string) =>
      fields.filter((fieldKey) => matchSetting(fieldKey, query(search))).sort();
    expect(matching('favicon size')).toEqual(matching('size favicon'));
    expect(matching('favicon size')).toContain('faviconSize');
  });
});
