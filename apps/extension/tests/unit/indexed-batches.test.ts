import { describe, expect, it, vi } from 'vitest';
import {
  INDEXED_SAVE_BATCH_SIZE,
  isQuotaExceededError,
  saveInBatches,
} from '@/lib/storage/indexed-batches';

describe('saving in batches', () => {
  const records = Array.from({ length: INDEXED_SAVE_BATCH_SIZE * 2 + 1 }, (_, index) => index);

  it('writes every batch in order when there is room', async () => {
    const batches: number[][] = [];
    const result = await saveInBatches(records, async (batch) => {
      batches.push([...batch]);
    });
    expect(result).toEqual({ written: records.length, notWritten: 0 });
    expect(batches.flat()).toEqual(records);
    expect(batches.every((batch) => batch.length <= INDEXED_SAVE_BATCH_SIZE)).toBe(true);
  });

  it('keeps the batches before storage ran out and counts the rest', async () => {
    const writeBatch = vi
      .fn<(batch: readonly number[]) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
    const result = await saveInBatches(records, writeBatch);
    expect(result).toEqual({
      written: INDEXED_SAVE_BATCH_SIZE,
      notWritten: records.length - INDEXED_SAVE_BATCH_SIZE,
    });
    // Nothing more is tried once storage is full.
    expect(writeBatch).toHaveBeenCalledTimes(2);
  });

  it('throws any other failure as it was', async () => {
    const failure = new DOMException('broken', 'UnknownError');
    await expect(saveInBatches(records, async () => Promise.reject(failure))).rejects.toBe(failure);
    expect(isQuotaExceededError(failure)).toBe(false);
    expect(isQuotaExceededError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceededError(undefined)).toBe(false);
  });
});
