/**
 * ToolsSidebar - Right sidebar panel for bookmark tools.
 * Matches the left folder sidebar design.
 * Features scope selection (current folder vs all bookmarks) based on tool capabilities.
 */

import {
  Link2Off,
  Sparkles,
  BarChart3,
  Wrench,
  Globe,
  Folder,
  FileText,
  Tags,
  FileOutput,
  Copy,
  Eraser,
  RefreshCw,
  ShieldAlert,
  Download,
  Upload,
} from 'lucide-react';
import { useState, useRef } from 'react';

type ToolSectionProps = {
  title: string;
  children: React.ReactNode;
};

function ToolSection({ title, children }: ToolSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

interface ToolsSidebarProps {
  currentFolderId: string | null;
  currentFolderName?: string;
}

export function ToolsSidebar({ currentFolderId, currentFolderName }: ToolsSidebarProps) {
  const { folders, refresh } = useBookmarks();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { settings: toolSettings, isLoading: toolSettingsLoading } = useSettings();
  const { value: dataDefaultExportFormat } = useSetting('dataDefaultExportFormat');
  const [exportFormat, setExportFormat] = useState(String(dataDefaultExportFormat));

  // AI Reorganization state
  const [reorgDialogOpen, setReorgDialogOpen] = useState(false);
  const [reorgPlan, setReorgPlan] = useState<ReorganizationPlan | null>(null);
  const [reorgLoading, setReorgLoading] = useState(false);
  const [reorgErrors, setReorgErrors] = useState<string[]>([]);

  const [duplicatesDialogOpen, setDuplicatesDialogOpen] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<ReturnType<
    typeof scanDuplicateBookmarks
  > | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateRemoving, setDuplicateRemoving] = useState(false);

  const [urlCleanerDialogOpen, setUrlCleanerDialogOpen] = useState(false);
  const [urlCleanerResult, setUrlCleanerResult] = useState<ReturnType<
    typeof previewCleanUrls
  > | null>(null);
  const [urlCleanerLoading, setUrlCleanerLoading] = useState(false);
  const [urlCleanerApplying, setUrlCleanerApplying] = useState(false);

  const [statisticsDialogOpen, setStatisticsDialogOpen] = useState(false);
  const [statisticsResult, setStatisticsResult] = useState<ReturnType<
    typeof collectBookmarkStatistics
  > | null>(null);
  const [deadLinksDialogOpen, setDeadLinksDialogOpen] = useState(false);
  const [deadLinksLoading, setDeadLinksLoading] = useState(false);
  const [deadLinksResult, setDeadLinksResult] = useState<DeadLinkScanResult | null>(null);
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataResult, setMetadataResult] = useState<MetadataFetchResult | null>(null);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const [privacyResult, setPrivacyResult] = useState<PrivacyScanResult | null>(null);

  const [aiContextLoading, setAiContextLoading] = useState(false);
  const [autoTaggingLoading, setAutoTaggingLoading] = useState(false);
  const [autoTaggingDialogOpen, setAutoTaggingDialogOpen] = useState(false);
  const [autoTaggingResult, setAutoTaggingResult] = useState<
    Awaited<ReturnType<typeof suggestBookmarkTags>>
  >([]);
  const [autoTaggingSaving, setAutoTaggingSaving] = useState(false);
  const [summarizerLoading, setSummarizerLoading] = useState(false);
  const [summarizerDialogOpen, setSummarizerDialogOpen] = useState(false);
  const [summarizerResult, setSummarizerResult] = useState<
    Awaited<ReturnType<typeof summarizeBookmarksWithAI>>
  >([]);
  const [summarizerSaving, setSummarizerSaving] = useState(false);

  const { value: duplicatesMatchStrategy } = useSetting('duplicatesMatchStrategy');
  const { value: duplicatesNormalizeWww } = useSetting('duplicatesNormalizeWww');
  const { value: duplicatesIgnoreProtocol } = useSetting('duplicatesIgnoreProtocol');
  const { value: duplicatesIgnoreTrailingSlash } = useSetting('duplicatesIgnoreTrailingSlash');
  const { value: duplicatesMaxGroups } = useSetting('duplicatesMaxGroups');
  const { value: duplicatesKeepRule } = useSetting('duplicatesKeepRule');
  const { value: urlCleanerRemoveHash } = useSetting('urlCleanerRemoveHash');
  const { value: urlCleanerSortQueryParams } = useSetting('urlCleanerSortQueryParams');
  const { value: urlCleanerDedupeQueryParams } = useSetting('urlCleanerDedupeQueryParams');
  const { value: urlCleanerPreserveParams } = useSetting('urlCleanerPreserveParams');
  const { value: urlCleanerRemoveParams } = useSetting('urlCleanerRemoveParams');
  const { value: statisticsIncludeDomains } = useSetting('statisticsIncludeDomains');
  const { value: statisticsIncludeFolders } = useSetting('statisticsIncludeFolders');
  const { value: statisticsIncludeDuplicates } = useSetting('statisticsIncludeDuplicates');
  const { value: statisticsIncludeProtocols } = useSetting('statisticsIncludeProtocols');
  const { value: statisticsTopN } = useSetting('statisticsTopN');
  const { value: deadLinksRequestTimeoutMs } = useSetting('deadLinksRequestTimeoutMs');
  const { value: deadLinksConcurrency } = useSetting('deadLinksConcurrency');
  const { value: deadLinksRetryCount } = useSetting('deadLinksRetryCount');
  const { value: deadLinksFollowRedirects } = useSetting('deadLinksFollowRedirects');
  const { value: deadLinksSuccessStatuses } = useSetting('deadLinksSuccessStatuses');
  const { value: metadataFetcherOverwriteTitles } = useSetting('metadataFetcherOverwriteTitles');
  const { value: metadataFetcherFetchFavicons } = useSetting('metadataFetcherFetchFavicons');
  const { value: metadataFetcherFetchDescriptions } = useSetting(
    'metadataFetcherFetchDescriptions',
  );
  const { value: metadataFetcherRequestTimeoutMs } = useSetting('metadataFetcherRequestTimeoutMs');
  const { value: metadataFetcherConcurrency } = useSetting('metadataFetcherConcurrency');
  const { value: privacyScannerScanTitles } = useSetting('privacyScannerScanTitles');
  const { value: privacyScannerScanQueryParams } = useSetting('privacyScannerScanQueryParams');
  const { value: privacyScannerScanFragments } = useSetting('privacyScannerScanFragments');
  const { value: privacyScannerSensitiveParams } = useSetting('privacyScannerSensitiveParams');
  const { value: privacyScannerEmailDetection } = useSetting('privacyScannerEmailDetection');
  const { value: privacyScannerUuidDetection } = useSetting('privacyScannerUuidDetection');
  const { value: aiContextPackerOutputFormat } = useSetting('aiContextPackerOutputFormat');
  const { value: aiContextPackerIncludeFolderPath } = useSetting(
    'aiContextPackerIncludeFolderPath',
  );
  const { value: aiContextPackerIncludeDates } = useSetting('aiContextPackerIncludeDates');
  const { value: aiContextPackerIncludeTags } = useSetting('aiContextPackerIncludeTags');
  const { value: aiContextPackerIncludeSummaries } = useSetting('aiContextPackerIncludeSummaries');
  const { value: aiContextPackerMaxItems } = useSetting('aiContextPackerMaxItems');
  const { value: aiContextPackerMaxDepth } = useSetting('aiContextPackerMaxDepth');
  const { value: aiContextPackerExcerptLength } = useSetting('aiContextPackerExcerptLength');
  const { value: autoTaggingMinTags } = useSetting('autoTaggingMinTags');
  const { value: autoTaggingMaxTags } = useSetting('autoTaggingMaxTags');
  const { value: autoTaggingTagStyle } = useSetting('autoTaggingTagStyle');
  const { value: autoTaggingMergeMode } = useSetting('autoTaggingMergeMode');
  const { value: autoTaggingDedupeTags } = useSetting('autoTaggingDedupeTags');
  const { value: summarizerSummaryLength } = useSetting('summarizerSummaryLength');
  const { value: summarizerIncludeDomainHint } = useSetting('summarizerIncludeDomainHint');
  const { value: reorganizationDryRunFirst } = useSetting('reorganizationDryRunFirst');
  const { value: reorganizationMinConfidence } = useSetting('reorganizationMinConfidence');
  const { value: reorganizationBatchSize } = useSetting('reorganizationBatchSize');
  const { value: summarizerMergeMode } = useSetting('summarizerMergeMode');

  // Get actual AI settings from storage
  const { value: aiEnabled } = useSetting('aiEnabled');
  const { value: aiProvider } = useSetting('aiProvider');
  const { value: aiModel } = useSetting('aiModel');

  const getTargetNodes = (scope: ToolScope) => getScopedNodes(folders, currentFolderId, scope);

  const handleDuplicates = async (scope: ToolScope) => {
    setDuplicateLoading(true);
    try {
      const result = scanDuplicateBookmarks(getTargetNodes(scope), {
        strategy: duplicatesMatchStrategy,
        normalizeWww: duplicatesNormalizeWww,
        ignoreProtocol: duplicatesIgnoreProtocol,
        ignoreTrailingSlash: duplicatesIgnoreTrailingSlash,
        maxGroups: duplicatesMaxGroups,
      });
      setDuplicateResult(result);
      setDuplicatesDialogOpen(true);
    } finally {
      setDuplicateLoading(false);
    }
  };

  const handleRemoveDuplicates = async () => {
    if (!duplicateResult) return;

    setDuplicateRemoving(true);
    try {
      const toDelete = duplicateResult.groups.flatMap((group) => {
        const sorted = [...group.items].sort((a, b) => {
          const dateA = a.node.dateAdded ?? 0;
          const dateB = b.node.dateAdded ?? 0;

          if (duplicatesKeepRule === 'newest') {
            return dateB - dateA;
          }

          if (duplicatesKeepRule === 'oldest') {
            return dateA - dateB;
          }

          return a.node.id.localeCompare(b.node.id);
        });

        return sorted.slice(1).map((item) => item.node.id);
      });

      await Promise.all(toDelete.map((id) => deleteBookmark(id)));
      await refresh();
      setDuplicatesDialogOpen(false);
      toast({
        title: t('toast_duplicatesRemoved'),
        description: t('toast_duplicatesRemovedDesc', String(toDelete.length)),
      });
    } catch (error) {
      toast({
        title: t('toast_toolFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setDuplicateRemoving(false);
    }
  };

  const handleUrlCleaner = async (scope: ToolScope) => {
    setUrlCleanerLoading(true);
    try {
      const result = previewCleanUrls(getTargetNodes(scope), {
        removeHash: urlCleanerRemoveHash,
        sortQueryParams: urlCleanerSortQueryParams,
        dedupeQueryParams: urlCleanerDedupeQueryParams,
        preserveParams: urlCleanerPreserveParams,
        removeParams: urlCleanerRemoveParams,
      });
      setUrlCleanerResult(result);
      setUrlCleanerDialogOpen(true);
    } finally {
      setUrlCleanerLoading(false);
    }
  };

  const handleApplyUrlCleaner = async () => {
    if (!urlCleanerResult) return;

    setUrlCleanerApplying(true);
    try {
      await Promise.all(
        urlCleanerResult.previews.map((preview) =>
          updateBookmark(preview.id, { url: preview.cleanedUrl }),
        ),
      );
      await refresh();
      setUrlCleanerDialogOpen(false);
      toast({
        title: t('toast_urlCleanerApplied'),
        description: t('toast_urlCleanerAppliedDesc', String(urlCleanerResult.previews.length)),
      });
    } catch (error) {
      toast({
        title: t('toast_toolFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setUrlCleanerApplying(false);
    }
  };

  const handleStatistics = (scope: ToolScope) => {
    const result = collectBookmarkStatistics(getTargetNodes(scope), {
      includeDomains: statisticsIncludeDomains,
      includeFolders: statisticsIncludeFolders,
      includeProtocols: statisticsIncludeProtocols,
      includeDuplicates: statisticsIncludeDuplicates,
      topN: statisticsTopN,
    });
    setStatisticsResult(result);
    setStatisticsDialogOpen(true);
  };

  const handleDeadLinks = async (scope: ToolScope) => {
    setDeadLinksLoading(true);
    try {
      const result = await scanDeadLinks(getTargetNodes(scope), {
        requestTimeoutMs: deadLinksRequestTimeoutMs,
        concurrency: deadLinksConcurrency,
        retryCount: deadLinksRetryCount,
        followRedirects: deadLinksFollowRedirects,
        successStatuses: deadLinksSuccessStatuses,
      });
      setDeadLinksResult(result);
      setDeadLinksDialogOpen(true);
    } catch (error) {
      toast({
        title: t('toast_toolFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setDeadLinksLoading(false);
    }
  };

  const handleMetadata = async (scope: ToolScope) => {
    setMetadataLoading(true);
    try {
      const result = await fetchBookmarkMetadata(getTargetNodes(scope), {
        overwriteTitles: metadataFetcherOverwriteTitles,
        fetchFavicons: metadataFetcherFetchFavicons,
        fetchDescriptions: metadataFetcherFetchDescriptions,
        requestTimeoutMs: metadataFetcherRequestTimeoutMs,
        concurrency: metadataFetcherConcurrency,
      });
      setMetadataResult(result);
      setMetadataDialogOpen(true);
    } catch (error) {
      toast({
        title: t('toast_toolFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setMetadataLoading(false);
    }
  };

  const handlePrivacy = (scope: ToolScope) => {
    const result = scanBookmarkPrivacy(getTargetNodes(scope), {
      scanTitles: privacyScannerScanTitles,
      scanQueryParams: privacyScannerScanQueryParams,
      scanFragments: privacyScannerScanFragments,
      sensitiveParams: privacyScannerSensitiveParams,
      emailDetection: privacyScannerEmailDetection,
      uuidDetection: privacyScannerUuidDetection,
    });
    setPrivacyResult(result);
    setPrivacyDialogOpen(true);
  };

  const handleApplyReorganization = async (
    plan: ReorganizationPlan,
    previewConfirmed: boolean,
  ) => {
    const result = await applyReorganizationPlan(plan, { previewConfirmed });
    if (!result.success) {
      setReorgErrors(result.errors);
      return;
    }

    await refresh();
    setReorgDialogOpen(false);
    toast({
      title: t('toast_reorganizeSuccess'),
      description: t('toast_reorganizeSuccessDesc'),
    });
  };

  const buildAISettings = async () =>
    buildAISettingsFromProvider(aiProvider as AIProvider, aiModel, aiEnabled);

  const handleAIContextPack = async (scope: ToolScope) => {
    setAiContextLoading(true);
    try {
      const targetNodes = getTargetNodes(scope);
      const metadata = await getStoredBookmarkMetadata(
        flattenBookmarks(targetNodes).map((bookmark) => bookmark.node.id),
      );
      const packed = buildAIContextPack(
        targetNodes,
        {
          format: aiContextPackerOutputFormat,
          includeFolderPath: aiContextPackerIncludeFolderPath,
          includeDates: aiContextPackerIncludeDates,
          includeTags: aiContextPackerIncludeTags,
          includeSummaries: aiContextPackerIncludeSummaries,
          maxItems: aiContextPackerMaxItems,
          maxDepth: aiContextPackerMaxDepth,
          excerptLength: aiContextPackerExcerptLength,
        },
        metadata,
      );

      const filename = `bookmark-context.${packed.format === 'xml' ? 'xml' : 'md'}`;
      const mimeType = packed.format === 'xml' ? 'application/xml' : 'text/markdown';
      downloadTextFile(packed.content, filename, mimeType);
      toast({
        title: t('toast_aiContextPacked'),
        description: t('toast_aiContextPackedDesc', String(packed.itemCount)),
      });
    } catch (error) {
      toast({
        title: t('toast_toolFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setAiContextLoading(false);
    }
  };

  const handleAutoTagging = async (scope: ToolScope) => {
    setAutoTaggingLoading(true);
    try {
      const settings = await buildAISettings();
      const result = await suggestBookmarkTags(getTargetNodes(scope), settings, {
        minTags: autoTaggingMinTags,
        maxTags: autoTaggingMaxTags,
        tagStyle: autoTaggingTagStyle,
      });
      setAutoTaggingResult(result);
      setAutoTaggingDialogOpen(true);
    } catch (error) {
      toast({
        title: t('toast_toolFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setAutoTaggingLoading(false);
    }
  };

  const handleSummarizer = async (scope: ToolScope) => {
    setSummarizerLoading(true);
    try {
      const settings = await buildAISettings();
      const result = await summarizeBookmarksWithAI(getTargetNodes(scope), settings, {
        summaryLength: summarizerSummaryLength,
        includeDomainHint: summarizerIncludeDomainHint,
      });
      setSummarizerResult(result);
      setSummarizerDialogOpen(true);
    } catch (error) {
      toast({
        title: t('toast_toolFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setSummarizerLoading(false);
    }
  };

  const handleSaveAutoTags = async () => {
    setAutoTaggingSaving(true);
    try {
      await mergeStoredBookmarkMetadata(
        Object.fromEntries(
          // Only apply suggestions that map back to a reviewed bookmark in the request.
          autoTaggingResult
            .filter((item) => item.url)
            .map((item) => [item.bookmarkId, { tags: item.tags }]),
        ),
        {
          tagMode: autoTaggingMergeMode,
          summaryMode: 'replace',
          dedupeTags: autoTaggingDedupeTags,
        },
      );
      setAutoTaggingDialogOpen(false);
      setAutoTaggingResult([]);
      toast({
        title: t('bookmarks_metadataSaved'),
        description: t('bookmarks_metadataGeneratedTagsSaved'),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: t('bookmarks_metadataSaveFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setAutoTaggingSaving(false);
    }
  };

  const handleSaveSummaries = async () => {
    setSummarizerSaving(true);
    try {
      await mergeStoredBookmarkMetadata(
        Object.fromEntries(
          summarizerResult
            .filter((item) => item.url)
            .map((item) => [item.bookmarkId, { summary: item.summary }]),
        ),
        {
          tagMode: 'replace',
          summaryMode: summarizerMergeMode,
          dedupeTags: true,
        },
      );
      setSummarizerDialogOpen(false);
      setSummarizerResult([]);
      toast({
        title: t('bookmarks_metadataSaved'),
        description: t('bookmarks_metadataGeneratedSummariesSaved'),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: t('bookmarks_metadataSaveFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setSummarizerSaving(false);
    }
  };

  // Handlers (Placeholders)
  const handleToolAction = async (toolName: string, scope: ToolScope) => {
    if (toolName === 'duplicates') {
      await handleDuplicates(scope);
      return;
    }

    if (toolName === 'clean-urls') {
      await handleUrlCleaner(scope);
      return;
    }

    if (toolName === 'stats') {
      handleStatistics(scope);
      return;
    }

    if (toolName === 'dead-links') {
      await handleDeadLinks(scope);
      return;
    }

    if (toolName === 'metadata') {
      await handleMetadata(scope);
      return;
    }

    if (toolName === 'privacy') {
      handlePrivacy(scope);
      return;
    }

    if (toolName === 'ai-pack') {
      await handleAIContextPack(scope);
      return;
    }

    if (toolName === 'auto-tag') {
      await handleAutoTagging(scope);
      return;
    }

    if (toolName === 'summarize') {
      await handleSummarizer(scope);
      return;
    }

    if (toolName === 'reorganize') {
      setReorgDialogOpen(true);
      setReorgLoading(true);
      setReorgPlan(null);
      setReorgErrors([]);

      try {
        const targetFolders = getTargetNodes(scope);
        const aiSettings = await buildAISettings();
        const plan = await generateReorganizationPlan(targetFolders, aiSettings, {
          dryRunFirst: reorganizationDryRunFirst,
          minConfidence: reorganizationMinConfidence,
          batchSize: reorganizationBatchSize,
        });
        setReorgPlan(plan);
        if (!reorganizationDryRunFirst) {
          await handleApplyReorganization(plan, false);
        }
      } catch (err) {
        setReorgErrors([err instanceof Error ? err.message : t('ai_reorgAnalyzeFailed')]);
      } finally {
        setReorgLoading(false);
      }
    }
  };

  // Export handler
  const handleExport = async () => {
    if (!folders || folders.length === 0) return;
    setIsExporting(true);

    try {
      const format = exportFormats[exportFormat];
      // Create a virtual root node for export
      const rootNode = {
        id: '0',
        title: 'Bookmarks',
        children: folders,
      };
      const content = exportBookmarks(rootNode, format, { includeDates: true });
      const filename = generateFilename(currentFolderName || 'all', format);
      downloadExport(content, filename, format.mimeType);

      // Count items for toast
      let count = 0;
      const countItems = (nodes: typeof folders) => {
        for (const node of nodes) {
          if (node.url) count++;
          if (node.children) countItems(node.children);
        }
      };
      countItems(folders);

      toast({
        title: t('toast_exportSuccess'),
        description: t('toast_exportSuccessDesc', [String(count), getFormatName(format)]),
      });
    } catch (err) {
      toast({
        title: t('toast_exportFailed'),
        description: err instanceof Error ? err.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Import handler
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    try {
      const format = detectFormat(file.name);
      if (!format) {
        throw new Error(t('error_unsupportedFileFormat'));
      }

      const content = await readFile(file);
      const { bookmarks: parsed } = parseBookmarks(content, format);

      // Import to Bookmarks Bar (folder ID "1") or current folder
      const targetId = currentFolderId || '1';
      const { created, errors } = await importBookmarks(parsed, targetId);

      if (errors.length > 0) {
        console.warn('Import errors:', errors);
      }

      await refresh();

      toast({
        title: t('toast_importSuccess'),
        description: t('toast_importSuccessDesc', String(created)),
      });
    } catch (err) {
      toast({
        title: t('toast_importFailed'),
        description: err instanceof Error ? err.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b flex-shrink-0">
        <h2 className="text-sm font-semibold px-2 flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          {t('tools_title')}
        </h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-6">
          {/* AI & Intelligence */}
          {!toolSettingsLoading &&
            (toolSettings.aiContextPackerEnabled ||
              toolSettings.autoTaggingEnabled ||
              toolSettings.summarizerEnabled ||
              toolSettings.reorganizationEnabled) && (
              <ToolSection title={t('tools_category_ai')}>
                {toolSettings.aiContextPackerEnabled && (
                  <ToolCard
                    icon={<FileText className="h-4 w-4 text-indigo-500" />}
                    title={t('tools_exportAI')}
                    description={t('tools_exportAIDesc')}
                    buttonLabel={t('action_export')}
                    onClick={(scope) => handleToolAction('ai-pack', scope)}
                    scopeCapability="both"
                    defaultScope={toolSettings.aiContextPackerDefaultScope}
                    currentFolderName={currentFolderName}
                    isLoading={aiContextLoading}
                  />
                )}

                {toolSettings.autoTaggingEnabled && (
                  <ToolCard
                    icon={<Tags className="h-4 w-4 text-indigo-500" />}
                    title={t('tools_autoTagging')}
                    description={t('tools_autoTaggingDesc')}
                    buttonLabel={t('action_analyze')}
                    onClick={(scope) => handleToolAction('auto-tag', scope)}
                    scopeCapability="folder"
                    defaultScope={toolSettings.autoTaggingDefaultScope}
                    currentFolderName={currentFolderName}
                    isLoading={autoTaggingLoading}
                  />
                )}

                {toolSettings.summarizerEnabled && (
                  <ToolCard
                    icon={<FileOutput className="h-4 w-4 text-indigo-500" />}
                    title={t('tools_summarizer')}
                    description={t('tools_summarizerDesc')}
                    buttonLabel={t('action_analyze')}
                    onClick={(scope) => handleToolAction('summarize', scope)}
                    scopeCapability="folder"
                    defaultScope={toolSettings.summarizerDefaultScope}
                    currentFolderName={currentFolderName}
                    isLoading={summarizerLoading}
                  />
                )}

                {toolSettings.reorganizationEnabled && (
                  <ToolCard
                    icon={<Sparkles className="h-4 w-4 text-purple-500" />}
                    title={t('tools_aiReorganize')}
                    description={
                      t('tools_aiReorganizeDesc')
                    }
                    buttonLabel={
                      reorganizationDryRunFirst
                        ? t('action_analyze')
                        : t('action_applyChanges')
                    }
                    onClick={(scope) => handleToolAction('reorganize', scope)}
                    scopeCapability="both"
                    defaultScope={toolSettings.reorganizationDefaultScope}
                    currentFolderName={currentFolderName}
                    isLoading={reorgLoading}
                  />
                )}
              </ToolSection>
            )}

          {/* Maintenance */}
          {!toolSettingsLoading &&
            (toolSettings.duplicatesEnabled ||
              toolSettings.urlCleanerEnabled ||
              toolSettings.deadLinksEnabled) && (
              <ToolSection title={t('tools_category_maintenance')}>
                {toolSettings.duplicatesEnabled && (
                  <ToolCard
                    icon={<Copy className="h-4 w-4 text-orange-500" />}
                    title={t('tools_findDuplicates')}
                    description={t('tools_findDuplicatesDesc')}
                    buttonLabel={t('action_scan')}
                    onClick={(scope) => handleToolAction('duplicates', scope)}
                    scopeCapability="all"
                    defaultScope={toolSettings.duplicatesDefaultScope}
                    currentFolderName={currentFolderName}
                    isLoading={duplicateLoading}
                  />
                )}

                {toolSettings.urlCleanerEnabled && (
                  <ToolCard
                    icon={<Eraser className="h-4 w-4 text-orange-500" />}
                    title={t('tools_cleanUrls')}
                    description={t('tools_cleanUrlsDesc')}
                    buttonLabel={t('action_clean')}
                    onClick={(scope) => handleToolAction('clean-urls', scope)}
                    scopeCapability="both"
                    defaultScope={toolSettings.urlCleanerDefaultScope}
                    currentFolderName={currentFolderName}
                    isLoading={urlCleanerLoading}
                  />
                )}

                {toolSettings.deadLinksEnabled && (
                  <ToolCard
                    icon={<Link2Off className="h-4 w-4 text-orange-500" />}
                    title={t('tools_checkDeadLinks')}
                    description={t('tools_checkDeadLinksDesc')}
                    buttonLabel={t('action_scan')}
                    onClick={(scope) => handleToolAction('dead-links', scope)}
                    scopeCapability="both"
                    defaultScope={toolSettings.deadLinksDefaultScope}
                    currentFolderName={currentFolderName}
                    isLoading={deadLinksLoading}
                  />
                )}
              </ToolSection>
            )}

          {/* Metadata & Content */}
          {!toolSettingsLoading && toolSettings.metadataFetcherEnabled && (
            <ToolSection title={t('tools_category_metadata')}>
              <ToolCard
                icon={<RefreshCw className="h-4 w-4 text-blue-500" />}
                title={t('tools_metadataFetcher')}
                description={t('tools_metadataFetcherDesc')}
                buttonLabel={t('action_scan')}
                onClick={(scope) => handleToolAction('metadata', scope)}
                scopeCapability="both"
                defaultScope={toolSettings.metadataFetcherDefaultScope}
                currentFolderName={currentFolderName}
                isLoading={metadataLoading}
              />
            </ToolSection>
          )}

          {/* Security */}
          {!toolSettingsLoading && toolSettings.privacyScannerEnabled && (
            <ToolSection title={t('tools_category_security')}>
              <ToolCard
                icon={<ShieldAlert className="h-4 w-4 text-red-500" />}
                title={t('tools_privacyScanner')}
                description={t('tools_privacyScannerDesc')}
                buttonLabel={t('action_scan')}
                onClick={(scope) => handleToolAction('privacy', scope)}
                scopeCapability="all"
                defaultScope={toolSettings.privacyScannerDefaultScope}
                currentFolderName={currentFolderName}
                isLoading={false}
              />
            </ToolSection>
          )}

          {/* Analytics */}
          {!toolSettingsLoading && toolSettings.statisticsEnabled && (
            <ToolSection title={t('tools_category_analytics')}>
              <ToolCard
                icon={<BarChart3 className="h-4 w-4 text-green-500" />}
                title={t('tools_statistics')}
                description={t('tools_statisticsDesc')}
                buttonLabel={t('action_view')}
                onClick={(scope) => handleToolAction('stats', scope)}
                scopeCapability="both"
                defaultScope={toolSettings.statisticsDefaultScope}
                currentFolderName={currentFolderName}
              />
            </ToolSection>
          )}

          {/* Data (Export/Import) */}
          <ToolSection title={t('tools_category_data')}>
            {/* Export Tool */}
            <div className="p-3 rounded-lg border bg-card space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 p-1.5 rounded-md bg-muted">
                  <Download className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate">
                      {t('tools_export')}
                    </h4>
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                      <Folder className="h-3 w-3" />
                      <span>/</span>
                      <Globe className="h-3 w-3" />
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {t('tools_exportDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder={t('tools_exportFormat')} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(exportFormats).map(([key, format]) => (
                      <SelectItem key={key} value={key}>
                        {getFormatName(format)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExport}
                  disabled={isExporting || folders.length === 0}
                  className="h-8 text-xs"
                >
                  {isExporting ? t('tools_exporting') : t('action_export')}
                </Button>
              </div>
            </div>

            {/* Import Tool */}
            <div className="p-3 rounded-lg border bg-card space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 p-1.5 rounded-md bg-muted">
                  <Upload className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate">
                      {t('tools_import')}
                    </h4>
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      <Folder className="h-3 w-3" />
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {t('tools_importDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={getAcceptedFileTypes()}
                  onChange={handleImport}
                  className="hidden"
                  id="bookmark-import-input"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="h-8 text-xs w-full"
                >
                  {isImporting ? t('tools_importing') : t('action_import')}
                </Button>
              </div>
            </div>
          </ToolSection>
        </div>
      </div>

      {/* AI Reorganization Dialog */}
      <ReorganizationDialog
        open={reorgDialogOpen}
        onOpenChange={setReorgDialogOpen}
        plan={reorgPlan}
        isLoading={reorgLoading}
        errors={reorgErrors}
        onApply={async () => {
          if (reorgPlan) {
            await handleApplyReorganization(reorgPlan, true);
          }
        }}
        onCancel={() => setReorgDialogOpen(false)}
      />

      <ToolResultsDialog
        open={duplicatesDialogOpen}
        onOpenChange={setDuplicatesDialogOpen}
        title={t('tools_findDuplicates')}
        description={t('tools_duplicatesDialogDesc', [
          String(duplicateResult?.groups.length ?? 0),
          String(duplicateResult?.scannedBookmarks ?? 0),
        ])}
      >
        <DuplicateResultsView
          result={duplicateResult}
          isRemoving={duplicateRemoving}
          onClose={() => setDuplicatesDialogOpen(false)}
          onConfirm={handleRemoveDuplicates}
        />
      </ToolResultsDialog>

      <ToolResultsDialog
        open={urlCleanerDialogOpen}
        onOpenChange={setUrlCleanerDialogOpen}
        title={t('tools_cleanUrls')}
        description={t('tools_urlCleanerDialogDesc', String(urlCleanerResult?.previews.length ?? 0))}
      >
        <UrlCleanerResultsView
          result={urlCleanerResult}
          isApplying={urlCleanerApplying}
          onClose={() => setUrlCleanerDialogOpen(false)}
          onConfirm={handleApplyUrlCleaner}
        />
      </ToolResultsDialog>

      <ToolResultsDialog
        open={statisticsDialogOpen}
        onOpenChange={setStatisticsDialogOpen}
        title={t('tools_statistics')}
        description={t('tools_statisticsDialogDesc')}
      >
        <StatisticsResultsView result={statisticsResult} />
      </ToolResultsDialog>

      <ToolResultsDialog
        open={deadLinksDialogOpen}
        onOpenChange={setDeadLinksDialogOpen}
        title={t('tools_checkDeadLinks')}
        description={
          t('tools_deadLinksDialogDesc')
        }
      >
        <DeadLinkResultsView result={deadLinksResult} />
      </ToolResultsDialog>

      <ToolResultsDialog
        open={metadataDialogOpen}
        onOpenChange={setMetadataDialogOpen}
        title={t('tools_metadataFetcher')}
        description={
          t('tools_metadataDialogDesc')
        }
      >
        <MetadataResultsView result={metadataResult} />
      </ToolResultsDialog>

      <ToolResultsDialog
        open={privacyDialogOpen}
        onOpenChange={setPrivacyDialogOpen}
        title={t('tools_privacyScanner')}
        description={
          t('tools_privacyDialogDesc')
        }
      >
        <PrivacyResultsView result={privacyResult} />
      </ToolResultsDialog>

      <ToolResultsDialog
        open={autoTaggingDialogOpen}
        onOpenChange={setAutoTaggingDialogOpen}
        title={t('tools_autoTagging')}
        description={
          t('tools_autoTaggingDialogDesc')
        }
      >
        <div className="space-y-4">
          {autoTaggingResult.length ? (
            autoTaggingResult.map((item) => (
              <div key={item.bookmarkId} className="rounded-lg border p-3 space-y-2">
                <div className="font-medium text-sm">{item.title}</div>
                <div className="text-xs text-muted-foreground break-all">{item.url}</div>
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <Badge key={`${item.bookmarkId}-${tag}`} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">{item.reason}</div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('state_noAiResults')}
            </div>
          )}
          {autoTaggingResult.length ? (
            <div className="flex justify-end">
              <Button onClick={handleSaveAutoTags} disabled={autoTaggingSaving}>
                {autoTaggingSaving ? t('action_saving') : t('bookmarks_metadataSaveTags')}
              </Button>
            </div>
          ) : null}
        </div>
      </ToolResultsDialog>

      <ToolResultsDialog
        open={summarizerDialogOpen}
        onOpenChange={setSummarizerDialogOpen}
        title={t('tools_summarizer')}
        description={t('tools_summarizerDialogDesc')}
      >
        <div className="space-y-4">
          {summarizerResult.length ? (
            summarizerResult.map((item) => (
              <div key={item.bookmarkId} className="rounded-lg border p-3 space-y-2">
                <div className="font-medium text-sm">{item.title}</div>
                <div className="text-xs text-muted-foreground break-all">{item.url}</div>
                <div className="rounded-md bg-muted/40 p-2 text-sm">{item.summary}</div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('state_noAiResults')}
            </div>
          )}
          {summarizerResult.length ? (
            <div className="flex justify-end">
              <Button onClick={handleSaveSummaries} disabled={summarizerSaving}>
                {summarizerSaving ? t('action_saving') : t('bookmarks_metadataSaveSummaries')}
              </Button>
            </div>
          ) : null}
        </div>
      </ToolResultsDialog>
    </div>
  );
}
