/**
 * Undo and redo for bookmark changes, shared by every manager tab and kept for the browser
 * session (`STORAGE_ITEMS.bookmarkHistory`, session area), like Chrome's own manager: reloading
 * the page keeps it, closing the browser ends it.
 *
 * Changes are made through `recordBookmarkWrites(label, write)`: `write` gets a `BookmarkWriter`
 * whose `create`, `update`, `move`, and `remove` change the bookmarks and note what they did, and
 * everything one call did is one entry, undone and redone together. Anything that changes
 * bookmarks for the user (the manager today, AI tools later) records through it.
 *
 * Undo and redo read each bookmark again first and skip an operation whose bookmark changed since
 * (edited, moved, or deleted elsewhere), so they never overwrite a newer change; the outcome says
 * how many were skipped. A bookmark recreated by undo or redo gets a new id from the browser, and
 * every entry that named the old id is rewritten to the new one, so older entries keep working.
 *
 * The history has a size limit (`config/bookmarks/history.toml`). A large entry, such as a
 * deleted folder with thousands of bookmarks, is stored gzip-compressed; the oldest entries make
 * room for a new one; and an entry too large even on its own is not stored, leaving the earlier
 * ones as they were (`RecordedBookmarkChange.stored` says so, and its toast says it).
 *
 * No React here: the background may record changes too.
 */
import { z } from 'zod';

const historyConfig = readConfig(
  'bookmarks/history',
  z.strictObject({
    max_entries: z.number().int().positive(),
    max_bytes: z.number().int().positive(),
    compress_above_bytes: z.number().int().positive(),
  }),
);

type HistoryLimits = { maxEntries: number; maxBytes: number };

const HISTORY_LIMITS: HistoryLimits = {
  maxEntries: historyConfig.max_entries,
  maxBytes: historyConfig.max_bytes,
};

/** Where an item sits: its folder and its position among the folder's children. */
export type BookmarkPlace = {
  parentId: string;
  index: number;
  /**
   * The siblings it sat between, for a removed item: recreating it next to them, when they are
   * still there, keeps the order when deletions are undone out of order (a toast's Undo).
   */
  previousId?: string;
  nextId?: string;
};

/** What a history entry says it did, kept as ids and counts so it shows in the current language. */
/** `change`: several kinds at once, such as an AI agent's approved plan. */
export type BookmarkHistoryAction = 'add' | 'edit' | 'move' | 'delete' | 'sort' | 'change';

export type BookmarkHistoryLabel = {
  action: BookmarkHistoryAction;
  /** The item's title for a single item, or the folder's for a sort. */
  title?: string;
  /** How many items the change was about; one when absent. */
  count?: number;
  /**
   * The message key of the title of the Tools sidebar tool that made the change
   * (`tools_findDuplicates`), named next to what it did.
   */
  tool?: string;
};

export type BookmarkHistoryOperation =
  | { kind: 'create'; at: BookmarkPlace; node: RecoverableBookmarkNode }
  | { kind: 'remove'; at: BookmarkPlace; node: RecoverableBookmarkNode }
  | { kind: 'update'; id: string; before: BookmarkFields; after: BookmarkFields }
  | { kind: 'move'; id: string; from: BookmarkPlace; to: BookmarkPlace };

export type BookmarkHistoryEntry = {
  id: string;
  label: BookmarkHistoryLabel;
  operations: BookmarkHistoryOperation[];
};

/** A large entry as stored: its operations as gzip-compressed JSON, in base64. */
export type PackedBookmarkHistoryEntry = {
  id: string;
  label: BookmarkHistoryLabel;
  packed: string;
};

export type StoredBookmarkHistoryEntry = BookmarkHistoryEntry | PackedBookmarkHistoryEntry;

export type BookmarkHistory = {
  /** Oldest first; the last entry is the next undo. */
  undo: StoredBookmarkHistoryEntry[];
  /** Oldest first; the last entry is the next redo. */
  redo: StoredBookmarkHistoryEntry[];
};

