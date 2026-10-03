/**
 * The options each Tools sidebar tool runs with, derived from the settings in one table, so the
 * sidebar, tests, and future callers never rebuild them field by field.
 */

export type ToolId = keyof typeof TOOL_SCOPE_CAPABILITIES;

/** Which scopes a tool can run on: one of them, or `both`. */
export type ToolScopeCapability = (typeof TOOL_SCOPE_CAPABILITIES)[ToolId];

/** Reorganization settings the plan carries; folder limits come from the prompt settings. */
export type ReorganizationToolOptions = Pick<
  ReorganizationConfig,
  'dryRunFirst' | 'minConfidence' | 'batchSize'
>;

export type ToolOptions = {
  aiContextPacker: AIContextPackOptions;
  autoTagging: AutoTaggingOptions;
  summarizer: SummarizerOptions;
  reorganization: ReorganizationToolOptions;
  duplicates: DuplicateScanOptions;
  urlCleaner: UrlCleanerOptions;
  deadLinks: DeadLinkOptions;
  metadataFetcher: MetadataOptions;
  siteIcons: SiteIconRefreshOptions;
  privacyScanner: PrivacyScanOptions;
  statistics: StatisticsOptions;
};

const TOOL_OPTIONS: { [Tool in ToolId]: (settings: Settings) => ToolOptions[Tool] } = {
  aiContextPacker: (settings) => ({
    format: settings.aiContextPackerOutputFormat,
    includeFolderPath: settings.aiContextPackerIncludeFolderPath,
    includeDates: settings.aiContextPackerIncludeDates,
    includeTags: settings.aiContextPackerIncludeTags,
    includeSummaries: settings.aiContextPackerIncludeSummaries,
    maxItems: settings.aiContextPackerMaxItems,
    maxDepth: settings.aiContextPackerMaxDepth,
    excerptLength: settings.aiContextPackerExcerptLength,
  }),
  autoTagging: (settings) => ({
    minTags: settings.autoTaggingMinTags,
    maxTags: settings.autoTaggingMaxTags,
    tagStyle: settings.autoTaggingTagStyle,
    readPages: settings.aiReadPageContent,
  }),
  summarizer: (settings) => ({
    summaryLength: settings.summarizerSummaryLength,
    includeDomainHint: settings.summarizerIncludeDomainHint,
    readPages: settings.aiReadPageContent,
  }),
  reorganization: (settings) => ({
    dryRunFirst: settings.reorganizationDryRunFirst,
    minConfidence: settings.reorganizationMinConfidence,
    batchSize: settings.reorganizationBatchSize,
  }),
  duplicates: (settings) => ({
    strategy: settings.duplicatesMatchStrategy,
    normalizeWww: settings.duplicatesNormalizeWww,
    ignoreProtocol: settings.duplicatesIgnoreProtocol,
    ignoreTrailingSlash: settings.duplicatesIgnoreTrailingSlash,
    maxGroups: settings.duplicatesMaxGroups,
    keepRule: settings.duplicatesKeepRule,
  }),
  urlCleaner: (settings) => ({
    removeHash: settings.urlCleanerRemoveHash,
    sortQueryParams: settings.urlCleanerSortQueryParams,
    dedupeQueryParams: settings.urlCleanerDedupeQueryParams,
    preserveParams: settings.urlCleanerPreserveParams,
    removeParams: settings.urlCleanerRemoveParams,
  }),
  deadLinks: (settings) => ({
    requestTimeoutMs: settings.deadLinksRequestTimeoutMs,
    concurrency: settings.deadLinksConcurrency,
    retryCount: settings.deadLinksRetryCount,
    followRedirects: settings.deadLinksFollowRedirects,
    successStatuses: settings.deadLinksSuccessStatuses,
  }),
  metadataFetcher: (settings) => ({
    overwriteTitles: settings.metadataFetcherOverwriteTitles,
    fetchDescriptions: settings.metadataFetcherFetchDescriptions,
    requestTimeoutMs: settings.metadataFetcherRequestTimeoutMs,
    concurrency: settings.metadataFetcherConcurrency,
  }),
  siteIcons: (settings) => ({
    preferredSize: settings.siteIconsPreferredSize,
    maxIconBytes: settings.siteIconsMaxIconKb * BYTES_PER_KB,
    // Icon refreshes share the Metadata Fetcher's network limits.
    requestTimeoutMs: settings.metadataFetcherRequestTimeoutMs,
    concurrency: settings.metadataFetcherConcurrency,
  }),
  privacyScanner: (settings) => ({
    scanTitles: settings.privacyScannerScanTitles,
    scanQueryParams: settings.privacyScannerScanQueryParams,
    scanFragments: settings.privacyScannerScanFragments,
    sensitiveParams: settings.privacyScannerSensitiveParams,
    emailDetection: settings.privacyScannerEmailDetection,
    uuidDetection: settings.privacyScannerUuidDetection,
  }),
  statistics: (settings) => ({
    includeDomains: settings.statisticsIncludeDomains,
    includeFolders: settings.statisticsIncludeFolders,
    includeProtocols: settings.statisticsIncludeProtocols,
    includeDuplicates: settings.statisticsIncludeDuplicates,
    includeDepthBreakdown: settings.statisticsIncludeDepthBreakdown,
    topN: settings.statisticsTopN,
  }),
};

export const TOOL_IDS = Object.keys(TOOL_OPTIONS) as ToolId[];

/** Every tool's run options for these settings. Pure: reads nothing else. */
export function getToolOptions(settings: Settings): ToolOptions {
  return Object.fromEntries(
    TOOL_IDS.map((tool) => [tool, TOOL_OPTIONS[tool](settings)]),
  ) as ToolOptions;
}

/** The scopes a tool supports, from the settings schema's capability table. */
export function getToolScopeCapability(tool: ToolId): ToolScopeCapability {
  return TOOL_SCOPE_CAPABILITIES[tool];
}
