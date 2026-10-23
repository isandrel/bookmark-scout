import { describe, expect, it } from 'vitest';
import {
  EXPORT_DEFAULT_SCOPE,
  getSectionTools,
  getToolDefaultScope,
  getToolStartScope,
  getToolsSidebarOrder,
  TOOL_DEFINITIONS,
  TOOL_SECTIONS,
} from '@/components/bookmarks/tools/tool-definitions';
import { t } from '@/hooks/use-i18n';
import {
  defaultSettings,
  getSettingsCategories,
  getSettingsFieldMeta,
  type Settings,
  settingsSchema,
} from '@/lib/settings-schema';
import { TOOL_ORDER_IDS } from '@/lib/tools-sidebar-config';
import { getToolScopeCapability } from '@/services/tool-options';
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

  it('shows the tools Sidebar Tools lists, in its order inside their own sections', () => {
    // Empty (the default) is every tool in the configured order.
    expect(defaultSettings.toolsSidebarOrder).toEqual([]);
    expect(getToolsSidebarOrder([]).map((tool) => tool.id)).toEqual(config.tools);
    expect(TOOL_ORDER_IDS).toEqual(config.tools);

    const arranged = {
      ...settings,
      toolsSidebarOrder: ['summarizer', 'urlCleaner', 'duplicates', 'autoTagging', 'unknownTool'],
    } as Settings;
    expect(getSectionTools(arranged, 'maintenance').map((tool) => tool.id)).toEqual([
      'urlCleaner',
      'duplicates',
    ]);
    expect(getSectionTools(arranged, 'ai').map((tool) => tool.id)).toEqual([
      'summarizer',
      'autoTagging',
    ]);
    // A tool the list leaves out is hidden; a tool turned off stays hidden even when listed.
    expect(getSectionTools(arranged, 'metadata')).toEqual([]);
    const listedButOff = { ...arranged, urlCleanerEnabled: false } as Settings;
    expect(getSectionTools(listedButOff, 'maintenance').map((tool) => tool.id)).toEqual([
      'duplicates',
    ]);
  });

  it('names each tool in Sidebar Tools by the Options section its Enable switch heads', () => {
    // Options lists the tools by those sections, so it never loads the tool table.
    const sections = Object.values(getSettingsCategories()).flatMap(
      (category) => category.sections,
    );
    for (const tool of Object.values(TOOL_DEFINITIONS)) {
      const section = sections.find((candidate) => candidate.toggle === tool.enabledSetting);
      expect(section?.label, tool.id).toBe(t(tool.titleKey));
    }
  });

  it('holds every tool id in Sidebar Tools, and offers each tab as the Start Tab', () => {
    const meta = getSettingsFieldMeta();
    expect(meta.toolsSidebarOrder.maxItems).toBe(Object.keys(TOOL_DEFINITIONS).length);
    const longest = Math.max(...Object.keys(TOOL_DEFINITIONS).map((id) => id.length));
    expect(meta.toolsSidebarOrder.maxLength).toBe(longest);
    expect(settingsSchema.shape.toolsSidebarOrder.safeParse(config.tools).success).toBe(true);

    const tabs = meta.toolsSidebarDefaultTab.options?.map((option) => option.value) ?? [];
    expect(new Set(tabs)).toEqual(new Set(['all', ...config.sections, 'data']));
    expect(defaultSettings.toolsSidebarDefaultTab).toBe('maintenance');
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

  it('starts every tool that can choose on all bookmarks by default, except AI reorganization, page text, and covers, which download or send each page', () => {
    const tools = Object.values(TOOL_DEFINITIONS).filter(
      (tool) => getToolScopeCapability(tool.id) === 'both',
    );
    const folderFirst = tools
      .filter((tool) => getToolDefaultScope(defaultSettings, tool, '1') === 'folder')
      .map((tool) => tool.id);
    expect(folderFirst).toEqual(['reorganization', 'pageText', 'covers']);
    expect(EXPORT_DEFAULT_SCOPE).toBe('all');
  });
});
