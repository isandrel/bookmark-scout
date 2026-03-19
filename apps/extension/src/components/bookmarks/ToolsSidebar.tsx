/**
 * ToolsSidebar - Right sidebar panel for bookmark tools.
 * Matches the left folder sidebar design.
 * Features scope selection (current folder vs all bookmarks) based on tool capabilities.
 */

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Info,
} from 'lucide-react';
import { t } from '@/hooks/use-i18n';
import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  exportFormats,
  exportBookmarks,
  downloadExport,
  generateFilename,
  getFormatName,
  parseBookmarks,
  importBookmarks,
  detectFormat,
  readFile,
  getAcceptedFileTypes,
  generateReorganizationPlan,
  applyReorganizationPlan,
  type ReorganizationPlan,
  type AIProvider,
  getScopedNodes,
  scanDuplicateBookmarks,
  previewCleanUrls,
  collectBookmarkStatistics,
  deleteBookmark,
  updateBookmark,
} from '@/services';
import { useSetting } from '@/lib';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { ReorganizationDialog } from './ReorganizationDialog';
import { ToolResultsDialog } from './ToolResultsDialog';

type ToolScope = 'folder' | 'all';
type ScopeCapability = 'folder' | 'all' | 'both';

interface ToolCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: (scope: ToolScope) => void;
  disabled?: boolean;
  isLoading?: boolean;
  scopeCapability: ScopeCapability;
  currentFolderName?: string;
}

