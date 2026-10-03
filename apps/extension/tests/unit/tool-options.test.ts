import { describe, expect, it } from 'vitest';
import { defaultSettings, TOOL_SCOPE_CAPABILITIES } from '@/lib/settings-schema';
import { getToolOptions, getToolScopeCapability, TOOL_IDS } from '@/services/tool-options';

describe('tool options', () => {
  it('has options and a scope capability for every tool the settings define', () => {
    expect([...TOOL_IDS].sort()).toEqual(Object.keys(TOOL_SCOPE_CAPABILITIES).sort());
    const options = getToolOptions(defaultSettings);
    expect(Object.keys(options).sort()).toEqual([...TOOL_IDS].sort());
    for (const tool of TOOL_IDS) {
      expect(getToolScopeCapability(tool)).toBe(TOOL_SCOPE_CAPABILITIES[tool]);
    }
  });

  it('derives each tool’s options from its settings only', () => {
    const settings = {
      ...defaultSettings,
      autoTaggingMinTags: 1,
      autoTaggingMaxTags: 7,
      aiReadPageContent: true,
      siteIconsMaxIconKb: 3,
      metadataFetcherRequestTimeoutMs: 1234,
      duplicatesKeepRule: 'newest' as const,
    };
    const options = getToolOptions(settings);
    expect(options.autoTagging).toEqual({
      minTags: 1,
      maxTags: 7,
      tagStyle: defaultSettings.autoTaggingTagStyle,
      readPages: true,
    });
    expect(options.summarizer.readPages).toBe(true);
    // Site icons share the Metadata Fetcher's network limits and size the cap in bytes.
    expect(options.siteIcons).toMatchObject({ maxIconBytes: 3 * 1024, requestTimeoutMs: 1234 });
    expect(options.metadataFetcher.requestTimeoutMs).toBe(1234);
    expect(options.duplicates.keepRule).toBe('newest');
    // Pure: the same settings always give the same options.
    expect(getToolOptions(settings)).toEqual(options);
  });
});
