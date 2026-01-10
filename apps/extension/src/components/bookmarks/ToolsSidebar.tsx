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
} from '@/services';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useToast } from '@/hooks/use-toast';

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
  const [exportFormat, setExportFormat] = useState('html');

  // Handlers (Placeholders)
  const handleToolAction = (toolName: string, scope: ToolScope) => {
    console.log(`Tool action: ${toolName}`, scope, currentFolderId);
    // TODO: Implement tool actions
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
              title={t('tools_aiReorganize') || 'AI Reorganization'}
              description={t('tools_aiReorganizeDesc') || 'Suggest structure'}
              buttonLabel={t('action_analyze') || 'Reorganize'}
              onClick={(scope) => handleToolAction('reorganize', scope)}
              scopeCapability="folder"
              currentFolderName={currentFolderName}
              disabled
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
              disabled
            />

            <ToolCard
              icon={<Eraser className="h-4 w-4 text-orange-500" />}
              title={t('tools_cleanUrls') || 'URL Cleaner'}
              description={t('tools_cleanUrlsDesc') || 'Remove tracking params'}
              buttonLabel="Clean"
              onClick={(scope) => handleToolAction('clean-urls', scope)}
              scopeCapability="both"
              currentFolderName={currentFolderName}
              disabled
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
              disabled
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
    </div>
  );
}