export type BookmarkHistoryOutcome = {
  label: BookmarkHistoryLabel;
  /** Operations undone or redone. */
  applied: number;
  /** Operations left alone because their bookmark changed since, or the browser refused them. */
  skipped: number;
};

const placeSchema = z.object({
  parentId: z.string(),
  index: z.number().int().nonnegative(),
  previousId: z.string().optional(),
  nextId: z.string().optional(),
});
const fieldsSchema = z.object({ title: z.string().optional(), url: z.string().optional() });
const nodeSchema: z.ZodType<RecoverableBookmarkNode> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    title: z.string(),
    url: z.string().optional(),
    index: z.number().int().optional(),
    type: z.literal('separator').optional(),
    metadata: z
      .object({ tags: z.array(z.string()).optional(), summary: z.string().optional() })
      .optional(),
    children: z.array(nodeSchema).optional(),
  }),
);
const operationSchema: z.ZodType<BookmarkHistoryOperation> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), at: placeSchema, node: nodeSchema }),
  z.object({ kind: z.literal('remove'), at: placeSchema, node: nodeSchema }),
  z.object({
    kind: z.literal('update'),
    id: z.string(),
    before: fieldsSchema,
    after: fieldsSchema,
  }),
  z.object({ kind: z.literal('move'), id: z.string(), from: placeSchema, to: placeSchema }),
]);
const labelSchema = z.object({
  action: z.enum(['add', 'edit', 'move', 'delete', 'sort', 'change']),
  title: z.string().optional(),
  count: z.number().int().positive().optional(),
  tool: z.string().optional(),
});
const entrySchema: z.ZodType<StoredBookmarkHistoryEntry> = z.union([
  z.object({ id: z.string(), label: labelSchema, operations: z.array(operationSchema).min(1) }),
  z.object({ id: z.string(), label: labelSchema, packed: z.string().min(1) }),
]);
const historySchema = z.object({ undo: z.array(entrySchema), redo: z.array(entrySchema) });
const operationsSchema = z.array(operationSchema).min(1);

const isPacked = (entry: StoredBookmarkHistoryEntry): entry is PackedBookmarkHistoryEntry =>
  'packed' in entry;

/** The entry as stored: compressed when its JSON is larger than `compress_above_bytes`. */
export async function packBookmarkHistoryEntry(
  entry: StoredBookmarkHistoryEntry,
): Promise<StoredBookmarkHistoryEntry> {
  if (isPacked(entry)) return entry;
  const json = JSON.stringify(entry.operations);
  if (json.length <= historyConfig.compress_above_bytes) return entry;
  return { id: entry.id, label: entry.label, packed: await gzipToBase64(json) };
}

/** The entry with its operations, whether it was stored compressed or not. */
export async function unpackBookmarkHistoryEntry(
  entry: StoredBookmarkHistoryEntry,
): Promise<BookmarkHistoryEntry> {
  if (!isPacked(entry)) return entry;
  const operations = operationsSchema.parse(JSON.parse(await gunzipFromBase64(entry.packed)));
  return { id: entry.id, label: entry.label, operations };
}

/** Whether a history holding only `entry` stays within the size limit. */
function fitsAlone(entry: StoredBookmarkHistoryEntry, limits: HistoryLimits): boolean {
  return JSON.stringify({ undo: [entry], redo: [] }).length <= limits.maxBytes;
}

const EMPTY_HISTORY: BookmarkHistory = { undo: [], redo: [] };

export const bookmarkHistoryValue = defineStoredValue<BookmarkHistory>(
  STORAGE_ITEMS.bookmarkHistory,
  {
    schema: historySchema,
    empty: EMPTY_HISTORY,
    isEmpty: (history) => history.undo.length === 0 && history.redo.length === 0,
  },
);

