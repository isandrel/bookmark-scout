import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import {
  defaultSettings,
  getSettingsCategories,
  getSettingsFieldMeta,
  SETTING_SEARCH_SOURCE_IDS,
  type SettingSearchSource,
  type Settings,
} from '@/lib/settings-schema';
import {
  compileSettingsQuery,
  hiddenSettingMatches,
  matchSetting,
  SETTING_SEARCH_NOTE_ORDER,
  SETTING_SEARCH_SOURCES,
  SETTINGS_SEARCH_FOLD,
} from '@/lib/settings-search';
import type { TextQuery, TextQueryMode } from '@/lib/text-match';
import en from '../../public/_locales/en/messages.json';
import { readConfigToml } from '../config-files';

type SearchConfig = {
  fold: { ignore_case: boolean; ignore_accents: boolean; ignore_width: boolean };
  note_order: string[];
};
const searchConfig = () => readConfigToml('ui/settings-search.toml') as SearchConfig;

beforeEach(() => {
  setLanguage('en');
});

const ALL_SOURCES = SETTING_SEARCH_SOURCE_IDS;

function query(text: string, mode: TextQueryMode = 'allWords'): TextQuery {
  const compiled = compileSettingsQuery(text, mode);
  if (!compiled) throw new Error(`no words in "${text}"`);
  return compiled;
}

function match(
  fieldKey: keyof Settings,
  search: string,
  sources: readonly SettingSearchSource[] = ALL_SOURCES,
) {
  return matchSetting(fieldKey, query(search), sources);
}

function marked(fieldKey: keyof Settings, search: string, source: SettingSearchSource) {
  const found = match(fieldKey, search)?.find((entry) => entry.source === source);
  if (!found) return undefined;
  return found.ranges.map(([start, end]) => found.text.slice(start, end));
}

const sourcesOf = (entries: readonly { source: SettingSearchSource }[] | undefined) =>
  entries?.map(({ source }) => source);

describe('settings search', () => {
  it('marks words in the label and description where they were found', () => {
    // "Popup Width" / "Width of the popup window (browsers allow at most 800 px)"
    expect(marked('popupWidth', 'WIDTH popup', 'label')).toEqual(['Popup', 'Width']);
    expect(marked('popupWidth', 'WIDTH popup', 'description')).toEqual(['Width', 'popup']);
    expect(marked('popupWidth', 'WIDTH popup', 'id')).toEqual(['popupWidth']);
  });

  it('needs every word, each in any of the texts', () => {
    // "window" is only in the description, "popup" in both.
    expect(match('popupWidth', 'popup window')).toBeDefined();
    expect(match('popupWidth', 'popup height')).toBeUndefined();
  });

  it('names the hidden text that explains a match, and only that', () => {
    const idOnly = match('popupWidth', 'popupwidth');
    expect(sourcesOf(idOnly && hiddenSettingMatches(idOnly, ['label', 'description']))).toEqual([
      'id',
    ]);

    // Every word is visible in the label, so the id needs no note though it matched too.
    const visible = match('popupWidth', 'popup width');
    expect(visible && hiddenSettingMatches(visible, ['label', 'description'])).toEqual([]);

    // A row that shows only the label (a pair's caption) says where "window" was found.
    const inDescription = match('popupWidth', 'width window');
    expect(sourcesOf(inDescription && hiddenSettingMatches(inDescription, ['label']))).toEqual([
      'description',
    ]);
    // A section's switch shows neither text, and the id holds "width" too.
    expect(sourcesOf(inDescription && hiddenSettingMatches(inDescription, []))).toEqual([
      'label',
      'description',
      'id',
    ]);
  });

  it('counts words visible near the row, such as a section heading, as explained', () => {
    const found = match('popupWidth', 'width window');
    // "window" (word 1) shows in the heading above, so only "width" would need a note, and the
    // label shows it.
    expect(found && hiddenSettingMatches(found, ['label'], new Set([1]))).toEqual([]);
    expect(sourcesOf(found && hiddenSettingMatches(found, [], new Set([1])))).toEqual([
      'label',
      'description',
      'id',
    ]);
  });

  it('matches the same settings whatever the order of the words', () => {
    const fields = Object.values(getSettingsCategories()).flatMap((category) => category.fields);
    const matching = (search: string) =>
      fields.filter((fieldKey) => match(fieldKey, search)).sort();
    expect(matching('favicon size')).toEqual(matching('size favicon'));
    expect(matching('favicon size')).toContain('faviconSize');
  });
});

