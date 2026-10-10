import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  getSectionFields,
  getSettingsCategories,
  getSettingsFieldGroups,
  getSettingsFieldMeta,
} from '@/lib/settings-schema';

// The legacy provider and model fields are edited through AI services, not as settings rows.
const EDITED_ELSEWHERE = new Set(['aiProvider', 'aiModel']);

describe('Options layout', () => {
  const categories = Object.values(getSettingsCategories());
  const sections = categories.flatMap((category) => category.sections);
  const placed = sections.flatMap(getSectionFields);

  it('places every setting in exactly one section', () => {
    const duplicates = placed.filter((key, index) => placed.indexOf(key) !== index);
    expect(duplicates).toEqual([]);
    const missing = Object.keys(defaultSettings).filter(
      (key) => !EDITED_ELSEWHERE.has(key) && !placed.includes(key as keyof typeof defaultSettings),
    );
    expect(missing).toEqual([]);
  });

  it('gives every section something to show and every category its fields in section order', () => {
    for (const category of categories) {
      for (const section of category.sections) {
        expect(getSectionFields(section).length > 0 || section.panel !== undefined).toBe(true);
      }
      expect(category.fields).toEqual(category.sections.flatMap(getSectionFields));
    }
  });

  it('uses on/off settings as section switches and folds only 3 or more technical settings', () => {
    const meta = getSettingsFieldMeta();
    for (const section of sections) {
      if (section.toggle) expect(meta[section.toggle].type).toBe('switch');
      if (section.advanced) expect(section.advanced.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps each grouped row inside one list of one section, with a switch leading switch rows', () => {
    const meta = getSettingsFieldMeta();
    const lists = sections.flatMap((section) => [section.fields, section.advanced ?? []]);
    for (const group of getSettingsFieldGroups()) {
      const shown = group.fields.filter((key) => placed.includes(key));
      const owners = lists.filter((list) => shown.some((key) => list.includes(key)));
      expect(owners, group.id).toHaveLength(1);
      expect(shown.every((key) => owners[0].includes(key)), group.id).toBe(true);
      if (group.kind === 'switch') expect(meta[group.fields[0]].type).toBe('switch');
      if (group.kind === 'pair') {
        expect(group.fields.map((key) => meta[key].type)).toEqual(['number', 'number']);
      }
    }
  });
});
