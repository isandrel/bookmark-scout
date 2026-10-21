/**
 * Changes made to bookmarks outside Bookmark Scout (the browser's own bookmark manager, other
 * extensions, browser sync), recorded in the History as from an unknown source. Runs in the
 * background, whose bookmark listeners are added synchronously at start, so it hears changes with
 * every Bookmark Scout page closed.
 *
 * - **Own or not:** every write Bookmark Scout makes is noted first (`bookmark-intents.ts`); an
 *   event that uses up a note was the extension's own and its record already exists. Any other
 *   event is from elsewhere. The browser never says who made a change, so a record from elsewhere
 *   names no writer.
 * - **Before and after:** a baseline of every item as last seen (IndexedDB, one record per item)
 *   gives what a changed or removed item was; an item the baseline lacks says its earlier state
 *   is unknown instead of guessing. Order within folders is not kept.
 * - **Bursts:** changes from elsewhere close together (`burst_window_ms`) form one record, so a
 *   sync or an import of thousands is one row with its items, not thousands of rows.
 * - **Gaps:** on browser start, after an update, after an import, and when recording is turned
 *   back on, the whole tree is compared with the baseline. Differences become one record of net
 *   changes between the last time the bookmarks were seen and now, with no times or writer. The
 *   first comparison after install only takes the baseline: history starts there.
 *
 * Events are handled one at a time, in order. Nothing is undone or restored here. No React here.
 */

type RawNode = Browser.bookmarks.BookmarkTreeNode;

type ObservedEvent =
  | { type: 'created'; id: string; node: RawNode }
  | { type: 'removed'; id: string; parentId: string; index: number; node: RawNode }
  | { type: 'changed'; id: string; title: string; url?: string }
  | {
      type: 'moved';
      id: string;
      parentId: string;
      index: number;
      oldParentId: string;
      oldIndex: number;
    }
  | { type: 'reconcile'; force: boolean };

function toBaselineNode(node: RawNode): BaselineNode {
  return {
    id: node.id,
    parentId: node.parentId ?? '',
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
    type: bookmarkNodeKind(node as { url?: string; type?: string }),
  };
}

/** Every item of the tree but the invisible root, as baseline records. */
export function flattenForBaseline(tree: readonly RawNode[]): BaselineNode[] {
  const nodes: BaselineNode[] = [];
  const walk = (node: RawNode) => {
    if (node.parentId !== undefined) nodes.push(toBaselineNode(node));
    for (const child of node.children ?? []) walk(child);
  };
  for (const root of tree) walk(root);
  return nodes;
}

/** Whether recording changes from elsewhere is on (a device setting, on by default). */
async function isRecording(): Promise<boolean> {
  return (await getSettings()).historyRecordOutsideChanges;
}

async function readMeta(): Promise<ObserverMeta | undefined> {
  return (await openAuditDatabase()).get('meta', 'observer');
}

async function writeMeta(meta: ObserverMeta): Promise<void> {
  await (await openAuditDatabase()).put('meta', meta);
}

/** The ids inside `id` in the baseline, at every depth. */
async function baselineDescendants(id: string): Promise<string[]> {
  const db = await openAuditDatabase();
  const found: string[] = [];
  const queue = [id];
  while (queue.length > 0) {
    const parent = queue.shift() ?? '';
    for (const key of await db.getAllKeysFromIndex('baseline', 'parentId', parent)) {
      found.push(key);
      queue.push(key);
    }
  }
  return found;
}

const ACTION_OF_CHANGE: Record<AuditItem['change'], AuditLabel['action']> = {
  create: 'add',
  remove: 'delete',
  update: 'edit',
  move: 'move',
};

/** The label of a record from its items: one kind of change, or several. */
export function observedLabel(items: readonly AuditItem[]): AuditLabel {
  const kinds = new Set(items.map((item) => item.change));
  const [only] = kinds;
  const action = kinds.size === 1 && only ? ACTION_OF_CHANGE[only] : 'change';
  return items.length === 1 ? { action, title: items[0].title } : { action, count: items.length };
}

