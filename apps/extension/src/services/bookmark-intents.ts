/**
 * Notes of Bookmark Scout's own bookmark writes, made right before each one
 * (`services/bookmarks.ts`), so the background observer (`bookmark-observer.ts`) can tell the
 * extension's own changes from changes made elsewhere when the browser reports them. The browser
 * says nothing about who made a change; a note is matched by the item, the kind of change, and
 * its result, never by time alone, and is used once.
 *
 * A note that cannot be stored never blocks the write: the change then shows in the History as
 * seen from elsewhere, which overstates outside activity but never hides it. No React here.
 */
import { z } from 'zod';

const observerConfig = readConfig(
  'bookmarks/observer',
  z.strictObject({
    burst_window_ms: z.number().int().positive(),
    intent_ttl_ms: z.number().int().positive(),
    reconcile_min_interval_ms: z.number().int().positive(),
  }),
);

export const OBSERVER_LIMITS = {
  burstWindowMs: observerConfig.burst_window_ms,
  intentTtlMs: observerConfig.intent_ttl_ms,
  reconcileMinIntervalMs: observerConfig.reconcile_min_interval_ms,
} as const;

/** Notes a write about to happen; resolves to a key to withdraw it if the write fails. */
export async function noteBookmarkWrite(
  intent: Omit<BookmarkWriteIntent, 'key' | 'at'>,
): Promise<number | undefined> {
  try {
    const db = await openAuditDatabase();
    return await db.add('intents', { ...intent, at: Date.now() });
  } catch {
    return undefined;
  }
}

/** Withdraws a note whose write failed, so it cannot be matched to a change made elsewhere. */
export async function withdrawBookmarkWrite(key: number | undefined): Promise<void> {
  if (key === undefined) return;
  await openAuditDatabase()
    .then((db) => db.delete('intents', key))
    .catch(() => undefined);
}

/** Runs `write` with a note of it in place, withdrawn when the write fails. */
export async function withBookmarkWriteNote<T>(
  intent: Omit<BookmarkWriteIntent, 'key' | 'at'>,
  write: () => Promise<T>,
): Promise<T> {
  const key = await noteBookmarkWrite(intent);
  try {
    return await write();
  } catch (error) {
    await withdrawBookmarkWrite(key);
    throw error;
  }
}

/**
 * Uses up the first note `matches` accepts, dropping expired ones on the way. True when the
 * change was Bookmark Scout's own.
 */
export async function takeBookmarkWriteNote(
  matches: (intent: BookmarkWriteIntent) => boolean,
  now = Date.now(),
): Promise<boolean> {
  const db = await openAuditDatabase();
  const transaction = db.transaction('intents', 'readwrite');
  let found = false;
  for (const intent of await transaction.store.getAll()) {
    if (intent.key === undefined) continue;
    if (now - intent.at > OBSERVER_LIMITS.intentTtlMs) {
      void transaction.store.delete(intent.key);
    } else if (!found && matches(intent)) {
      found = true;
      void transaction.store.delete(intent.key);
    }
  }
  await transaction.done;
  return found;
}