/** Drops the oldest entries (undo first, then redo) until the history fits its limits. */
export function trimBookmarkHistory(
  history: BookmarkHistory,
  limits: HistoryLimits = HISTORY_LIMITS,
): BookmarkHistory {
  const undo = history.undo.slice(-limits.maxEntries);
  const redo = history.redo.slice(-limits.maxEntries);
  const size = () => JSON.stringify({ undo, redo }).length;
  while (size() > limits.maxBytes && (undo.length > 0 || redo.length > 0)) {
    if (undo.length > 0) undo.shift();
    else redo.shift();
  }
  return { undo, redo };
}

/**
 * Rewrites every id in `history` that `ids` maps to a new one (a recreated bookmark), in
 * compressed entries too.
 */
export async function remapBookmarkHistoryIds(
  history: BookmarkHistory,
  ids: ReadonlyMap<string, string>,
): Promise<BookmarkHistory> {
  if (ids.size === 0) return history;
  const remap = async (entry: StoredBookmarkHistoryEntry) =>
    isPacked(entry)
      ? packBookmarkHistoryEntry(remapEntryIds(await unpackBookmarkHistoryEntry(entry), ids))
      : remapEntryIds(entry, ids);
  return {
    undo: await Promise.all(history.undo.map(remap)),
    redo: await Promise.all(history.redo.map(remap)),
  };
}

function remapEntryIds(
  entry: BookmarkHistoryEntry,
  ids: ReadonlyMap<string, string>,
): BookmarkHistoryEntry {
  const id = (value: string) => ids.get(value) ?? value;
  const place = (at: BookmarkPlace): BookmarkPlace => ({
    ...at,
    parentId: id(at.parentId),
    ...(at.previousId ? { previousId: id(at.previousId) } : {}),
    ...(at.nextId ? { nextId: id(at.nextId) } : {}),
  });
  const node = (value: RecoverableBookmarkNode): RecoverableBookmarkNode => ({
    ...value,
    ...(value.id ? { id: id(value.id) } : {}),
    ...(value.children ? { children: value.children.map(node) } : {}),
  });
  const operation = (op: BookmarkHistoryOperation): BookmarkHistoryOperation => {
    switch (op.kind) {
      case 'create':
      case 'remove':
        return { ...op, at: place(op.at), node: node(op.node) };
      case 'update':
        return { ...op, id: id(op.id) };
      case 'move':
        return { ...op, id: id(op.id), from: place(op.from), to: place(op.to) };
    }
  };
  return { ...entry, operations: entry.operations.map(operation) };
}

/** Changes bookmarks and notes each change, for one history entry. */
export type BookmarkWriter = {
  create: (details: {
    parentId: string;
    index?: number;
    title: string;
    url?: string;
  }) => Promise<Browser.bookmarks.BookmarkTreeNode>;
  update: (id: string, changes: BookmarkFields) => Promise<void>;
  move: (id: string, to: { parentId: string; index?: number }) => Promise<void>;
  /**
   * Moves the item into `parentId` right before `beforeId`, or to the end when it is null or no
   * longer there; the same in every browser, whatever its move index counts.
   */
  moveBefore: (id: string, parentId: string, beforeId: string | null) => Promise<void>;
  /** Removes the item and everything inside it; undo recreates it with its tags and summary. */
  remove: (id: string) => Promise<void>;
};

function placeOf(node: Browser.bookmarks.BookmarkTreeNode): BookmarkPlace {
  if (!node.parentId) throw new Error(t('error_bookmarkNoParent'));
  return { parentId: node.parentId, index: node.index ?? 0 };
}

/** The bookmark or folder without its subtree (cheap for large folders), if it still exists. */
function readNode(id: string): Promise<Browser.bookmarks.BookmarkTreeNode | undefined> {
  return getBookmark(id).catch(() => undefined);
}

/** Where `id` sits now, with its neighbors, before it is removed. */
async function placeWithNeighbors(id: string, parentId: string): Promise<BookmarkPlace> {
  const siblings = await getBookmarkChildren(parentId);
  const index = Math.max(
    0,
    siblings.findIndex((sibling) => sibling.id === id),
  );
  const previousId = siblings[index - 1]?.id;
  const nextId = siblings[index + 1]?.id;
  return {
    parentId,
    index,
    ...(previousId ? { previousId } : {}),
    ...(nextId ? { nextId } : {}),
  };
}