/**
 * Adds a change from elsewhere to the open burst's record, or starts a new record when the last
 * change is longer ago than the burst window.
 */
async function recordObserved(item: AuditItem, now: number): Promise<void> {
  const meta = (await readMeta()) ?? { key: 'observer', lastSeenAt: now };
  const open =
    meta.openRecord && now - meta.openRecord.lastEventAt <= OBSERVER_LIMITS.burstWindowMs
      ? meta.openRecord.id
      : undefined;
  const id = open ?? globalThis.crypto.randomUUID();
  const previous = open ? await getAuditDetails(id) : 'missing';
  const items = [...(typeof previous === 'string' ? [] : previous.items), item];
  const total = (typeof previous === 'string' ? 0 : previous.omitted) + items.length;
  const counts = { planned: total, applied: total, skipped: 0, failed: 0 };
  if (open) {
    await patchAuditOperation(id, (current) => ({
      ...current,
      label: observedLabel(items),
      finishedAt: now,
      counts,
    }));
  } else {
    await putAuditOperation({
      id,
      schemaVersion: AUDIT_SCHEMA_VERSION,
      startedAt: now,
      finishedAt: now,
      label: observedLabel(items),
      source: 'source_unknown',
      actor: 'unknown',
      state: 'observed',
      counts,
      verification: { status: 'not_run' },
      originConfidence: 'unattributed_event',
    });
  }
  await putAuditDetails(id, items);
  await writeMeta({ ...meta, lastSeenAt: now, openRecord: { id, lastEventAt: now } });
}

/** Marks the bookmarks as seen now, with no record open. */
async function touchMeta(now: number): Promise<void> {
  const meta = await readMeta();
  if (meta) await writeMeta({ ...meta, lastSeenAt: now });
}

/** Handles one browser event: updates the baseline and records a change from elsewhere. */
export async function handleBookmarkEvent(event: ObservedEvent, now = Date.now()): Promise<void> {
  if (event.type === 'reconcile') {
    await reconcileBookmarks({ force: event.force, now });
    return;
  }
  // Paused: the baseline stays as it was, so turning recording on again shows the difference.
  if (!(await isRecording())) return;
  // No baseline yet (the first start has not compared): nothing to say what came before.
  if (!(await readMeta())) return;
  const db = await openAuditDatabase();

  switch (event.type) {
    case 'created': {
      const node = toBaselineNode(event.node);
      const own = await takeBookmarkWriteNote(
        (intent) =>
          intent.kind === 'create' &&
          (intent.parentId === undefined || intent.parentId === node.parentId) &&
          (intent.title ?? '') === node.title &&
          (intent.url ?? undefined) === (node.url ?? undefined),
        now,
      );
      await db.put('baseline', node);
      if (own) return touchMeta(now);
      return recordObserved(
        {
          id: node.id,
          change: 'create',
          outcome: 'applied',
          title: node.title,
          ...(node.url ? { url: node.url } : {}),
          type: node.type,
          after: { parentId: node.parentId, index: event.node.index },
        },
        now,
      );
    }
    case 'removed': {
      const before = await db.get('baseline', event.id);
      const inside = await baselineDescendants(event.id);
      const own = await takeBookmarkWriteNote(
        (intent) => intent.kind === 'remove' && intent.id === event.id,
        now,
      );
      const transaction = db.transaction('baseline', 'readwrite');
      for (const id of [event.id, ...inside]) void transaction.store.delete(id);
      await transaction.done;
      if (own) return touchMeta(now);
      const node = before ?? toBaselineNode(event.node);
      return recordObserved(
        {
          id: event.id,
          change: 'remove',
          outcome: 'applied',
          title: node.title,
          ...(node.url ? { url: node.url } : {}),
          type: node.type,
          before: { parentId: event.parentId, index: event.index },
          ...(inside.length > 0 ? { descendants: inside.length } : {}),
        },
        now,
      );
    }
    case 'changed': {
      const before = await db.get('baseline', event.id);
      const own = await takeBookmarkWriteNote(
        (intent) =>
          intent.kind === 'update' &&
          intent.id === event.id &&
          (intent.title === undefined || intent.title === event.title) &&
          (intent.url === undefined || intent.url === event.url),
        now,
      );
      if (before) {
        await db.put('baseline', {
          ...before,
          title: event.title,
          ...(event.url !== undefined ? { url: event.url } : {}),
        });
      }
      if (own) return touchMeta(now);
      return recordObserved(
        {
          id: event.id,
          change: 'update',
          outcome: 'applied',
          title: event.title,
          ...(event.url ? { url: event.url } : {}),
          type: before?.type ?? (event.url ? 'bookmark' : 'folder'),
          ...(before
            ? {
                before: {
                  title: before.title,
                  ...(event.url !== undefined && before.url !== undefined
                    ? { url: before.url }
                    : {}),
                },
                after: {
                  title: event.title,
                  ...(event.url !== undefined ? { url: event.url } : {}),
                },
              }
            : { after: { title: event.title }, reason: 'before_unknown' }),
        },
        now,
      );
    }
    case 'moved': {
      const before = await db.get('baseline', event.id);
      const own = await takeBookmarkWriteNote(
        (intent) =>
          intent.kind === 'move' &&
          intent.id === event.id &&
          (intent.parentId === undefined || intent.parentId === event.parentId),
        now,
      );
      if (before) await db.put('baseline', { ...before, parentId: event.parentId });
      if (own) return touchMeta(now);
      return recordObserved(
        {
          id: event.id,
          change: 'move',
          outcome: 'applied',
          title: before?.title ?? '',
          ...(before?.url ? { url: before.url } : {}),
          type: before?.type ?? 'bookmark',
          before: { parentId: event.oldParentId, index: event.oldIndex },
          after: { parentId: event.parentId, index: event.index },
        },
        now,
      );
    }
  }
}

