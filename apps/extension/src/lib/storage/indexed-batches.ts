/**
 * Saving many records of derived data (page text, covers) to IndexedDB so a full disk never loses
 * the whole save or fails silently. Records are written in batches of `save_batch_size`
 * (config/data/indexed-db.toml), one transaction each. When a transaction fails because this
 * device's storage for the extension is full (`QuotaExceededError`), IndexedDB rolls that batch
 * back as a whole; the save stops there, keeps what earlier batches wrote, and reports how many
 * records were not written, for the caller to tell the user. Any other error is thrown as it was.
 */
import { z } from 'zod';
import { boundedNumber } from '@/lib/config/bounded';

const config = readConfig(
  'data/indexed-db',
  z.strictObject({ save_batch_size: boundedNumber({ integer: true }) }),
);

/** Records written per transaction. */
export const INDEXED_SAVE_BATCH_SIZE = config.save_batch_size;

const QUOTA_EXCEEDED = 'QuotaExceededError';

/** Whether `error` says the storage quota is used up (a `DOMException` by that name). */
export function isQuotaExceededError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === QUOTA_EXCEEDED
  );
}

/** What a batched save wrote, and what it left out because storage was full. */
export type BatchedSaveResult = { written: number; notWritten: number };

/**
 * Issues a transaction's writes (`issue`), waits for them and the commit, and throws the
 * transaction's own error when it fails: a request aborted by another request's quota error
 * reports `AbortError`, while the transaction keeps the cause. Every promise is awaited, and a
 * write that throws at once aborts the transaction, so nothing rejects unhandled.
 */
export async function commitIndexedWrites(
  transaction: { done: Promise<void>; error: DOMException | null; abort(): void },
  issue: () => readonly Promise<unknown>[],
): Promise<void> {
  let writes: readonly Promise<unknown>[];
  try {
    writes = issue();
  } catch (error) {
    transaction.done.catch(() => undefined);
    try {
      transaction.abort();
    } catch {
      // It had already finished; there is nothing to roll back.
    }
    throw error;
  }
  try {
    await Promise.all([...writes, transaction.done]);
  } catch (error) {
    throw transaction.error ?? error;
  }
}

/**
 * Calls `writeBatch` for each batch of `records` in order (`writeBatch` writes one batch in one
 * transaction, through `commitIndexedWrites`), and stops at the first batch that runs out of
 * storage. `written` counts the records of the batches that committed.
 */
export async function saveInBatches<Record>(
  records: readonly Record[],
  writeBatch: (batch: readonly Record[]) => Promise<void>,
): Promise<BatchedSaveResult> {
  let written = 0;
  for (let start = 0; start < records.length; start += INDEXED_SAVE_BATCH_SIZE) {
    const batch = records.slice(start, start + INDEXED_SAVE_BATCH_SIZE);
    try {
      await writeBatch(batch);
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;
      return { written, notWritten: records.length - written };
    }
    written += batch.length;
  }
  return { written, notWritten: 0 };
}