/** The index to recreate an item at: next to a neighbor that is still there, else its old one. */
function restoreIndex(at: BookmarkPlace, siblings: readonly { id: string }[]): number {
  const previous = at.previousId ? siblings.findIndex((s) => s.id === at.previousId) : -1;
  if (previous >= 0) return previous + 1;
  const next = at.nextId ? siblings.findIndex((s) => s.id === at.nextId) : -1;
  if (next >= 0) return next;
  return Math.min(at.index, siblings.length);
}

function createWriter(operations: BookmarkHistoryOperation[]): BookmarkWriter {
  return {
    async create(details) {
      const created = await createBookmark(details);
      operations.push({
        kind: 'create',
        at: placeOf(created),
        node: {
          id: created.id,
          title: created.title,
          ...(created.url ? { url: created.url } : {}),
        },
      });
      return created;
    },
    async update(id, changes) {
      const live = await readNode(id);
      if (!live) throw new Error(t('error_bookmarkNotFound'));
      const before = Object.fromEntries(
        (Object.keys(changes) as (keyof BookmarkFields)[]).map((field) => [field, live[field]]),
      ) as BookmarkFields;
      await updateBookmark(id, changes);
      operations.push({ kind: 'update', id, before, after: changes });
    },
    async move(id, to) {
      const live = await readNode(id);
      if (!live) throw new Error(t('error_bookmarkNotFound'));
      const from = placeOf(live);
      const moved = await moveBookmark(id, to);
      operations.push({ kind: 'move', id, from, to: placeOf(moved) });
    },
    async moveBefore(id, parentId, beforeId) {
      const live = await readNode(id);
      if (!live) throw new Error(t('error_bookmarkNotFound'));
      const from = placeOf(live);
      const siblings = await getBookmarkChildren(parentId);
      const before = beforeId ? siblings.findIndex((sibling) => sibling.id === beforeId) : -1;
      const position = before < 0 ? siblings.length : before;
      // Leaving its own place shifts everything after it up by one.
      const final = live.parentId === parentId && from.index < position ? position - 1 : position;
      const moved = await moveBookmarkToPosition(id, { parentId, index: final });
      operations.push({ kind: 'move', id, from, to: placeOf(moved) });
    },
    async remove(id) {
      const { parentId, node } = await captureBookmarkSubtree(id, { keepIds: true });
      const at = await placeWithNeighbors(id, parentId);
      await deleteBookmark(id);
      operations.push({ kind: 'remove', at, node });
    },
  };
}

function newEntryId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/**
 * The label with what the operations tell: how many items (when it was more than one and the
 * caller did not say), and the title of an added or deleted item.
 */
function completeLabel(
  label: BookmarkHistoryLabel,
  operations: readonly BookmarkHistoryOperation[],
): BookmarkHistoryLabel {
  const [first] = operations;
  const title =
    label.title ??
    (first?.kind === 'create' || first?.kind === 'remove' ? first.node.title : undefined);
  const count = label.count ?? (operations.length > 1 ? operations.length : undefined);
  return {
    action: label.action,
    ...(title !== undefined ? { title } : {}),
    ...(count !== undefined ? { count } : {}),
    ...(label.tool !== undefined ? { tool: label.tool } : {}),
  };
}

/**
 * A recorded change; `stored` is false when it could not be kept in the history (too large even
 * compressed, or storage failed), so only the caller's own undo (a toast's) can undo it.
 */
export type RecordedBookmarkChange = { entry: BookmarkHistoryEntry; stored: boolean };

/**
 * Adds `entry` as the newest change (clearing what could be redone), dropping the oldest changes
 * when it needs their room. A change too large for the history even on its own is left out, and
 * every earlier change is kept.
 */
