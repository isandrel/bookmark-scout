import { describe, expect, it } from 'vitest';
import { defaultSettings, getSettingsCategories } from '@/lib/settings-schema';

// The legacy provider and model fields are edited through AI services, not as settings rows.
const EDITED_ELSEWHERE = new Set(['aiProvider', 'aiModel']);

describe('Options layout', () => {
  const categories = Object.values(getSettingsCategories());
  const placed = categories.flatMap((category) =>
    category.sections.flatMap((section) => section.fields),
  );

  it('places every setting in exactly one section', () => {
    const duplicates = placed.filter((key, index) => placed.indexOf(key) !== index);
    expect(duplicates).toEqual([]);
    // Settings this browser does not support are left out of the page (the icon cache in Firefox).
    const missing = Object.keys(defaultSettings).filter(
      (key) => !EDITED_ELSEWHERE.has(key) && !placed.includes(key as keyof typeof defaultSettings),
    );
    expect(missing).toEqual([]);
  });

  it('gives every section something to show and every category its fields in section order', () => {
    for (const category of categories) {
      for (const section of category.sections) {
        expect(section.fields.length > 0 || section.panel !== undefined).toBe(true);
      }
      expect(category.fields).toEqual(category.sections.flatMap((section) => section.fields));
    }
  });
});