function ToolCard({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
  disabled = false,
  isLoading = false,
  scopeCapability,
  currentFolderName,
}: ToolCardProps) {
  const [scope, setScope] = useState<ToolScope>(
    scopeCapability === 'all' ? 'all' : 'folder'
  );

  const showScopeSelector = scopeCapability === 'both';

  // Scope badge indicator
  const ScopeBadge = () => {
    if (scopeCapability === 'folder') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          <Folder className="h-3 w-3" />
        </span>
      );
    }
    if (scopeCapability === 'all') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
          <Globe className="h-3 w-3" />
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
        <Folder className="h-3 w-3" />
        <span>/</span>
        <Globe className="h-3 w-3" />
      </span>
    );
  };

  return (
    <div className="p-3 rounded-lg border bg-card space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 p-1.5 rounded-md bg-muted">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium truncate">{title}</h4>
            <ScopeBadge />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showScopeSelector && (
          <Select value={scope} onValueChange={(v) => setScope(v as ToolScope)}>
            <SelectTrigger className="flex-1 h-8 text-xs">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="folder">
                <div className="flex items-center gap-2">
                  <Folder className="h-3 w-3" />
                  <span className="truncate">{currentFolderName || 'Current Folder'}</span>
                </div>
              </SelectItem>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  <span>All Bookmarks</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onClick(scope)}
          disabled={disabled || isLoading}
          className={cn('h-8 text-xs', !showScopeSelector && 'w-full')}
        >
          {isLoading ? 'Running...' : buttonLabel}
        </Button>
      </div>
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
  const { value: dataDefaultExportFormat } = useSetting('dataDefaultExportFormat');
  const [exportFormat, setExportFormat] = useState(String(dataDefaultExportFormat));

  // AI Reorganization state
  const [reorgDialogOpen, setReorgDialogOpen] = useState(false);
  const [reorgPlan, setReorgPlan] = useState<ReorganizationPlan | null>(null);
  const [reorgLoading, setReorgLoading] = useState(false);
  const [reorgErrors, setReorgErrors] = useState<string[]>([]);

  const [duplicatesDialogOpen, setDuplicatesDialogOpen] = useState(false);
  const [duplicateResult, setDuplicateResult] = useState<ReturnType<typeof scanDuplicateBookmarks> | null>(null);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateRemoving, setDuplicateRemoving] = useState(false);

  const [urlCleanerDialogOpen, setUrlCleanerDialogOpen] = useState(false);
  const [urlCleanerResult, setUrlCleanerResult] = useState<ReturnType<typeof previewCleanUrls> | null>(null);
  const [urlCleanerLoading, setUrlCleanerLoading] = useState(false);
  const [urlCleanerApplying, setUrlCleanerApplying] = useState(false);

  const [statisticsDialogOpen, setStatisticsDialogOpen] = useState(false);
  const [statisticsResult, setStatisticsResult] = useState<ReturnType<typeof collectBookmarkStatistics> | null>(null);

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
        title: t('toast_duplicatesRemoved') || 'Duplicates removed',
        description: (t('toast_duplicatesRemovedDesc') || '$1 duplicate bookmarks removed').replace('$1', String(toDelete.length)),
      });
    } catch (error) {
      toast({
        title: t('toast_toolFailed') || 'Tool failed',
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
        title: t('toast_urlCleanerApplied') || 'URLs cleaned',
        description: (t('toast_urlCleanerAppliedDesc') || '$1 bookmarks updated').replace('$1', String(urlCleanerResult.previews.length)),
      });
    } catch (error) {
      toast({
        title: t('toast_toolFailed') || 'Tool failed',
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

    if (toolName === 'reorganize') {
      setReorgDialogOpen(true);
      setReorgLoading(true);
      setReorgPlan(null);
      setReorgErrors([]);
      
      try {
        const targetFolders = getTargetNodes(scope);
        
        const { aiApiKey } = await chrome.storage.local.get('aiApiKey');
        
        if (!aiApiKey && aiProvider !== 'ollama') {
          setReorgErrors(['API key not configured. Please set it in Options → AI.']);
          setReorgLoading(false);
          return;
        }

        const aiSettings = {
          enabled: aiEnabled,
          provider: aiProvider as AIProvider,
          model: aiModel,
          apiKey: aiApiKey as string,
        };
        
        const plan = await generateReorganizationPlan(targetFolders, aiSettings);
        setReorgPlan(plan);
      } catch (err) {
        setReorgErrors([err instanceof Error ? err.message : 'Failed to analyze bookmarks']);
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
        title: t('toast_exportSuccess') || 'Export Complete',
        description: (t('toast_exportSuccessDesc') || '$1 bookmarks exported as $2')
          .replace('$1', String(count))
          .replace('$2', getFormatName(format)),
      });
    } catch (err) {
      toast({
        title: t('toast_exportFailed') || 'Export Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
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
        throw new Error('Unsupported file format');
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
        title: t('toast_importSuccess') || 'Import Complete',
        description: (t('toast_importSuccessDesc') || '$1 items imported successfully')
          .replace('$1', String(created)),
      });
    } catch (err) {
      toast({
        title: t('toast_importFailed') || 'Import Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
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
          {t('tools_title') || 'Tools'}
        </h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-6">
          
          {/* AI & Intelligence */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {t('tools_category_ai') || 'AI & Intelligence'}
            </h3>
            
            <ToolCard
              icon={<FileText className="h-4 w-4 text-indigo-500" />}
              title={t('tools_exportAI') || 'AI Context Packer'}
              description={t('tools_exportAIDesc') || 'Export bookmarks for LLMs'}
              buttonLabel={t('action_export') || 'Export'}
              onClick={(scope) => handleToolAction('ai-pack', scope)}
              scopeCapability="both"
              currentFolderName={currentFolderName}
              disabled
            />

            <ToolCard
              icon={<Tags className="h-4 w-4 text-indigo-500" />}
              title={t('tools_autoTagging') || 'Auto-Tagging'}
              description={t('tools_autoTaggingDesc') || 'Suggest tags for bookmarks'}
              buttonLabel={t('action_analyze') || 'Analyze'}
              onClick={(scope) => handleToolAction('auto-tag', scope)}
              scopeCapability="folder"
              currentFolderName={currentFolderName}
              disabled
            />

            <ToolCard
              icon={<FileOutput className="h-4 w-4 text-indigo-500" />}
              title={t('tools_summarizer') || 'Content Summarizer'}
              description={t('tools_summarizerDesc') || 'Generate summaries'}
              buttonLabel={t('action_analyze') || 'Summarize'}
              onClick={(scope) => handleToolAction('summarize', scope)}
              scopeCapability="folder"
              currentFolderName={currentFolderName}
              disabled
            />

            <ToolCard
              icon={<Sparkles className="h-4 w-4 text-purple-500" />}
              title={t('tools_aiReorganize') || 'AI Folder Reorganization'}
              description={t('tools_aiReorganizeDesc') || 'Use AI to suggest a better folder structure'}
              buttonLabel={t('action_analyze') || 'Analyze'}
              onClick={(scope) => handleToolAction('reorganize', scope)}
              scopeCapability="both"
              currentFolderName={currentFolderName}
              isLoading={reorgLoading}
            />
          </div>

          {/* Maintenance */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {t('tools_category_maintenance') || 'Maintenance'}
            </h3>

            <ToolCard
              icon={<Copy className="h-4 w-4 text-orange-500" />}
              title={t('tools_findDuplicates') || 'Duplicate Cleaner'}
              description={t('tools_findDuplicatesDesc') || 'Find duplicates'}
              buttonLabel={t('action_scan') || 'Scan'}
              onClick={(scope) => handleToolAction('duplicates', scope)}
              scopeCapability="all"
              currentFolderName={currentFolderName}
              isLoading={duplicateLoading}
            />

            <ToolCard
              icon={<Eraser className="h-4 w-4 text-orange-500" />}
              title={t('tools_cleanUrls') || 'URL Cleaner'}
              description={t('tools_cleanUrlsDesc') || 'Remove tracking params'}
              buttonLabel={t('action_clean') || 'Clean'}
              onClick={(scope) => handleToolAction('clean-urls', scope)}
              scopeCapability="both"
              currentFolderName={currentFolderName}
              isLoading={urlCleanerLoading}
            />

            <ToolCard
              icon={<Link2Off className="h-4 w-4 text-orange-500" />}
              title={t('tools_checkDeadLinks') || 'Check Dead Links'}
              description={t('tools_checkDeadLinksDesc') || 'Find broken links'}
              buttonLabel={t('action_scan') || 'Scan'}
              onClick={(scope) => handleToolAction('dead-links', scope)}
              scopeCapability="both"
              currentFolderName={currentFolderName}
              disabled
            />
          </div>

          {/* Metadata & Content */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {t('tools_category_metadata') || 'Metadata'}
            </h3>
            
            <ToolCard
              icon={<RefreshCw className="h-4 w-4 text-blue-500" />}
              title={t('tools_metadataFetcher') || 'Metadata Fetcher'}
              description={t('tools_metadataFetcherDesc') || 'Fix titles & icons'}
              buttonLabel={t('action_scan') || 'Fetch'}
              onClick={(scope) => handleToolAction('metadata', scope)}
              scopeCapability="both"
              currentFolderName={currentFolderName}
              disabled
            />
          </div>

          {/* Security */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {t('tools_category_security') || 'Security'}
            </h3>
            
            <ToolCard
              icon={<ShieldAlert className="h-4 w-4 text-red-500" />}
              title={t('tools_privacyScanner') || 'Privacy Scanner'}
              description={t('tools_privacyScannerDesc') || 'Scan for secrets'}
              buttonLabel={t('action_scan') || 'Scan'}
              onClick={(scope) => handleToolAction('privacy', scope)}
              scopeCapability="all"
              currentFolderName={currentFolderName}
              disabled
            />
          </div>

          {/* Analytics */}
          <div className="space-y-3">
             <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Analytics
            </h3>

            <ToolCard
              icon={<BarChart3 className="h-4 w-4 text-green-500" />}
              title={t('tools_statistics') || 'Statistics'}
              description={t('tools_statisticsDesc') || 'View stats'}
              buttonLabel={t('action_view') || 'View'}
              onClick={(scope) => handleToolAction('stats', scope)}
              scopeCapability="both"
              currentFolderName={currentFolderName}
            />
          </div>

          {/* Data (Export/Import) */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              {t('tools_category_data') || 'Data'}
            </h3>

            {/* Export Tool */}
            <div className="p-3 rounded-lg border bg-card space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 p-1.5 rounded-md bg-muted">
                  <Download className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium truncate">
                      {t('tools_export') || 'Export Bookmarks'}
                    </h4>
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                      <Folder className="h-3 w-3" />
                      <span>/</span>
                      <Globe className="h-3 w-3" />
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {t('tools_exportDesc') || 'Export bookmarks to HTML, JSON, Markdown, or CSV'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={exportFormat} onValueChange={setExportFormat}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="Format" />
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
                  {isExporting ? 'Exporting...' : t('action_export') || 'Export'}
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
                      {t('tools_import') || 'Import Bookmarks'}
                    </h4>
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      <Folder className="h-3 w-3" />
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {t('tools_importDesc') || 'Import bookmarks from HTML or JSON file'}
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
                  {isImporting ? 'Importing...' : t('action_import') || 'Import'}
                </Button>
              </div>
            </div>
          </div>
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
            const result = await applyReorganizationPlan(reorgPlan);
            if (result.success) {
              await refresh();
              setReorgDialogOpen(false);
              toast({
                title: t('toast_reorganizeSuccess') || 'Reorganization Complete',
                description: t('toast_reorganizeSuccessDesc') || 'Bookmarks reorganized successfully',
              });
            } else {
              setReorgErrors(result.errors);
            }
          }
        }}
        onCancel={() => setReorgDialogOpen(false)}
      />

      <ToolResultsDialog
        open={duplicatesDialogOpen}
        onOpenChange={setDuplicatesDialogOpen}
        title={t('tools_findDuplicates') || 'Duplicate Cleaner'}
        description={(t('tools_duplicatesDialogDesc') || '$1 duplicate groups found across $2 bookmarks')
          .replace('$1', String(duplicateResult?.groups.length ?? 0))
          .replace('$2', String(duplicateResult?.scannedBookmarks ?? 0))}
      >
        <div className="space-y-4">
          {duplicateResult?.groups.length ? (
            duplicateResult.groups.map((group) => (
              <div key={group.key} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{group.items.length}</Badge>
                  <code className="truncate text-xs text-muted-foreground">{group.key}</code>
                </div>
                <div className="space-y-2">
                  {group.items.map((item, index) => (
                    <div key={item.node.id} className="rounded-md bg-muted/40 p-2 text-sm">
                      <div className="flex items-center gap-2">
                        {index === 0 ? <Info className="h-3.5 w-3.5 text-primary" /> : null}
                        <span className="font-medium">{item.node.title || 'Untitled'}</span>
                        {index === 0 ? <Badge>{t('state_keep') || 'Keep'}</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground break-all">{item.node.url}</p>
                      <p className="text-xs text-muted-foreground">{item.pathLabel || 'Root'}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('state_noDuplicatesFound') || 'No duplicate bookmarks found.'}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDuplicatesDialogOpen(false)}>
              {t('action_cancel') || 'Cancel'}
            </Button>
            <Button
              onClick={handleRemoveDuplicates}
              disabled={!duplicateResult?.groups.length || duplicateRemoving}
            >
              {duplicateRemoving ? t('action_removing') || 'Removing...' : t('action_removeDuplicates') || 'Remove duplicates'}
            </Button>
          </div>
        </div>
      </ToolResultsDialog>

      <ToolResultsDialog
        open={urlCleanerDialogOpen}
        onOpenChange={setUrlCleanerDialogOpen}
        title={t('tools_cleanUrls') || 'URL Cleaner'}
        description={(t('tools_urlCleanerDialogDesc') || '$1 bookmarks can be cleaned')
          .replace('$1', String(urlCleanerResult?.previews.length ?? 0))}
      >
        <div className="space-y-4">
          {urlCleanerResult?.previews.length ? (
            urlCleanerResult.previews.map((preview) => (
              <div key={preview.id} className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="font-medium">{preview.title}</div>
                <div className="text-xs text-muted-foreground">{preview.folderPath || 'Root'}</div>
                <div className="rounded-md bg-muted/40 p-2 text-xs break-all">{preview.originalUrl}</div>
                <div className="rounded-md bg-emerald-500/10 p-2 text-xs break-all text-emerald-700 dark:text-emerald-300">{preview.cleanedUrl}</div>
                <div className="flex flex-wrap gap-2">
                  {preview.removedParams.map((param) => (
                    <Badge key={`${preview.id}-${param}`} variant="outline">
                      {param}
                    </Badge>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t('state_noUrlChangesFound') || 'No URL cleanup changes found.'}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUrlCleanerDialogOpen(false)}>
              {t('action_cancel') || 'Cancel'}
            </Button>
            <Button
              onClick={handleApplyUrlCleaner}
              disabled={!urlCleanerResult?.previews.length || urlCleanerApplying}
            >
              {urlCleanerApplying ? t('action_applying') || 'Applying...' : t('action_applyChanges') || 'Apply Changes'}
            </Button>
          </div>
        </div>
      </ToolResultsDialog>

      <ToolResultsDialog
        open={statisticsDialogOpen}
        onOpenChange={setStatisticsDialogOpen}
        title={t('tools_statistics') || 'Bookmark Statistics'}
        description={t('tools_statisticsDialogDesc') || 'Snapshot of the selected bookmark scope'}
      >
        {statisticsResult ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label={t('stats_totalBookmarks') || 'Bookmarks'} value={statisticsResult.totalBookmarks} />
            <StatCard label={t('stats_totalFolders') || 'Folders'} value={statisticsResult.totalFolders} />
            <StatCard label={t('stats_deepestLevel') || 'Deepest level'} value={statisticsResult.deepestLevel} />
            <StatCard label={t('stats_duplicates') || 'Duplicates'} value={statisticsResult.duplicateCount} />
            <StatList label={t('stats_topDomains') || 'Top domains'} items={statisticsResult.topDomains} />
            <StatList label={t('stats_topFolders') || 'Top folders'} items={statisticsResult.topFolders} />
            <StatList label={t('stats_protocols') || 'Protocols'} items={statisticsResult.protocols} />
          </div>
        ) : null}
      </ToolResultsDialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function StatList({
  label,
  items,
}: {
  label: string;
  items: Array<{ label: string; count: number }>;
}) {
  return (
    <div className="rounded-lg border p-4 sm:col-span-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div key={`${label}-${item.label}`} className="flex items-center justify-between text-sm">
              <span className="truncate pr-4">{item.label}</span>
              <Badge variant="secondary">{item.count}</Badge>
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground">{t('state_noData') || 'No data available.'}</div>
        )}
      </div>
    </div>
  );
}