async function addBookmarkHistoryEntry(
  entry: BookmarkHistoryEntry,
  limits: HistoryLimits,
): Promise<boolean> {
  const packed = await packBookmarkHistoryEntry(entry);
  if (!fitsAlone(packed, limits)) {
    console.warn('A bookmark change is too large for the undo history; earlier changes are kept.');
    await bookmarkHistoryValue.update((history) =>
      history.redo.length === 0 ? history : { undo: history.undo, redo: [] },
    );
    return false;
  }
  const history = await bookmarkHistoryValue.update((current) =>
    trimBookmarkHistory({ undo: [...current.undo, packed], redo: [] }, limits),
  );
  return history.undo.some((kept) => kept.id === entry.id);
}

/**
 * Runs `write` with a writer that records what it changes, and adds it to the history as one
 * entry (clearing what could be redone). Changes made before `write` threw are recorded too,
 * then the error is passed on. Resolves to what `write` returned and the recorded change, which
 * is null when nothing changed. `label` can be a function, read once `write` finished, for a
 * label that depends on what was written.
 */
export async function recordBookmarkWrites<T>(
  label: BookmarkHistoryLabel | (() => BookmarkHistoryLabel),
  write: (writer: BookmarkWriter) => Promise<T>,
): Promise<{ result: T; recorded: RecordedBookmarkChange | null }> {
  const operations: BookmarkHistoryOperation[] = [];
  let recorded: RecordedBookmarkChange | null = null;
  let result: T;
  try {
    result = await write(createWriter(operations));
  } finally {
    if (operations.length > 0) {
      const entry: BookmarkHistoryEntry = {
        id: newEntryId(),
        label: completeLabel(typeof label === 'function' ? label() : label, operations),
        operations,
      };
      // The bookmarks changed either way; a history that cannot be stored only loses undo.
      const stored = await addBookmarkHistoryEntry(entry, HISTORY_LIMITS).catch(
        (error: unknown) => {
          console.error('Failed to record bookmark change:', error);
          return false;
        },
      );
      recorded = { entry, stored };
    }
  }
  return { result, recorded };
}

type StepResult = { applied: number; skipped: number; ids: Map<string, string> };

function sameFields(live: Browser.bookmarks.BookmarkTreeNode, fields: BookmarkFields) {
  return (Object.keys(fields) as (keyof BookmarkFields)[]).every(
    (field) => (live[field] ?? undefined) === (fields[field] ?? undefined),
  );
}

/** The children of folder `parentId`, or undefined when it is gone or not a folder. */
async function liveFolderChildren(parentId: string) {
  const folder = await readNode(parentId);
  if (!folder || folder.url) return undefined;
  return getBookmarkChildren(parentId);
}

async function removeIfUnchanged(
  node: RecoverableBookmarkNode,
): Promise<{ node: RecoverableBookmarkNode; at: BookmarkPlace } | undefined> {
  if (!node.id) return undefined;
  const live = await readNode(node.id);
  if (
    !live?.parentId ||
    live.title !== node.title ||
    (live.url ?? undefined) !== (node.url ?? undefined)
  ) {
    return undefined;
  }
  // A folder that gained items since is left alone: removing it would take them too.
  const children = live.url ? [] : await getBookmarkChildren(node.id);
  if (children.length > (node.children?.length ?? 0)) return undefined;
  const { node: current } = await captureBookmarkSubtree(node.id, { keepIds: true });
  const at = await placeWithNeighbors(node.id, live.parentId);
  await deleteBookmark(node.id);
  return { node: current, at };
}

async function recreateAt(node: RecoverableBookmarkNode, at: BookmarkPlace) {
  const siblings = await liveFolderChildren(at.parentId);
  if (!siblings) return undefined;
  return recreateBookmarkSubtree(node, at.parentId, restoreIndex(at, siblings));
}

async function moveIfAt(id: string, expected: BookmarkPlace, target: BookmarkPlace) {
  const live = await readNode(id);
  // An item moved again since is left where the user put it.
  if (!live || live.parentId !== expected.parentId) return false;
  if (!(await liveFolderChildren(target.parentId))) return false;
  await moveBookmarkToPosition(id, target);
  return true;
}

