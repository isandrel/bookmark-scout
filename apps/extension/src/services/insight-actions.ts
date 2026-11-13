/**
 * What the bookmark manager tells the user about the library, as read actions for agents and
 * Bookmark Scout's own pages: the History of changes (`bookmark-audit-store.ts`, worded as the
 * History dialog words it), Statistics, and the AI Context Packer's text, each with the user's
 * own settings for that tool (`getToolOptions`). None of them changes anything.
 *
 * Backups are left out on purpose: a backup file holds the AI services' keys and the settings
 * only the user may change (`guarded_settings`), so saving and restoring one stays in Options.
 */
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const changeView = (operation: AuditOperation) => ({
  id: operation.id,
  at: new Date(operation.startedAt).toISOString(),
  what: describeAuditOperation(operation),
  summary: summarizeAuditOperation(operation),
  by: operation.actor,
  ...(operation.actorLabel ? { agent: operation.actorLabel } : {}),
  state: operation.state,
  ...(operation.undo ? { undone: true } : {}),
});

const changeOutput = z.object({
  id: z.string(),
  at: z.string(),
  what: z.string().describe(agentText('history_view.what')),
  summary: z.string().describe(agentText('history_view.summary')),
  by: z.enum(AUDIT_ACTORS).describe(agentText('history_view.by')),
  agent: z.string().optional().describe(agentText('history_view.agent')),
  state: z.enum(AUDIT_STATES),
  undone: z.boolean().optional(),
});

const listHistory = defineAction({
  risk: 'read',
  labelKey: 'actionName_listHistory',
  targets: ['library'],
  agent: { description: agentText('list_history.agent_description') },
  input: z.object({ cursor: z.string().optional().describe(agentText('cursor_input.self')) }),
  output: z.object({
    changes: z.array(changeOutput),
    total: z.number().int(),
    nextCursor: z.string().optional(),
  }),
  describe: () => t('askAI_toolListHistory'),
  async execute(input) {
    const { operations } = await listAuditOperations();
    const page = pageOf(operations, input.cursor, actionLimits.max_results);
    if (isActionError(page)) return page;
    return {
      changes: page.items.map(changeView),
      total: page.total,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  },
});

const historyNotFound = actionError(
  'not_found',
  'There is no change with this id in the History.',
  {
    hint: 'Call listHistory for the ids.',
  },
);

const itemView = (item: AuditItem) => ({
  change: item.change,
  outcome: item.outcome,
  type: item.type,
  title: item.title,
  ...(item.url ? { url: item.url } : {}),
  ...(item.before ? { before: placeView(item.before) } : {}),
  ...(item.after ? { after: placeView(item.after) } : {}),
  ...(item.descendants ? { itemsInside: item.descendants } : {}),
  ...(item.reason ? { reason: item.reason } : {}),
});

/** Where an item was or is: its title and address there, and its folder by ref. */
const placeView = (place: NonNullable<AuditItem['before']>) => ({
  ...(place.title === undefined ? {} : { title: place.title }),
  ...(place.url === undefined ? {} : { url: place.url }),
  ...(place.parentId === undefined ? {} : { folderRef: toFolderRef(place.parentId) }),
});

const placeOutput = z
  .object({
    title: z.string().optional(),
    url: z.string().optional(),
    folderRef: z.string().optional(),
  })
  .optional();

const getHistoryChange = defineAction({
  risk: 'read',
  labelKey: 'actionName_getHistoryChange',
  targets: ['library'],
  agent: { description: agentText('get_history_change.agent_description') },
  input: z.object({
    id: z.string().min(1).describe(agentText('get_history_change.id')),
    cursor: z.string().optional().describe(agentText('cursor_input.self')),
  }),
  output: z.object({
    change: changeOutput,
    items: z.array(
      z.object({
        change: auditItemSchema.shape.change,
        outcome: auditItemSchema.shape.outcome,
        type: auditItemSchema.shape.type,
        title: z.string(),
        url: z.string().optional(),
        before: placeOutput.describe(agentText('get_history_change.before')),
        after: placeOutput.describe(agentText('get_history_change.after')),
        itemsInside: z.number().int().optional(),
        reason: z.string().optional(),
      }),
    ),
    total: z.number().int(),
    omitted: z.number().int().describe(agentText('get_history_change.omitted')),
    nextCursor: z.string().optional(),
  }),
  describe: () => t('askAI_toolGetHistoryChange'),
  async execute(input) {
    const operation = await getAuditOperation(input.id);
    if (!operation) return historyNotFound;
    const details = await getAuditDetails(input.id);
    // A record of settings or data, or one whose rows no longer read, has no items to show.
    const stored = typeof details === 'string' ? { items: [], omitted: 0 } : details;
    const page = pageOf(stored.items, input.cursor, actionLimits.max_results);
    if (isActionError(page)) return page;
    return {
      change: changeView(operation),
      items: page.items.map(itemView),
      total: page.total,
      omitted: stored.omitted,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  },
});

/** The bookmarks a call covers: a folder, or everything. */
async function scopedNodes(folder: string | undefined): Promise<BookmarkTreeNode[] | ActionError> {
  const library = await loadActionLibrary();
  if (!folder) return library.tree;
  const resolved = resolveActionFolder(library, folder);
  return isActionError(resolved) ? resolved : [resolved.node];
}

const scopeInput = z.object({
  folder: z.string().min(1).optional().describe(agentText('cleaner_scope.folder')),
});

const countList = z.array(z.object({ label: z.string(), count: z.number().int() })).optional();

const getStatistics = defineAction({
  risk: 'read',
  labelKey: 'actionName_getStatistics',
  targets: ['library', 'folder'],
  agent: { description: agentText('get_statistics.agent_description') },
  input: scopeInput,
  output: z.object({
    totalBookmarks: z.number().int(),
    totalFolders: z.number().int(),
    bookmarksInScope: z.number().int(),
    deepestLevel: z.number().int(),
    topDomains: countList,
    topFolders: countList,
    protocols: countList,
    duplicateCount: z.number().int().optional(),
    depthBreakdown: z
      .array(z.object({ level: z.number().int(), count: z.number().int() }))
      .optional(),
  }),
  describe: () => t('askAI_toolGetStatistics'),
  async execute(input, context) {
    const nodes = await scopedNodes(input.folder);
    if (isActionError(nodes)) return nodes;
    return collectBookmarkStatistics(nodes, getToolOptions(context.settings).statistics);
  },
});

const packContext = defineAction({
  risk: 'read',
  labelKey: 'actionName_packContext',
  targets: ['library', 'folder'],
  agent: { description: agentText('pack_context.agent_description') },
  input: scopeInput,
  output: z.object({
    bookmarks: z.number().int(),
    format: z.string(),
    content: z.string(),
  }),
  describe: () => t('askAI_toolPackContext'),
  async execute(input, context) {
    const nodes = await scopedNodes(input.folder);
    if (isActionError(nodes)) return nodes;
    const packed = buildAIContextPack(
      nodes,
      getToolOptions(context.settings).aiContextPacker,
      await bookmarkMetadataValue.get(),
    );
    return { bookmarks: packed.itemCount, format: packed.format, content: packed.content };
  },
});

export const INSIGHT_ACTIONS = { listHistory, getHistoryChange, getStatistics, packContext };
