/** The Data section of the Tools sidebar: export to a file and import from one. */
import { Download, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BookmarkTreeNode } from '@/types';

/** The scope the export card starts on. */
export const EXPORT_DEFAULT_SCOPE: BookmarkToolScope = 'folder';

/** Scope part of an export file name when no folder name applies. */
const EXPORT_SCOPE_FILE_NAMES: Record<BookmarkToolScope, string> = { folder: 'folder', all: 'all' };

const TOOL_ICON_CLASS = 'h-4 w-4 text-muted-foreground';

type DataToolProps = { environment: ToolEnvironment; currentFolderName?: string };

export function ExportToolCard({ environment, currentFolderName }: DataToolProps) {
  const { settings, folders, currentFolderId } = environment;
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<string>(settings.dataDefaultExportFormat);
  // Settings load asynchronously and can change live; follow the saved default format.
  useEffect(() => {
    setExportFormat(settings.dataDefaultExportFormat);
  }, [settings.dataDefaultExportFormat]);

  const handleExport = (scope: BookmarkToolScope) => {
    const scopeNodes = getScopedNodes(folders, currentFolderId, scope);
    if (scopeNodes.length === 0) return;
    setIsExporting(true);
    const reportExportError = (error: unknown) =>
      toast.error({ title: t('toast_exportFailed'), description: getErrorMessage(error) });

    try {
      const format = exportFormats[exportFormat] ?? exportFormats.html;
      const root = buildExportRoot(scopeNodes);
      if (countExportedBookmarks(root) === 0) {
        showToolOutcome(nothingToExportOutcome());
        return;
      }
      const writeExport = (children: BookmarkTreeNode[]) => {
        const exportRoot = { ...root, children };
        const content = exportBookmarks(exportRoot, format, {
          includeDates: settings.exportIncludeDates,
          includeUrls: settings.exportIncludeUrls,
          jsonIndentSize: settings.exportJsonIndentSize,
          htmlIndentSpaces: settings.exportHtmlIndentSpaces,
          markdownIndentSpaces: settings.exportMarkdownIndentSpaces,
        });
        const scopeName =
          scope === 'folder' && currentFolderId
            ? currentFolderName || EXPORT_SCOPE_FILE_NAMES.folder
            : EXPORT_SCOPE_FILE_NAMES.all;
        const filename = generateFilename(scopeName, format, {
          prefix: settings.exportFilenamePrefix,
          maxLength: settings.exportFilenameMaxLength,
        });
        downloadExport(content, filename, format.mimeType);
        toast.success({
          title: t('toast_exportSuccess'),
          description: tPlural('toast_exportSuccessDesc', countExportedBookmarks(exportRoot), [
            getFormatName(format),
          ]),
        });
      };
      environment.saveFile(
        {
          nodes: root.children ?? [],
          includeUrls: exportIncludesUrls(format, settings.exportIncludeUrls),
          onError: reportExportError,
        },
        writeExport,
      );
    } catch (error) {
      reportExportError(error);
    } finally {
      setIsExporting(false);
    }
  };

  const formatItems = Object.entries(exportFormats).map(([key, format]) => ({
    value: key,
    label: getFormatName(format),
  }));

  return (
    <ToolCard
      icon={<Download className={TOOL_ICON_CLASS} />}
      title={t('tools_export')}
      description={t('tools_exportDesc')}
      buttonLabel={t('action_export')}
      onClick={handleExport}
      disabled={folders.length === 0}
      isLoading={isExporting}
      scopeCapability="both"
      defaultScope={EXPORT_DEFAULT_SCOPE}
      currentFolderName={currentFolderName}
      controls={
        <Select
          value={exportFormat}
          onValueChange={(value) => {
            if (value !== null) setExportFormat(value);
          }}
          items={formatItems}
        >
          <SelectTrigger className="h-8 w-full text-xs" aria-label={t('tools_exportFormat')}>
            <SelectValue placeholder={t('tools_exportFormat')} />
          </SelectTrigger>
          <SelectContent>
            {formatItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

export function ImportToolCard({ environment }: DataToolProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSource, setImportSource] = useState<ImportPreviewSource | null>(null);

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const format = detectFormat(file.name);
      if (!format) {
        throw new Error(t('error_unsupportedFileFormat'));
      }
      const parsed = parseBookmarks(await readFile(file), format);
      if (parsed.bookmarkCount + parsed.folderCount === 0) {
        throw new Error(t('error_importNothingFound'));
      }
      // Nothing is written until the user reviews and applies the preview.
      setImportSource({ fileName: file.name, parsed });
    } catch (error) {
      toast.error({ title: t('toast_importFailed'), description: getErrorMessage(error) });
    } finally {
      setIsImporting(false);
      // The same file can be picked again.
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-2 p-3">
      <ToolCardHeader
        icon={<Upload className={TOOL_ICON_CLASS} />}
        title={t('tools_import')}
        description={t('tools_importDesc')}
        scopeCapability="folder"
      />
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
          className="h-8 w-full text-xs"
        >
          {isImporting ? t('tools_importing') : t('action_import')}
        </Button>
      </div>
      <ImportPreviewDialog
        source={importSource}
        defaultTargetId={environment.currentFolderId}
        onClose={() => setImportSource(null)}
        onChanged={environment.refresh}
      />
    </div>
  );
}