/**
 * Undoes (`direction` 'undo', newest operation first) or redoes ('redo', in order) one entry's
 * operations. Returns the entry as it should be stored afterwards (snapshots taken now, so the
 * next redo or undo restores the bookmarks as they are now) and how many operations ran.
 */
async function replayEntry(
  entry: BookmarkHistoryEntry,
  direction: 'undo' | 'redo',
): Promise<{ entry: BookmarkHistoryEntry } & StepResult> {
  const result: StepResult = { applied: 0, skipped: 0, ids: new Map() };
  const operations = [...entry.operations];
  const order = direction === 'undo' ? [...operations.keys()].reverse() : [...operations.keys()];
  const mapped = (id: string) => result.ids.get(id) ?? id;
  for (const position of order) {
    const op = operations[position];
    try {
      let done = false;
      const removing = (op.kind === 'create') === (direction === 'undo');
      if (op.kind === 'create' || op.kind === 'remove') {
        const at = { ...op.at, parentId: mapped(op.at.parentId) };
        const node = op.node.id ? { ...op.node, id: mapped(op.node.id) } : op.node;
        if (removing) {
          const removed = await removeIfUnchanged(node);
          if (removed) {
            operations[position] = { ...op, at: removed.at, node: removed.node };
            done = true;
          }
        } else {
          const recreated = await recreateAt(node, at);
          if (recreated) {
            for (const [oldId, newId] of recreated.ids) result.ids.set(oldId, newId);
            operations[position] = { ...op, at, node };
            done = true;
          }
        }
      } else if (op.kind === 'update') {
        const id = mapped(op.id);
        const [expected, target] =
          direction === 'undo' ? [op.after, op.before] : [op.before, op.after];
        const live = await readNode(id);
        if (live && sameFields(live, expected)) {
          await updateBookmark(id, target);
          done = true;
        }
      } else {
        const id = mapped(op.id);
        const from = { ...op.from, parentId: mapped(op.from.parentId) };
        const to = { ...op.to, parentId: mapped(op.to.parentId) };
        done = direction === 'undo' ? await moveIfAt(id, to, from) : await moveIfAt(id, from, to);
      }
      if (done) result.applied += 1;
      else result.skipped += 1;
    } catch {
      result.skipped += 1;
    }
  }
  return { ...result, entry: remapEntryIds({ ...entry, operations }, result.ids) };
}

async function step(
  direction: 'undo' | 'redo',
  entryId?: string,
): Promise<BookmarkHistoryOutcome | null> {
  let outcome = null as BookmarkHistoryOutcome | null;
  await bookmarkHistoryValue.update(async (history) => {
    const from = direction === 'undo' ? history.undo : history.redo;
    const position =
      entryId === undefined
        ? from.length - 1
        : from.findIndex((candidate) => candidate.id === entryId);
    const stored = from[position];
    if (!stored) return history;
    const entry = await unpackBookmarkHistoryEntry(stored);
    const replayed = await replayEntry(entry, direction);
    outcome = { label: entry.label, applied: replayed.applied, skipped: replayed.skipped };
    const rest = from.filter((_, index) => index !== position);
    // Undoing an older entry out of order (a toast's Undo) drops what could be redone.
    const outOfOrder = position !== from.length - 1;
    const moved = await packBookmarkHistoryEntry(replayed.entry);
    const next: BookmarkHistory =
      direction === 'undo'
        ? { undo: rest, redo: outOfOrder ? [] : [...history.redo, moved] }
        : { undo: [...history.undo, moved], redo: rest };
    return trimBookmarkHistory(await remapBookmarkHistoryIds(next, replayed.ids));
  });
  return outcome;
}

/** Undoes the newest change, or the entry `entryId` (a toast's Undo); null when there is none. */
export function undoBookmarkChange(entryId?: string): Promise<BookmarkHistoryOutcome | null> {
  return step('undo', entryId);
}