describe('settings search sources', () => {
  it('reads one text per source, in the configured note order', () => {
    const config = searchConfig();
    expect(SETTING_SEARCH_NOTE_ORDER).toEqual(config.note_order);
    expect([...SETTING_SEARCH_NOTE_ORDER].sort()).toEqual([...SETTING_SEARCH_SOURCE_IDS].sort());
    expect(Object.keys(SETTING_SEARCH_SOURCES).sort()).toEqual(
      [...SETTING_SEARCH_SOURCE_IDS].sort(),
    );
    const meta = getSettingsFieldMeta().theme;
    expect(SETTING_SEARCH_SOURCES.label.read('theme', meta)).toBe('Theme');
    expect(SETTING_SEARCH_SOURCES.description.read('theme', meta)).toBe(
      en.settings_themeDesc.message,
    );
    expect(SETTING_SEARCH_SOURCES.keywords.read('theme', meta)).toBe(
      en.settings_themeKeywords.message,
    );
    expect(SETTING_SEARCH_SOURCES.id.read('theme', meta)).toBe('theme');
    // Most settings have no keywords: an empty text never matches.
    expect(
      SETTING_SEARCH_SOURCES.keywords.read('popupWidth', getSettingsFieldMeta().popupWidth),
    ).toBe('');
    expect(sourcesOf(match('theme', 'theme'))).toEqual(SETTING_SEARCH_NOTE_ORDER);
  });

  it('compares with the configured fold rules', () => {
    const config = searchConfig();
    expect(SETTINGS_SEARCH_FOLD).toEqual({
      ignoreCase: config.fold.ignore_case,
      ignoreAccents: config.fold.ignore_accents,
      ignoreWidth: config.fold.ignore_width,
    });
    // The configured defaults ignore case, accents, and width, as before they were configurable.
    expect(match('popupWidth', 'PÓPUP ｗｉｄｔｈ')).toBeDefined();
  });

  it('finds a setting by its keywords and explains it, since rows never show them', () => {
    // Theme: "dark mode, light mode, night mode, colors".
    const found = match('theme', 'night mode');
    expect(found).toBeDefined();
    expect(marked('theme', 'night mode', 'keywords')).toEqual(['mode', 'mode', 'night', 'mode']);
    expect(sourcesOf(found && hiddenSettingMatches(found, ['label', 'description']))).toEqual([
      'keywords',
    ]);
    expect(match('theme', 'night mode', ['label', 'description', 'id'])).toBeUndefined();
  });

  it('every keywords message belongs to a setting', () => {
    const owned = new Set(
      Object.values(getSettingsFieldMeta()).flatMap((meta) =>
        meta.keywords ? [meta.keywords] : [],
      ),
    );
    const orphans = Object.entries(en)
      .filter(([key]) => /^settings_\w+Keywords$/.test(key))
      .filter(([, entry]) => !owned.has(entry.message))
      .map(([key]) => key);
    expect(orphans).toEqual([]);
  });

  it('searches only the sources Search In names, but counts what the row shows as visible', () => {
    // "popupwidth" is only in the id.
    expect(match('popupWidth', 'popupwidth', ['label', 'description', 'keywords'])).toBeUndefined();
    // "window" is only in the description.
    expect(match('popupWidth', 'width window', ['label', 'id'])).toBeUndefined();
    const namesOnly = match('popupWidth', 'popup', ['label']);
    expect(namesOnly).toBeDefined();
    // Text that is not searched never gets a note, though the words are in it.
    expect(namesOnly && hiddenSettingMatches(namesOnly, [])).toEqual([
      expect.objectContaining({ source: 'label' }),
    ]);
    // A row's shown label explains a match in the id even when names are not searched.
    const idOnly = match('popupWidth', 'popup', ['id']);
    expect(idOnly && hiddenSettingMatches(idOnly, ['label', 'description'])).toEqual([]);
  });

  it('matches an exact phrase only as typed', () => {
    const fields = Object.values(getSettingsCategories()).flatMap((category) => category.fields);
    const matching = (search: string, mode: TextQueryMode) =>
      fields.filter((fieldKey) => matchSetting(fieldKey, query(search, mode), ALL_SOURCES));
    expect(matching('popup width', 'phrase')).toContain('popupWidth');
    expect(matching('width popup', 'phrase')).not.toContain('popupWidth');
    expect(matching('width popup', 'allWords')).toContain('popupWidth');
  });

  it('defaults to every source and every word, as before the settings existed', () => {
    expect(defaultSettings.settingsSearchSources).toEqual([...SETTING_SEARCH_SOURCE_IDS]);
    expect(defaultSettings.settingsSearchMatch).toBe('allWords');
    expect(defaultSettings.settingsSearchHighlight).toBe(true);
    expect(defaultSettings.settingsSearchNotes).toBe(true);
    expect(defaultSettings.settingsSearchTabCounts).toBe(true);
  });
});
