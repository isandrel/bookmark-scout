import { vi } from 'vitest';

/**
 * Makes IndexedDB run out of storage after `allowedPuts` more writes, the way a full disk does:
 * the transaction of the write past the limit aborts with `QuotaExceededError` once its requests
 * are issued, so everything that transaction wrote is rolled back. Restore with `mockRestore()`.
 */
export function runOutOfStorageAfter(allowedPuts: number) {
  const put = IDBObjectStore.prototype.put;
  const failing = new WeakSet<IDBTransaction>();
  let puts = 0;
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore['put']>
  ) {
    const request = put.apply(this, args);
    puts += 1;
    const transaction = this.transaction;
    if (puts > allowedPuts && !failing.has(transaction)) {
      failing.add(transaction);
      const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      Object.defineProperty(transaction, 'error', {
        configurable: true,
        get: () => quota,
        set: () => undefined,
      });
      // After the batch's other writes are issued, as a request failing on disk would.
      queueMicrotask(() => transaction.abort());
    }
    return request;
  });
}
