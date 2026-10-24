/**
 * Back up settings, Restore settings, and Undo import for the Settings page (`services/backup.ts`):
 * the two dialogs (`BackupDialogs.lazy.tsx`, loaded the first time one opens), saving the file,
 * the import, and the last import's Undo while it is offered. The Undo here and History's Undo are
 * one path (`undoBackupImport`).
 */
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BackupExportDefaults,
  BackupImportSource,
} from '@/components/options/BackupDialogs.lazy';
import type { BackupUndoRecord } from '@/lib/backup-undo-store';

const BackupExportDialog = lazy(() =>
  import('@/components/options/BackupDialogs.lazy').then((module) => ({
    default: module.BackupExportDialog,
  })),
);
const BackupImportDialog = lazy(() =>
  import('@/components/options/BackupDialogs.lazy').then((module) => ({
    default: module.BackupImportDialog,
  })),
);

/** The last import's safety copy while Undo import is offered, following every Settings tab. */
export function useLastBackupImport(): {
  record: BackupUndoRecord | undefined;
  refresh: () => void;
} {
  const [record, setRecord] = useState<BackupUndoRecord>();
  const refresh = useCallback(() => {
    void getBackupUndo().then(setRecord, () => setRecord(undefined));
  }, []);
  useEffect(() => {
    refresh();
    return watchBackupUndo(refresh);
  }, [refresh]);
  return { record, refresh };
}

/** Why Undo import could not run, in words. */
export function describeBackupUndoUnavailable(reason: BackupUndoUnavailable): string {
  switch (reason) {
    case 'undone':
      return t('backup_undoUnavailableUndone');
    case 'expired':
      return t('backup_undoUnavailableExpired', String(BACKUP_LIMITS.undoKeepMs / MS_PER_HOUR));
    case 'replaced':
      return t('backup_undoUnavailableReplaced');
  }
}

/** Runs Undo import of `operationId` and says how it went. Resolves to whether it undid. */
export async function runBackupUndo(operationId: string): Promise<boolean> {
  try {
    const outcome = await undoBackupImport(operationId);
    if (!outcome.undone) {
      toast.error({
        title: t('backup_undoFailed'),
        description: describeBackupUndoUnavailable(outcome.reason),
      });
      return false;
    }
    if (outcome.mismatches > 0) {
      toast.error({
        title: t('backup_undone'),
        description: t('backup_undoMismatch', formatCount(outcome.mismatches)),
      });
    } else {
      toast.success({ title: t('backup_undone') });
    }
    return true;
  } catch (error) {
    toast.error({ title: t('backup_undoFailed'), description: getErrorMessage(error) });
    return false;
  }
}

export function useBackupFlow({
  settings,
  onSettingsFile,
}: {
  settings: Pick<
    Settings,
    'backupExportCategories' | 'backupEncryptByDefault' | 'backupEncryptSecrets'
  >;
  /** A JSON file that is no backup: a plain settings file. */
  onSettingsFile: (text: string) => Promise<void>;
}): {
  openExport: () => void;
  restoreFile: (file: File) => Promise<void>;
  /** Undo import of the last import, while it is offered. */
  undoLastImport?: () => void;
  dialogs: ReactNode;
} {
  const [loaded, setLoaded] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importSource, setImportSource] = useState<BackupImportSource | null>(null);
  const lastImport = useLastBackupImport();

  const defaults: BackupExportDefaults = useMemo(
    () => ({
      categories: settings.backupExportCategories,
      encryptByDefault: settings.backupEncryptByDefault,
      encryptSecrets: settings.backupEncryptSecrets,
    }),
    [
      settings.backupExportCategories,
      settings.backupEncryptByDefault,
      settings.backupEncryptSecrets,
    ],
  );

  const openExport = () => {
    setLoaded(true);
    setExportOpen(true);
  };

  const save = async (request: BackupExportRequest) => {
    const built = await makeBackupFile(request);
    downloadExport(built.json, built.filename, MIME.json);
    // Remembered on this device; the keys never are.
    const remembered = request.categories.filter((id) => !getBackupCategory(id)?.secret);
    if (remembered.length > 0) {
      await saveSettings({ backupExportCategories: remembered }).catch(() => undefined);
    }
    const names = formatList(built.parts.map((part) => getBackupCategoryLabel(part.id)));
    toast.success({
      title: t('toast_backupExported'),
      description:
        request.protection === 'none'
          ? t('backup_exportedDesc', [built.filename, names])
          : t('backup_exportedProtectedDesc', [built.filename, names]),
    });
    return built;
  };

  const restoreFile = async (file: File) => {
    try {
      if (file.size > BACKUP_LIMITS.maxFileBytes) {
        throw new Error(t('backup_errorFileTooLarge', formatMegabytes(BACKUP_LIMITS.maxFileBytes)));
      }
      const text = await file.text();
      const opened = await openBackup(text);
      if (!opened) {
        await onSettingsFile(text);
        return;
      }
      setLoaded(true);
      setImportSource({ opened, fileName: file.name });
    } catch (error) {
      toast.error({
        title: t('toast_importFailed'),
        description: getErrorMessage(error, 'error_invalidSettingsFile'),
      });
    }
  };

  const runImport = async (opened: OpenedBackup, choices: Record<string, PartChoice>) => {
    const outcome = await importBackup(opened, choices, importSource?.fileName);
    lastImport.refresh();
    return outcome;
  };

  const undo = async (operationId: string) => {
    await runBackupUndo(operationId);
    lastImport.refresh();
    setImportSource(null);
  };

  const record = lastImport.record;
  return {
    openExport,
    restoreFile,
    ...(record ? { undoLastImport: () => void undo(record.operationId) } : {}),
    dialogs: loaded ? (
      <Suspense fallback={null}>
        <BackupExportDialog
          open={exportOpen}
          defaults={defaults}
          onOpenChange={setExportOpen}
          onSave={save}
        />
        <BackupImportDialog
          source={importSource}
          onClose={() => setImportSource(null)}
          onImport={runImport}
          onUndo={undo}
        />
      </Suspense>
    ) : null,
  };
}
