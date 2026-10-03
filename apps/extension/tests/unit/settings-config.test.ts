import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '@/hooks/use-i18n';
import { POPUP_SIZE_LIMITS } from '@/hooks/use-popup-size';
import {
  defaultSettings,
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
      readConfigToml('settings/search.toml').debounce_ms as object,
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

  it('reads the AI suggestion count from its own key, not the auto-tagging maximum', () => {
    const ai = readConfigToml('settings/ai.toml') as { max_recommendations: { default: number } };
    expect(defaultSettings.aiMaxRecommendations).toBe(ai.max_recommendations.default);
    expect(SETTING_NUMBER_BOUNDS.aiMaxRecommendations).not.toBe(
      SETTING_NUMBER_BOUNDS.autoTaggingMaxTags,
    );
  });

  it('offers only the scopes each tool supports and reads a default scope only where selectable', () => {
    const meta = getSettingsFieldMeta();
    for (const [tool, capability] of Object.entries(TOOL_SCOPE_CAPABILITIES)) {
      const key = `${tool}DefaultScope` as keyof typeof meta;
      const file = `settings/tools/${tool.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.toml`;
      const config = readConfigToml(file);
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

describe('popup size', () => {
  it('clamps to the configured popupWidth and popupHeight bounds', () => {
    expect(POPUP_SIZE_LIMITS.width).toBe(SETTING_NUMBER_BOUNDS.popupWidth);
    expect(POPUP_SIZE_LIMITS.height).toBe(SETTING_NUMBER_BOUNDS.popupHeight);
  });

  it('opens popup.html at the configured default size and minimums', () => {
    const html = readFileSync(path.join(appRoot, 'src/entrypoints/popup/index.html'), 'utf8');
    const { popupWidth, popupHeight } = SETTING_NUMBER_BOUNDS;
    expect(html).toContain(`--popup-width: ${popupWidth.default}px;`);
    expect(html).toContain(`--popup-height: ${popupHeight.default}px;`);
    expect(html).toContain(`min-width: ${popupWidth.min}px;`);
    expect(html).toContain(`min-height: ${popupHeight.min}px;`);
  });
});