/** Items for what differs between the baseline and the tree now, top items only. */
export function diffBaseline(
  baseline: readonly BaselineNode[],
  current: readonly BaselineNode[],
): AuditItem[] {
  const was = new Map(baseline.map((node) => [node.id, node]));
  const now = new Map(current.map((node) => [node.id, node]));
  const countInside = (
    id: string,
    nodes: readonly BaselineNode[],
    keep: (n: BaselineNode) => boolean,
  ) => {
    let count = 0;
    const queue = [id];
    while (queue.length > 0) {
      const parent = queue.shift();
      for (const node of nodes) {
        if (node.parentId === parent && keep(node)) {
          count += 1;
          queue.push(node.id);
        }
      }
    }
    return count;
  };
  const items: AuditItem[] = [];
  for (const node of current) {
    const old = was.get(node.id);
    if (!old) {
      // An item added inside another added folder is counted in that folder.
      if (was.has(node.parentId) || !now.has(node.parentId)) {
        const inside = countInside(node.id, current, (child) => !was.has(child.id));
        items.push({
          id: node.id,
          change: 'create',
          outcome: 'applied',
          title: node.title,
          ...(node.url ? { url: node.url } : {}),
          type: node.type,
          after: { parentId: node.parentId },
          ...(inside > 0 ? { descendants: inside } : {}),
        });
      }
      continue;
    }
    if (old.title !== node.title || (old.url ?? '') !== (node.url ?? '')) {
      items.push({
        id: node.id,
        change: 'update',
        outcome: 'applied',
        title: node.title,
        ...(node.url ? { url: node.url } : {}),
        type: node.type,
        before: { title: old.title, ...(old.url !== node.url && old.url ? { url: old.url } : {}) },
        after: {
          title: node.title,
          ...(old.url !== node.url && node.url ? { url: node.url } : {}),
        },
      });
    }
    if (old.parentId !== node.parentId) {
      items.push({
        id: node.id,
        change: 'move',
        outcome: 'applied',
        title: node.title,
        ...(node.url ? { url: node.url } : {}),
        type: node.type,
        before: { parentId: old.parentId },
        after: { parentId: node.parentId },
      });
    }
  }
  for (const old of baseline) {
    if (now.has(old.id) || (was.has(old.parentId) && !now.has(old.parentId))) continue;
    const inside = countInside(old.id, baseline, (child) => !now.has(child.id));
    items.push({
      id: old.id,
      change: 'remove',
      outcome: 'applied',
      title: old.title,
      ...(old.url ? { url: old.url } : {}),
      type: old.type,
      before: { parentId: old.parentId },
      ...(inside > 0 ? { descendants: inside } : {}),
    });
  }
  return items;
}

