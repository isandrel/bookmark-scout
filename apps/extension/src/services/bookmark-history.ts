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
 * No React here: the background may record changes too.
 */
import { z } from 'zod';

const historyConfig = readConfig(
  'bookmarks/history',
  z.strictObject({
    max_entries: z.number().int().positive(),
    max_bytes: z.number().int().positive(),
  }),
);

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

export type BookmarkHistory = {
  /** Oldest first; the last entry is the next undo. */
  undo: BookmarkHistoryEntry[];
  /** Oldest first; the last entry is the next redo. */
  redo: BookmarkHistoryEntry[];
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
const entrySchema = z.object({
  id: z.string(),
  label: z.object({
    action: z.enum(['add', 'edit', 'move', 'delete', 'sort', 'change']),
    title: z.string().optional(),
    count: z.number().int().positive().optional(),
  }),
  operations: z.array(operationSchema).min(1),
});
const historySchema = z.object({ undo: z.array(entrySchema), redo: z.array(entrySchema) });

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
  limits: { maxEntries: number; maxBytes: number } = {
    maxEntries: historyConfig.max_entries,
    maxBytes: historyConfig.max_bytes,
  },
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

/** Rewrites every id in `history` that `ids` maps to a new one (a recreated bookmark). */
export function remapBookmarkHistoryIds(
  history: BookmarkHistory,
  ids: ReadonlyMap<string, string>,
): BookmarkHistory {
  if (ids.size === 0) return history;
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
  const entry = (value: BookmarkHistoryEntry) => ({
    ...value,
    operations: value.operations.map(operation),
  });
  return { undo: history.undo.map(entry), redo: history.redo.map(entry) };
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
  };
}

/** A recorded change; `stored` is false when it was too large for the history. */
export type RecordedBookmarkChange = { entry: BookmarkHistoryEntry; stored: boolean };

/**
 * Runs `write` with a writer that records what it changes, and adds it to the history as one
 * entry (clearing what could be redone). Changes made before `write` threw are recorded too,
 * then the error is passed on. Resolves to what `write` returned and the recorded change, which
 * is null when nothing changed.
 */
export async function recordBookmarkWrites<T>(
  label: BookmarkHistoryLabel,
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
        label: completeLabel(label, operations),
        operations,
      };
      // The bookmarks changed either way; a history that cannot be stored only loses undo.
      const stored = await bookmarkHistoryValue
        .update((history) => trimBookmarkHistory({ undo: [...history.undo, entry], redo: [] }))
        .then((history) => history.undo.some((kept) => kept.id === entry.id))
        .catch((error: unknown) => {
          console.error('Failed to record bookmark change:', error);
          return false;
        });
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
  const updated = remapBookmarkHistoryIds(
    { undo: [{ ...entry, operations }], redo: [] },
    result.ids,
  ).undo[0];
  return { ...result, entry: updated };
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
    const entry = from[position];
    if (!entry) return history;
    const replayed = await replayEntry(entry, direction);
    outcome = { label: entry.label, applied: replayed.applied, skipped: replayed.skipped };
    const rest = from.filter((_, index) => index !== position);
    // Undoing an older entry out of order (a toast's Undo) drops what could be redone.
    const outOfOrder = position !== from.length - 1;
    const next: BookmarkHistory =
      direction === 'undo'
        ? {
            undo: rest,
            redo: outOfOrder ? [] : [...history.redo, replayed.entry],
          }
        : { undo: [...history.undo, replayed.entry], redo: rest };
    return trimBookmarkHistory(remapBookmarkHistoryIds(next, replayed.ids));
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

/** Message for one item (its title), and for several (their count) where that can happen. */
const LABEL_KEYS: Record<BookmarkHistoryAction, { one: MessageKey; many?: MessageKey }> = {
  add: { one: 'history_add', many: 'history_addMany' },
  edit: { one: 'history_edit' },
  move: { one: 'history_move', many: 'history_moveMany' },
  delete: { one: 'history_delete', many: 'history_deleteMany' },
  sort: { one: 'history_sort' },
  change: { one: 'history_change', many: 'history_changeMany' },
};

/** What an entry did, in the current language: `Delete "News"`, `Move 3 items`. */
export function describeBookmarkHistoryLabel(label: BookmarkHistoryLabel): string {
  const { one, many } = LABEL_KEYS[label.action];
  if (many && (label.count ?? 1) > 1) return t(many, String(label.count));
  return t(one, getBookmarkDisplayTitle(label.title));
}
