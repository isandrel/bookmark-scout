import { describe, expect, it } from 'vitest';
import {
  getSectionTools,
  getToolDefaultScope,
  getToolStartScope,
  TOOL_DEFINITIONS,
  TOOL_SECTIONS,
} from '@/components/bookmarks/tools/tool-definitions';
import { defaultSettings, type Settings } from '@/lib/settings-schema';
import { readConfigToml } from '../config-files';

const config = readConfigToml('ui/tools-sidebar.toml') as {
  sections: string[];
  tools: string[];
  top_level_scope: string;
};

/** Every tool turned on, so each section lists all of its tools. */
const allOn = Object.fromEntries(
  Object.values(TOOL_DEFINITIONS).map((tool) => [tool.enabledSetting, true]),
) as Partial<Settings>;
const settings = { ...defaultSettings, ...allOn } as Settings;

describe('Tools sidebar order', () => {
  it('shows the sections and tools in the configured order, cleaning up first and AI last', () => {
    expect(TOOL_SECTIONS.map((section) => section.id)).toEqual(config.sections);
    const shown = TOOL_SECTIONS.flatMap((section) =>
      getSectionTools(settings, section.id).map((tool) => tool.id),
    );
    expect(shown).toEqual(config.tools);
    expect(shown[0]).toBe('duplicates');
    expect(TOOL_SECTIONS.at(-1)?.id).toBe('ai');
  });

  it('leaves out tools that are turned off', () => {
    const off = { ...settings, deadLinksEnabled: false };
    expect(getSectionTools(off, 'maintenance').map((tool) => tool.id)).not.toContain('deadLinks');
  });
});

describe('Tools sidebar scope', () => {
  it('starts on all bookmarks at the top level and on the Default Scope setting in a folder', () => {
    const deadLinks = TOOL_DEFINITIONS.deadLinks;
    const folderFirst = { ...settings, deadLinksDefaultScope: 'folder' } as Settings;
    expect(config.top_level_scope).toBe('all');
    expect(getToolDefaultScope(folderFirst, deadLinks, null)).toBe('all');
    expect(getToolDefaultScope(folderFirst, deadLinks, '1')).toBe('folder');
    const allFirst = { ...settings, deadLinksDefaultScope: 'all' } as Settings;
    expect(getToolDefaultScope(allFirst, deadLinks, '1')).toBe('all');
    expect(getToolStartScope('folder', null)).toBe('all');
  });
});