/**
 * Compares the whole tree with the baseline, records what differs as one record of net changes
 * since the bookmarks were last seen, and takes the tree as the new baseline. Without a baseline
 * (first start) it only takes one. Unless `force`, skipped when the last comparison is recent.
 */
export async function reconcileBookmarks({
  force = false,
  now = Date.now(),
}: {
  force?: boolean;
  now?: number;
} = {}): Promise<void> {
  if (!(await isRecording())) return;
  const meta = await readMeta();
  if (meta && !force && now - meta.lastSeenAt < OBSERVER_LIMITS.reconcileMinIntervalMs) return;
  const current = flattenForBaseline(await fetchRawBookmarkTree());
  const db = await openAuditDatabase();
  if (meta) {
    const items = diffBaseline(await db.getAll('baseline'), current);
    if (items.length > 0) {
      const id = globalThis.crypto.randomUUID();
      await putAuditOperation({
        id,
        schemaVersion: AUDIT_SCHEMA_VERSION,
        startedAt: now,
        finishedAt: now,
        label: observedLabel(items),
        source: 'reconciliation',
        actor: 'unknown',
        state: 'observed',
        counts: { planned: items.length, applied: items.length, skipped: 0, failed: 0 },
        verification: { status: 'not_run' },
        originConfidence: 'inferred_net_diff',
        observedSince: meta.lastSeenAt,
      });
      await putAuditDetails(id, items);
    }
  }
  const transaction = db.transaction(['baseline', 'meta'], 'readwrite');
  void transaction.objectStore('baseline').clear();
  for (const node of current) void transaction.objectStore('baseline').put(node);
  void transaction.objectStore('meta').put({ key: 'observer', lastSeenAt: now });
  await transaction.done;
}

let queue: Promise<void> = Promise.resolve();
/** While the browser imports, single events are skipped; one comparison follows at the end. */
let importing = false;

/** Handles events one at a time, in the order the browser sent them; a failure skips one. */
function enqueue(event: ObservedEvent): void {
  if (importing && event.type !== 'reconcile') return;
  queue = queue
    .then(() => handleBookmarkEvent(event))
    .catch((error: unknown) => console.error('[Observer] Bookmark event not recorded:', error));
}

/**
 * Starts the observer. Call synchronously at background start, so the browser can wake the
 * background for a bookmark event and deliver it here. Events the browser does not have (import
 * events in Firefox) are skipped.
 */
export function registerBookmarkObserver(): void {
  const api = browser.bookmarks;
  api.onCreated.addListener((id, node) => enqueue({ type: 'created', id, node }));
  api.onRemoved.addListener((id, info) =>
    enqueue({ type: 'removed', id, parentId: info.parentId, index: info.index, node: info.node }),
  );
  api.onChanged.addListener((id, info) =>
    enqueue({ type: 'changed', id, title: info.title, ...(info.url ? { url: info.url } : {}) }),
  );
  api.onMoved.addListener((id, info) => enqueue({ type: 'moved', id, ...info }));
  api.onImportBegan?.addListener(() => {
    importing = true;
  });
  api.onImportEnded?.addListener(() => {
    importing = false;
    enqueue({ type: 'reconcile', force: true });
  });
  browser.runtime.onStartup.addListener(() => enqueue({ type: 'reconcile', force: true }));
  browser.runtime.onInstalled.addListener(() => enqueue({ type: 'reconcile', force: true }));
  // A background that starts again on its own compares too, but not more often than configured.
  enqueue({ type: 'reconcile', force: false });
  let recording: boolean | undefined;
  subscribeToSettings((settings) => {
    // Turned on again: record what changed while it was off.
    if (settings.historyRecordOutsideChanges && recording === false) {
      enqueue({ type: 'reconcile', force: true });
    }
    recording = settings.historyRecordOutsideChanges;
  });
}
