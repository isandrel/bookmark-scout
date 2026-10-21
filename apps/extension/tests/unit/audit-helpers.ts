/** Audit History helpers for unit tests: an empty database per test, and its records. */
import { IDBFactory } from 'fake-indexeddb';
import { closeAuditDb, getAuditDetails, listAuditOperations } from '@/lib/bookmark-audit-store';

/** Starts the Audit History from an empty database. */
export async function resetAuditDatabase(): Promise<void> {
  await closeAuditDb();
  globalThis.indexedDB = new IDBFactory();
}

/** Every stored record, newest first, with its item rows. */
export async function auditRecords() {
  const { operations } = await listAuditOperations();
  return Promise.all(
    operations.map(async (operation) => ({
      ...operation,
      details: await getAuditDetails(operation.id),
    })),
  );
}
