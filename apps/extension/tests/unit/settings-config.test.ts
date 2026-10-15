import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import { POPUP_SIZE_CSS_VARS, POPUP_SIZE_LIMITS } from '@/hooks/use-popup-size';
import {
  defaultSettings,
  getSectionFields,
  getSettingsCategories,
  getSettingsConfigSections,
  getSettingsFieldMeta,
  SETTING_NUMBER_BOUNDS,
  TOOL_SCOPE_CAPABILITIES,
} from '@/lib/settings-schema';
import { appRoot, readConfigToml } from '../config-files';

beforeEach(() => {
  setLanguage('en');
});

describe('settings defined from config', () => {
  it('derives the Options bounds and validation from the same config entry', () => {
    const meta = getSettingsFieldMeta();
    for (const [key, bounds] of Object.entries(SETTING_NUMBER_BOUNDS)) {
      const field = meta[key as keyof typeof meta];
      expect({ min: field.min, max: field.max, step: field.step }, key).toEqual({
        min: bounds.min,
        max: bounds.max,
        step: bounds.step,
      });
    }
    expect(SETTING_NUMBER_BOUNDS.searchDebounceMs).toMatchObject(
      (readConfigToml('settings/search.toml').search as Record<string, object>).debounce_ms,
    );
  });

  it('gives every setting a translated label and description', () => {
    const untranslated = Object.entries(getSettingsFieldMeta()).flatMap(([key, field]) =>
      [field.label, field.description]
        .filter((text) => !text || text.startsWith('settings_'))
        .map((text) => `${key}: ${text}`),
    );
    expect(untranslated).toEqual([]);
  });

  it('shows a unit on every duration and length setting', () => {
    const meta = getSettingsFieldMeta();
    const missing = Object.keys(SETTING_NUMBER_BOUNDS).flatMap((key) => {
      const { unit, displayScale } = meta[key as keyof typeof meta];
      // Durations are stored in ms; long ones are edited in seconds.
      const durationUnit = displayScale === 1000 ? 's' : 'ms';
      if (key.endsWith('Ms') && unit !== durationUnit) return [`${key}: ${unit}`];
      if (key.endsWith('Length') && unit !== 'chars') return [`${key}: ${unit}`];
      return [];
    });
    expect(missing).toEqual([]);
  });

  it('reads the AI suggestion count from its own key, not the auto-tagging maximum', () => {
    const ai = readConfigToml('settings/ai.toml') as {
      suggestions: { max_recommendations: { default: number } };
    };
    expect(defaultSettings.aiMaxRecommendations).toBe(ai.suggestions.max_recommendations.default);
    expect(SETTING_NUMBER_BOUNDS.aiMaxRecommendations).not.toBe(
      SETTING_NUMBER_BOUNDS.autoTaggingMaxTags,
    );
  });

  it('offers only the scopes each tool supports and reads a default scope only where selectable', () => {
    const meta = getSettingsFieldMeta();
    for (const [tool, capability] of Object.entries(TOOL_SCOPE_CAPABILITIES)) {
      const key = `${tool}DefaultScope` as keyof typeof meta;
      const [tab, section] = getSettingsConfigSections()[key].split('.');
      const config = (readConfigToml(`settings/${tab.replaceAll('_', '-')}.toml`) as Record<
        string,
        Record<string, unknown>
      >)[section];
      const values = meta[key].options?.map((option) => option.value);
      if (capability === 'both') {
        expect(values, tool).toEqual(['folder', 'all']);
        expect(defaultSettings[key], tool).toBe(config.default_scope);
      } else {
        expect(values, tool).toEqual([capability]);
        expect(defaultSettings[key], tool).toBe(capability);
        expect(config, tool).not.toHaveProperty('default_scope');
      }
    }
  });
});

describe('settings config layout', () => {
  const snake = (id: string) => id.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

  it('keeps each default in the config table of the Options tab and section that shows it', () => {
    const configSections = getSettingsConfigSections();
    const shownIn = new Map<keyof Settings, string>();
    for (const [categoryId, category] of Object.entries(getSettingsCategories())) {
      for (const section of category.sections) {
        for (const key of getSectionFields(section)) {
          shownIn.set(key, `${snake(categoryId)}.${snake(section.id)}`);
        }
      }
    }
    // Changed where they apply: the AI activity panel and Ask AI's web search button.
    shownIn.set('aiActivityRecording', 'ai.activity');
    shownIn.set('askAiWebSearch', 'ai.ask_ai');
    // Edited in their own Options panels.
    shownIn.set('askAiDisabledActions', 'ai.ask_ai');
    shownIn.set('agentBridgeDisabledActions', 'developers.agent_bridge');
    shownIn.set('managerMenuActions', 'behavior.manager_menus');
    // A tool limited to one scope has no setting to show and no default in its config.
    const fixedScopes = Object.entries(TOOL_SCOPE_CAPABILITIES)
      .filter(([, capability]) => capability !== 'both')
      .map(([tool]) => `${tool}DefaultScope`);

    const misplaced = Object.entries(configSections).flatMap(([key, configSection]) => {
      if (fixedScopes.includes(key)) return [];
      const expected = shownIn.get(key as keyof Settings) ?? 'no Options section';
      return configSection === expected ? [] : [`${key}: ${configSection}, shown in ${expected}`];
    });
    expect(misplaced).toEqual([]);
  });

  it('has one settings file per Options tab', () => {
    const files = readdirSync(path.join(appRoot, 'config/settings')).sort();
    const tabs = Object.keys(getSettingsCategories())
      .map((id) => `${snake(id).replaceAll('_', '-')}.toml`)
      .sort();
    expect(files).toEqual(tabs);
  });
});

describe('popup size', () => {
  it('clamps to the configured popupWidth and popupHeight bounds', () => {
    expect(POPUP_SIZE_LIMITS.width).toBe(SETTING_NUMBER_BOUNDS.popupWidth);
    expect(POPUP_SIZE_LIMITS.height).toBe(SETTING_NUMBER_BOUNDS.popupHeight);
  });

  it('opens popup.html at the configured default size and minimums', () => {
    const html = readFileSync(path.join(appRoot, 'src/entrypoints/popup/index.html'), 'utf8');
    const { popupWidth, popupHeight } = SETTING_NUMBER_BOUNDS;
    expect(html).toContain(`${POPUP_SIZE_CSS_VARS.width}: ${popupWidth.default}px;`);
    expect(html).toContain(`${POPUP_SIZE_CSS_VARS.height}: ${popupHeight.default}px;`);
    expect(html).toContain(`min-width: ${popupWidth.min}px;`);
    expect(html).toContain(`min-height: ${popupHeight.min}px;`);
  });
});