/** Redoes the change undone last; null when there is none. */
export function redoBookmarkChange(): Promise<BookmarkHistoryOutcome | null> {
  return step('redo');
}

/**
 * Undoes a change right after it was made (a toast's Undo), also when it was too large for the
 * history. Null when the history no longer offers it, for example because Ctrl+Z undid it first.
 */
export async function undoRecordedBookmarkChange({
  entry,
  stored,
}: RecordedBookmarkChange): Promise<BookmarkHistoryOutcome | null> {
  if (stored) return undoBookmarkChange(entry.id);
  const replayed = await replayEntry(entry, 'undo');
  return { label: entry.label, applied: replayed.applied, skipped: replayed.skipped };
}

/** The entry `entryId` while it can still be undone, or undefined (undone already, or dropped). */
export async function getUndoableBookmarkChange(
  entryId: string,
): Promise<BookmarkHistoryEntry | undefined> {
  const stored = (await bookmarkHistoryValue.get()).undo.find((entry) => entry.id === entryId);
  return stored ? unpackBookmarkHistoryEntry(stored) : undefined;
}

/** Items inside a recorded folder, at every depth. */
function countRecordedItems(node: RecoverableBookmarkNode): number {
  return (node.children ?? []).reduce((sum, child) => sum + 1 + countRecordedItems(child), 0);
}

/**
 * What undoing `entry` would do, one line per operation in the order undo runs them, in the
 * current language: `Move “Docs” back to Work`. Titles are read from the bookmarks as they are
 * now, for the approval an agent's undo waits for.
 */
export async function describeBookmarkChangeUndo(entry: BookmarkHistoryEntry): Promise<string[]> {
  const titleOf = async (id: string) => getBookmarkDisplayTitle((await readNode(id))?.title);
  const lines: string[] = [];
  for (const op of [...entry.operations].reverse()) {
    if (op.kind === 'create' || op.kind === 'remove') {
      const title = getBookmarkDisplayTitle(op.node.title);
      const inside = countRecordedItems(op.node);
      if (op.kind === 'create') {
        lines.push(
          inside > 0
            ? t('history_undoRemoveFolder', [title, String(inside)])
            : t('history_undoRemove', title),
        );
      } else {
        lines.push(t('history_undoRestore', [title, await titleOf(op.at.parentId)]));
      }
    } else if (op.kind === 'update') {
      const current = op.after.title ?? (await titleOf(op.id));
      if (op.before.title !== undefined && op.before.title !== op.after.title) {
        lines.push(t('history_undoRename', [current, getBookmarkDisplayTitle(op.before.title)]));
      }
      if (op.before.url !== undefined && op.before.url !== op.after.url) {
        lines.push(t('history_undoAddress', [current, op.before.url]));
      }
    } else {
      lines.push(t('history_undoMove', [await titleOf(op.id), await titleOf(op.from.parentId)]));
    }
  }
  return lines;
}

/** Message for one item (its title), and for several (their count) where that can happen. */
const LABEL_KEYS: Record<BookmarkHistoryAction, { one: MessageKey; many?: MessageKey }> = {
  add: { one: 'history_add', many: 'history_addMany' },
  edit: { one: 'history_edit', many: 'qaManager_editMany' },
  move: { one: 'history_move', many: 'history_moveMany' },
  delete: { one: 'history_delete', many: 'history_deleteMany' },
  sort: { one: 'history_sort' },
  change: { one: 'history_change', many: 'history_changeMany' },
};

/**
 * What an entry did, in the current language: `Delete "News"`, `Move 3 items`, and the tool that
 * did it when one did: `Delete 3 items (Duplicate Cleaner)`.
 */
export function describeBookmarkHistoryLabel(label: BookmarkHistoryLabel): string {
  const { one, many } = LABEL_KEYS[label.action];
  const what =
    many && label.count !== undefined && label.count > 1
      ? tPlural(many, label.count)
      : t(one, getBookmarkDisplayTitle(label.title));
  return label.tool ? t('qaManager_byTool', [what, t(label.tool)]) : what;
}
