import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  ESSENTIAL_SETTINGS,
  ESSENTIALS_CATEGORY,
  getEssentialsCategory,
  getSectionFields,
  getSettingsCategories,
  getSettingsFieldGroups,
  getSettingsFieldMeta,
  isSettingShown,
  settingsSchema,
} from '@/lib/settings-schema';
import { readConfigToml } from '../config-files';

type SettingKey = keyof typeof defaultSettings;

// Device settings changed where they apply: the AI activity panel's recording switch and Ask AI's
// web search button.
const EDITED_ELSEWHERE = new Set([
  'aiActivityRecording',
  'askAiWebSearch',
  // Edited in their Options panels (ManagerMenusPanel, ManagerViewPanels, AskAIActionsPanel).
  'askAiDisabledActions',
  'agentBridgeDisabledActions',
  'managerMenuActions',
  'managerOrganizeMenu',
  'managerEmptySpaceMenu',
  'managerPreviewMenu',
  'managerDefaultColumns',
  'managerCardFields',
  'previewFields',
]);

describe('Options layout', () => {
  const categories = Object.values(getSettingsCategories());
  const sections = categories.flatMap((category) => category.sections);
  const placed = sections.flatMap(getSectionFields);

  it('places every setting in exactly one section', () => {
    const duplicates = placed.filter((key, index) => placed.indexOf(key) !== index);
    expect(duplicates).toEqual([]);
    const missing = Object.keys(defaultSettings).filter(
      (key) =>
        !EDITED_ELSEWHERE.has(key) &&
        isSettingShown(key as keyof typeof defaultSettings) &&
        !placed.includes(key as keyof typeof defaultSettings),
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

  it('leaves one-option choices off the page', () => {
    const meta = getSettingsFieldMeta();
    for (const key of placed) {
      if (meta[key].type === 'select') expect(meta[key].options?.length, key).toBeGreaterThan(1);
    }
    expect(placed).not.toContain('autoTaggingDefaultScope');
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
      expect(
        shown.every((key) => owners[0].includes(key)),
        group.id,
      ).toBe(true);
      if (group.kind === 'switch') expect(meta[group.fields[0]].type).toBe('switch');
      if (group.kind === 'pair') {
        expect(group.fields.map((key) => meta[key].type)).toEqual(['number', 'number']);
      }
    }
  });
});

describe('Essentials', () => {
  const essentials = getEssentialsCategory();
  const configured = (readConfigToml('ui/essentials.toml') as { settings: string[] }).settings;

  it('lists exactly the configured settings, in their configured order', () => {
    expect(ESSENTIAL_SETTINGS).toEqual(configured);
    expect(essentials.fields).toEqual(
      configured.filter((key) => isSettingShown(key as SettingKey)),
    );
    expect(essentials.sections.flatMap((section) => section.panel ?? [])).toEqual(['essentialsAi']);
  });

  it('shows each one a second time: it still has its own tab, and search finds it once', () => {
    const homes = Object.entries(getSettingsCategories());
    for (const key of ESSENTIAL_SETTINGS) {
      const owners = homes.filter(([, category]) => category.fields.includes(key));
      expect(
        owners.map(([id]) => id),
        key,
      ).toHaveLength(1);
    }
    expect(Object.keys(getSettingsCategories())).not.toContain(ESSENTIALS_CATEGORY);
  });

  it('keeps the essentials a short list', () => {
    expect(ESSENTIAL_SETTINGS.length).toBeLessThanOrEqual(8);
  });
});

describe('For developers', () => {
  it('holds local AI agents, apart from the AI tab', () => {
    const categories = getSettingsCategories();
    expect(categories.developers.fields).toContain('agentBridgeEnabled');
    expect(categories.ai.fields).not.toContain('agentBridgeEnabled');
    expect(categories.ai.sections.map((section) => section.panel)).not.toContain('agentBridge');
  });
});

describe('setting ranges', () => {
  it('rejects a minimum above its maximum, except when the maximum is no limit', () => {
    const parse = (values: Partial<typeof defaultSettings>) =>
      settingsSchema.safeParse({ ...defaultSettings, ...values }).success;
    expect(parse({ autoTaggingMinTags: 7, autoTaggingMaxTags: 5 })).toBe(false);
    expect(parse({ autoTaggingMinTags: 5, autoTaggingMaxTags: 5 })).toBe(true);
    expect(parse({ aiMinItemsPerFolder: 20, aiMaxItemsPerFolder: 10 })).toBe(false);
    expect(parse({ aiMinItemsPerFolder: 20, aiMaxItemsPerFolder: -1 })).toBe(true);
  });
});
