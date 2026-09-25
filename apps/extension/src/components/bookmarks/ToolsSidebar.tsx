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
import { useEffect, useState, useRef } from 'react';
import type { BookmarkTreeNode } from '@/types';

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

type PendingNetworkTool = { tool: 'dead-links' | 'metadata'; scope: ToolScope };

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
  const [exportFormat, setExportFormat] = useState<string>(dataDefaultExportFormat);
  // Settings load asynchronously and can change live; follow the saved default format.
  useEffect(() => {
    setExportFormat(dataDefaultExportFormat);
  }, [dataDefaultExportFormat]);
  const { value: dataShowExport } = useSetting('dataShowExport');
  const { value: dataShowImport } = useSetting('dataShowImport');
  const { value: exportIncludeDates } = useSetting('exportIncludeDates');
  const { value: exportIncludeUrls } = useSetting('exportIncludeUrls');
  const { value: exportJsonIndentSize } = useSetting('exportJsonIndentSize');
  const { value: exportHtmlIndentSpaces } = useSetting('exportHtmlIndentSpaces');
  const { value: exportMarkdownIndentSpaces } = useSetting('exportMarkdownIndentSpaces');
  const { value: exportFilenamePrefix } = useSetting('exportFilenamePrefix');
  const { value: exportFilenameMaxLength } = useSetting('exportFilenameMaxLength');

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
  const [metadataApplying, setMetadataApplying] = useState(false);
  const webHostAccess = useWebHostAccess();
  const [pendingNetworkTool, setPendingNetworkTool] = useState<PendingNetworkTool | null>(null);
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
  const { value: statisticsIncludeDepthBreakdown } = useSetting('statisticsIncludeDepthBreakdown');
  const { value: deadLinksRequestTimeoutMs } = useSetting('deadLinksRequestTimeoutMs');
  const { value: deadLinksConcurrency } = useSetting('deadLinksConcurrency');
  const { value: deadLinksRetryCount } = useSetting('deadLinksRetryCount');
  const { value: deadLinksFollowRedirects } = useSetting('deadLinksFollowRedirects');
  const { value: deadLinksSuccessStatuses } = useSetting('deadLinksSuccessStatuses');
  const { value: metadataFetcherOverwriteTitles } = useSetting('metadataFetcherOverwriteTitles');
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

  const [duplicateScope, setDuplicateScope] = useState<ToolScope>('all');
  const duplicateUndoRef = useRef<(() => void) | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<{
    message: string;
    snapshots: BookmarkDeletionSnapshot[];
  } | null>(null);

  const scanDuplicates = (nodes: BookmarkTreeNode[]) =>
    scanDuplicateBookmarks(nodes, {
      strategy: duplicatesMatchStrategy,
      normalizeWww: duplicatesNormalizeWww,
      ignoreProtocol: duplicatesIgnoreProtocol,
      ignoreTrailingSlash: duplicatesIgnoreTrailingSlash,
      maxGroups: duplicatesMaxGroups,
      keepRule: duplicatesKeepRule,
    });

  const handleDuplicates = async (scope: ToolScope) => {
    setDuplicateLoading(true);
    try {
      setDuplicateScope(scope);
      setDuplicateNotice(null);
      setDuplicateResult(scanDuplicates(getTargetNodes(scope)));
      setDuplicatesDialogOpen(true);
    } finally {
      setDuplicateLoading(false);
    }
  };

  const undoDuplicateRemoval = async (snapshots: BookmarkDeletionSnapshot[]) => {
    setDuplicateNotice(null);
    const { restored, failed } = await restoreDuplicateExtras(snapshots);
    await refresh();
    const freshTree = await fetchBookmarkTree();
    setDuplicateResult(scanDuplicates(getScopedNodes(freshTree, currentFolderId, duplicateScope)));
    toast({
      title: failed ? t('toast_errorRestoringDeletion') : t('toast_deleteRestored'),
      description: t('toast_duplicatesRestoredDesc', [String(restored), String(failed)]),
      variant: failed ? 'destructive' : 'success',
    });
  };

  const handleRemoveDuplicates = async () => {
    if (!duplicateResult) return;

    setDuplicateRemoving(true);
    try {
      const outcome = await removeDuplicateExtras(duplicateResult.groups, duplicateResult.match);
      await refresh();
      const complete = outcome.skipped === 0 && outcome.failed === 0;
      const description = complete
        ? tPlural('toast_duplicatesRemovedDesc', outcome.removed)
        : [
            t('toast_duplicatesPartialDesc', [
              String(outcome.removed),
              String(outcome.skipped),
              String(outcome.failed),
            ]),
            outcome.skippedGroups > 0
              ? tPlural('toast_duplicatesSkippedGroupsDesc', outcome.skippedGroups)
              : '',
          ]
            .filter(Boolean)
            .join(' ');
      // One undo per removal, whether triggered from the toast or the dialog notice.
      let undoUsed = false;
      const undo = () => {
        if (undoUsed) return;
        undoUsed = true;
        void undoDuplicateRemoval(outcome.snapshots);
      };

      if (complete) {
        setDuplicatesDialogOpen(false);
      } else {
        // Rescan from the live tree so the dialog never shows stale groups after a partial run.
        const freshTree = await fetchBookmarkTree();
        setDuplicateResult(
          scanDuplicates(getScopedNodes(freshTree, currentFolderId, duplicateScope)),
        );
        setDuplicateNotice({ message: description, snapshots: outcome.snapshots });
      }

      toast({
        title: complete ? t('toast_duplicatesRemoved') : t('toast_duplicatesPartiallyRemoved'),
        description,
        variant: complete ? 'success' : 'destructive',
        duration: BOOKMARK_DELETION_UNDO_WINDOW_MS,
        action:
          outcome.snapshots.length > 0 ? (
            <ToastAction altText={t('action_undo')} onClick={undo}>
              {t('action_undo')}
            </ToastAction>
          ) : undefined,
      });
      duplicateUndoRef.current = undo;
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
      const outcome = await applyUrlCleanerPreviews(urlCleanerResult.previews);
      await refresh();
      setUrlCleanerDialogOpen(false);
      const complete = outcome.skipped === 0 && outcome.failed === 0;
      toast({
        title: complete ? t('toast_urlCleanerApplied') : t('toast_urlCleanerPartial'),
        description: complete
          ? tPlural('toast_urlCleanerAppliedDesc', outcome.updated)
          : t('toast_urlCleanerPartialDesc', [
              String(outcome.updated),
              String(outcome.skipped),
              String(outcome.failed),
            ]),
        variant: complete ? 'success' : 'destructive',
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
      includeDepthBreakdown: statisticsIncludeDepthBreakdown,
      topN: statisticsTopN,
    });
    setStatisticsResult(result);
    setStatisticsDialogOpen(true);
  };

  const runDeadLinks = async (scope: ToolScope) => {
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

  const runMetadata = async (scope: ToolScope) => {
    setMetadataLoading(true);
    try {
      const result = await fetchBookmarkMetadata(getTargetNodes(scope), {
        overwriteTitles: metadataFetcherOverwriteTitles,
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

  const runNetworkTool = (request: PendingNetworkTool) =>
    request.tool === 'dead-links' ? runDeadLinks(request.scope) : runMetadata(request.scope);

  // Network tools need optional host access; explain and ask before the first scan.
  const startNetworkTool = async (request: PendingNetworkTool) => {
    if (webHostAccess.granted) {
      await runNetworkTool(request);
      return;
    }
    setPendingNetworkTool(request);
  };

  const handleAllowWebHostAccess = async () => {
    const request = pendingNetworkTool;
    // Request synchronously inside the click so the browser treats it as user-initiated.
    const permission = requestWebHostAccess();
    setPendingNetworkTool(null);
    const granted = await permission;
    await webHostAccess.recheck();
    if (!granted) {
      toast({
        title: t('tools_hostAccessDenied'),
        description: t('tools_hostAccessDeniedDesc'),
        variant: 'destructive',
      });
      return;
    }
    if (request) await runNetworkTool(request);
  };

  const handleApplyMetadata = async (items: MetadataFetchResultItem[]) => {
    setMetadataApplying(true);
    try {
      const outcome = await applyMetadataTitles(items);
      await refresh();
      setMetadataDialogOpen(false);
      const complete = outcome.skipped === 0 && outcome.failed === 0;
      toast({
        title: complete ? t('toast_metadataApplied') : t('toast_metadataPartial'),
        description: complete
          ? tPlural('toast_metadataAppliedDesc', outcome.updated)
          : t('toast_metadataPartialDesc', [
              String(outcome.updated),
              String(outcome.skipped),
              String(outcome.failed),
            ]),
        variant: complete ? 'success' : 'destructive',
      });
    } catch (error) {
      toast({
        title: t('toast_toolFailed'),
        description: error instanceof Error ? error.message : t('error_unknown'),
        variant: 'destructive',
      });
    } finally {
      setMetadataApplying(false);
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

  // The enabled check comes first so a disabled AI never surfaces provider or API-key errors.
  const buildAISettings = async () => {
    if (!aiEnabled) {
      throw new Error(t('ai_featuresDisabled'));
    }
    return buildAISettingsFromProvider(aiProvider as AIProvider, aiModel, aiEnabled);
  };
  const aiDisabledNotice = aiEnabled ? undefined : t('ai_featuresDisabledNotice');

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
        description: tPlural('toast_aiContextPackedDesc', packed.itemCount),
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

    if (toolName === 'dead-links' || toolName === 'metadata') {
      await startNetworkTool({ tool: toolName, scope });
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
  const handleExport = async (scope: ToolScope) => {
    const scopeNodes = getTargetNodes(scope);
    if (scopeNodes.length === 0) return;
    setIsExporting(true);

    try {
      const format = exportFormats[exportFormat] ?? exportFormats.html;
      const root = buildExportRoot(scopeNodes);
      const content = exportBookmarks(root, format, {
        includeDates: exportIncludeDates,
        includeUrls: exportIncludeUrls,
        jsonIndentSize: exportJsonIndentSize,
        htmlIndentSpaces: exportHtmlIndentSpaces,
        markdownIndentSpaces: exportMarkdownIndentSpaces,
      });
      const scopeName = scope === 'folder' && currentFolderId ? currentFolderName || 'folder' : 'all';
      const filename = generateFilename(scopeName, format, {
        prefix: exportFilenamePrefix,
        maxLength: exportFilenameMaxLength,
      });
      downloadExport(content, filename, format.mimeType);

      const count = countExportedBookmarks(root);
      toast({
        title: t('toast_exportSuccess'),
        description: tPlural('toast_exportSuccessDesc', count, [getFormatName(format)]),
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
      const parsed = parseBookmarks(content, format);
      if (parsed.bookmarkCount + parsed.folderCount === 0) {
        throw new Error(t('error_importNothingFound'));
      }

      // Import to Bookmarks Bar (folder ID "1") or current folder
      const targetId = currentFolderId || '1';
      const outcome = await importBookmarks(parsed.bookmarks, targetId);
      await refresh();

      const notImported = outcome.failed + parsed.skipped;
      const imported = outcome.bookmarksCreated + outcome.foldersCreated;
      const counts = [String(outcome.bookmarksCreated), String(outcome.foldersCreated)];
      toast(
        notImported === 0
          ? {
              title: t('toast_importSuccess'),
              description: t('toast_importResultDesc', counts),
              variant: 'success',
            }
          : {
              title: imported === 0 ? t('toast_importFailed') : t('toast_importPartial'),
              description: t('toast_importPartialDesc', [...counts, String(notImported)]),
              variant: 'destructive',
            },
      );
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
                    disabled={!aiEnabled}
                    notice={aiDisabledNotice}
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
                    disabled={!aiEnabled}
                    notice={aiDisabledNotice}
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
                    disabled={!aiEnabled}
                    notice={aiDisabledNotice}
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
          {!toolSettingsLoading && (dataShowExport || dataShowImport) && (
          <ToolSection title={t('tools_category_data')}>
            {dataShowExport && (
              <ToolCard
                icon={<Download className="h-4 w-4 text-emerald-500" />}
                title={t('tools_export')}
                description={t('tools_exportDesc')}
                buttonLabel={t('action_export')}
                onClick={(scope) => handleExport(scope)}
                disabled={folders.length === 0}
                isLoading={isExporting}
                scopeCapability="both"
                defaultScope="folder"
                currentFolderName={currentFolderName}
                controls={
                  <Select value={exportFormat} onValueChange={setExportFormat}>
                    <SelectTrigger className="h-8 w-full text-xs" aria-label={t('tools_exportFormat')}>
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
                }
              />
            )}

            {/* Import Tool */}
            {dataShowImport && (
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
            )}
          </ToolSection>
          )}
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
        description={tPlural('tools_duplicatesDialogDesc', duplicateResult?.groups.length ?? 0, [
          String(duplicateResult?.scannedBookmarks ?? 0),
        ])}
      >
        <DuplicateResultsView
          result={duplicateResult}
          isRemoving={duplicateRemoving}
          onClose={() => setDuplicatesDialogOpen(false)}
          onConfirm={handleRemoveDuplicates}
          notice={duplicateNotice?.message}
          onUndo={
            duplicateNotice?.snapshots.length ? () => duplicateUndoRef.current?.() : undefined
          }
        />
      </ToolResultsDialog>

      <ToolResultsDialog
        open={urlCleanerDialogOpen}
        onOpenChange={setUrlCleanerDialogOpen}
        title={t('tools_cleanUrls')}
        description={tPlural('tools_urlCleanerDialogDesc', urlCleanerResult?.previews.length ?? 0)}
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
        <MetadataResultsView
          result={metadataResult}
          isApplying={metadataApplying}
          onApply={handleApplyMetadata}
        />
      </ToolResultsDialog>

      <Dialog
        open={pendingNetworkTool !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNetworkTool(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('tools_hostAccessTitle')}</DialogTitle>
            <DialogDescription>{t('tools_hostAccessDesc')}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('tools_hostAccessPrivacy')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingNetworkTool(null)}>
              {t('action_notNow')}
            </Button>
            <Button onClick={handleAllowWebHostAccess}>{t('action_allowAccess')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
