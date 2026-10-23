/**
 * A backup import in History and its Undo: the import is one `data` record with each part's
 * counts and read-back, its safety copy is the record's undo, and Undo import from the result,
 * the Settings button, and History is one function (`undoBackupImport`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setLanguage } from '@/hooks/use-i18n';
import { getStoredAIProviderConfig, saveStoredAIProviderConfig } from '@/lib/ai-provider-storage';
import { addAIService } from '@/lib/ai-services-storage';
import {
  AUDIT_HISTORY_FILTERS,
  describeAuditOperation,
  filterAuditOperations,
  summarizeAuditOperation,
} from '@/lib/audit-history-view';
import { BACKUP_LIMITS } from '@/lib/backup-config';
import { getBackupUndo } from '@/lib/backup-undo-store';
import { getAuditOperation, listAuditOperations } from '@/lib/bookmark-audit-store';
import { bookmarkRulesValue } from '@/lib/bookmark-rules-storage';
import { SEARCH_SYNTAX_VERSION } from '@/lib/search-query';
import { getSettings, saveSettings } from '@/lib/settings-storage';
import { getBackupUndoAvailability, makeBackupFile, undoBackupImport } from '@/services/backup';
import * as backupFile from '@/services/backup-file.lazy';
import { resetBackupDatabases, restoreParts, stubManifestVersion } from './backup-helpers';

beforeEach(async () => {
  fakeBrowser.reset();
  await resetBackupDatabases();
  await saveSettings({ language: 'en' });
  setLanguage('en');
  stubManifestVersion();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rule = (id: string, tag: string) => ({
  id,
  name: `Rule ${id}`,
  enabled: true,
  query: 'docs',
  syntaxVersion: SEARCH_SYNTAX_VERSION,
  addTags: [tag],
});

async function fileWithThemeAndRules() {
  await saveSettings({ theme: 'dark' });
  await bookmarkRulesValue.set([rule('r1', 'from-file')]);
  const { json } = await makeBackupFile({ categories: ['settings', 'rules'], protection: 'none' });
  await saveSettings({ theme: 'light' });
  await bookmarkRulesValue.set([rule('r2', 'here')]);
  return json;
}

describe('backup import in History', () => {
  it('is one data record with its parts, strategies, counts, and a passed read-back', async () => {
    const json = await fileWithThemeAndRules();
    const { operationId } = await restoreParts(json, { settings: 'merge', rules: 'replace' });
    const record = await getAuditOperation(operationId);
    expect(record).toMatchObject({
      kind: 'data',
      label: { action: 'import', count: 2 },
      state: 'verified_success',
      verification: { status: 'passed', mismatchCount: 0 },
      data: {
        fileName: 'backup.json',
        parts: [
          { id: 'settings', strategy: 'merge', added: 0, changed: 1, removed: 0, skipped: 0 },
          { id: 'rules', strategy: 'replace', added: 1, changed: 0, removed: 1, skipped: 0 },
        ],
      },
    });
    if (!record) throw new Error('no record');
    expect(describeAuditOperation(record)).toBe('Imported backup');
    expect(summarizeAuditOperation(record)).toBe('Settings and Smart Rules');
    expect(AUDIT_HISTORY_FILTERS).toContain('data');
    expect(filterAuditOperations([record], 'data', '')).toEqual([record]);
    expect(filterAuditOperations([record], 'elsewhere', '')).toEqual([]);
    expect(filterAuditOperations([record], 'all', 'smart rules')).toEqual([record]);
  });

  it('is undone through one function, recorded as an undo linked to the import', async () => {
    const json = await fileWithThemeAndRules();
    const { operationId } = await restoreParts(json, { settings: 'merge', rules: 'replace' });
    expect((await getSettings()).theme).toBe('dark');
    expect(await getBackupUndoAvailability({ id: operationId, startedAt: Date.now() })).toEqual({
      available: true,
    });
    // The import result, the Settings button, and History all call this.
    const outcome = await undoBackupImport(operationId);
    expect(outcome).toMatchObject({ undone: true, mismatches: 0 });
    expect((await getSettings()).theme).toBe('light');
    expect((await bookmarkRulesValue.get()).map((entry) => entry.id)).toEqual(['r2']);

    const original = await getAuditOperation(operationId);
    expect(original?.undo).toMatchObject({ complete: true });
    const undo = original?.undo && (await getAuditOperation(original.undo.operationId));
    expect(undo).toMatchObject({
      kind: 'data',
      replay: 'undo',
      relatedOperationId: operationId,
      state: 'verified_success',
    });
    if (!undo) throw new Error('no undo record');
    expect(describeAuditOperation(undo)).toBe('Undone: Imported backup');

    // Once undone, neither path undoes it again.
    expect(await undoBackupImport(operationId)).toEqual({ undone: false, reason: 'undone' });
    expect(await getBackupUndo()).toBeUndefined();
  });

  it('puts back the API keys an import replaced', async () => {
    const service = await addAIService('openai', 'Work');
    await saveStoredAIProviderConfig(service.id, { apiKey: 'sk-synthetic-from-file' });
    const { json } = await makeBackupFile({ categories: ['aiServiceKeys'], protection: 'none' });
    await saveStoredAIProviderConfig(service.id, { apiKey: 'sk-synthetic-before' });
    const { operationId } = await restoreParts(json, { aiServiceKeys: 'merge' });
    expect((await getStoredAIProviderConfig(service.id)).apiKey).toBe('sk-synthetic-from-file');
    await undoBackupImport(operationId);
    expect((await getStoredAIProviderConfig(service.id)).apiKey).toBe('sk-synthetic-before');
  });

  it('keeps the record but offers no Undo once the safety copy expired or a later import replaced it', async () => {
    const json = await fileWithThemeAndRules();
    const first = await restoreParts(json, { settings: 'merge' });
    const second = await restoreParts(json, { rules: 'merge' });
    const startedAt = (await getAuditOperation(first.operationId))?.startedAt ?? 0;
    expect(await getBackupUndoAvailability({ id: first.operationId, startedAt })).toEqual({
      available: false,
      reason: 'replaced',
    });
    expect(await undoBackupImport(first.operationId)).toEqual({
      undone: false,
      reason: 'replaced',
    });

    const later = Date.now() + BACKUP_LIMITS.undoKeepMs;
    expect(
      await backupFile.getBackupUndoAvailability(
        { id: second.operationId, startedAt: Date.now() },
        later,
      ),
    ).toEqual({ available: false, reason: 'expired' });
    expect(await backupFile.undoBackupImport(second.operationId, later)).toEqual({
      undone: false,
      reason: 'expired',
    });
    // History keeps both records.
    const { operations } = await listAuditOperations();
    expect(operations.map((operation) => operation.id)).toEqual(
      expect.arrayContaining([first.operationId, second.operationId]),
    );
  });

  it('does not start a Replace import without its History record, nor import without a safety copy', async () => {
    const json = await fileWithThemeAndRules();
    const opened = await backupFile.openBackupFile(json);
    if (!opened) throw new Error('not a backup');
    vi.spyOn(globalThis.indexedDB, 'open').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    await expect(
      backupFile.applyBackup(opened, { rules: { strategy: 'replace', conflicts: 'file' } }),
    ).rejects.toThrow();
    expect((await bookmarkRulesValue.get()).map((entry) => entry.id)).toEqual(['r2']);
    expect((await getSettings()).theme).toBe('light');
  });
});
