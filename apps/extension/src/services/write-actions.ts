/**
 * The actions that change bookmarks: moving, renaming, deleting, and creating folders, which
 * agents make through an approved plan (`plan-actions.ts`), and saving a page and undoing a
 * change, which they may call directly. Every change is one entry in the undo history
 * (`recordBookmarkWrites`): Ctrl+Z in the manager and `undoChange` both revert it, and a deleted
 * item is kept there so it can be recreated. A change made as part of a plan uses the plan's
 * writer (`ActionContext.writer`), so the whole plan is one undo step.
 *
 * The bookmarks root, the browser's permanent folders, and folders the browser manages are never
 * changed (`unchangeableReason`).
 */
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

const refList = (what: string) =>
  z.array(z.string()).min(1).max(actionLimits.max_plan_operations).describe(what);

const folderSpecInput = z.string().min(1).describe(agentText('folder_spec_input.self'));

const changeOutput = {
  change: z.string().optional().describe(agentText('change_output.change')),
};

/** Runs `write` as its own undo entry, or as part of the plan whose writer the context holds. */
async function writeChange<T>(
  context: ActionContext,
  label: BookmarkHistoryLabel,
  write: (writer: BookmarkWriter) => Promise<T>,
): Promise<{ result: T; change?: string }> {
  if (context.writer) return { result: await write(context.writer) };
  const { result, recorded } = await recordBookmarkWrites(label, write);
  return { result, ...(recorded?.stored ? { change: recorded.entry.id } : {}) };
}

/** The library items `refs` name, or an error naming the first that cannot be changed. */
function changeableItems(
  library: ActionLibrary,
  refs: readonly string[],
): { id: string; folder?: LibraryFolder; bookmark?: LibraryBookmark }[] | ActionError {
  const items = [];
  for (const ref of refs) {
    const parsed = parseActionRef(ref);
    const id = parsed?.id ?? '';
    const folder = parsed?.kind === 'folder' ? library.folderById.get(id) : undefined;
    const bookmark = parsed?.kind === 'bookmark' ? library.bookmarkById.get(id) : undefined;
    if (!folder && !bookmark) return refProblem(library, ref);
    const reason = unchangeableReason(library, id);
    if (reason) return actionError('not_allowed', `${ref} cannot be changed. ${reason}`);
    items.push({ id, ...(folder ? { folder } : {}), ...(bookmark ? { bookmark } : {}) });
  }
  return items;
}

/** A folder new items can go in: not the root and not one the browser manages. */
function targetFolder(library: ActionLibrary, spec: string): LibraryFolder | ActionError {
  const folder = resolveActionFolder(library, spec);
  if (isActionError(folder)) return folder;
  if (folder.node.unmodifiable) {
    return actionError('not_allowed', `${folder.path} is managed by the browser.`);
  }
  return folder;
}

function expectOf(node: BookmarkTreeNode): PlannedExpectation {
  return {
    id: node.id,
    ...(node.parentId ? { parentId: node.parentId } : {}),
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
  };
}

function bookmarksInside(node: BookmarkTreeNode): number {
  return node.url
    ? 1
    : (node.children ?? []).reduce((sum, child) => sum + bookmarksInside(child), 0);
}

const titleOf = (item: { folder?: LibraryFolder; bookmark?: LibraryBookmark }) =>
  (item.folder?.node ?? item.bookmark?.node)?.title ?? '';

const pathOf = (item: { folder?: LibraryFolder; bookmark?: LibraryBookmark }) =>
  item.folder?.parent?.path ?? item.bookmark?.folder.path ?? '';

/** The child folder titled `title` in `parentId`, created when there is none. */
async function folderNamed(writer: BookmarkWriter, parentId: string, title: string) {
  const existing = (await getBookmarkChildren(parentId)).find(
    (child) => !child.url && child.title === title,
  );
  return existing?.id ?? (await writer.create({ parentId, title })).id;
}

const moveInput = z.object({
  refs: refList('Bookmark refs (b:<id>) or folder refs (f:<id>) to move'),
  to: folderSpecInput.describe(agentText('move_input.to')),
  newFolder: z.string().trim().min(1).optional().describe(agentText('move_input.new_folder')),
});

const moveBookmarks = defineAction({
  risk: 'write',
  labelKey: 'actionName_moveBookmarks',
  targets: ['bookmark', 'folder'],
  input: moveInput,
  output: z.object({ moved: z.number().int(), folder: z.string(), ...changeOutput }),
  describe: () => t('askAI_toolMove'),
  plan(input, library) {
    const items = changeableItems(library, input.refs);
    if (isActionError(items)) return items;
    const target = targetFolder(library, input.to);
    if (isActionError(target)) return target;
    for (const item of items) {
      if (item.folder && isInFolder(target, item.folder)) {
        return actionError('not_allowed', `${item.folder.path} cannot move into itself.`);
      }
    }
    const to = input.newFolder
      ? `${target.path}${AI_FOLDER_PATH_SEPARATOR}${input.newFolder}`
      : target.path;
    return {
      preview: items.map((item) => ({
        kind: 'move',
        title: titleOf(item),
        from: pathOf(item),
        to,
      })),
      expect: items.map((item) =>
        expectOf((item.folder?.node ?? item.bookmark?.node) as BookmarkTreeNode),
      ),
    };
  },
  async execute(input, context) {
    const library = await loadActionLibrary();
    const items = changeableItems(library, input.refs);
    if (isActionError(items)) return items;
    const target = targetFolder(library, input.to);
    if (isActionError(target)) return target;
    const { result, change } = await writeChange(
      context,
      { action: 'move', count: items.length },
      async (writer) => {
        const parentId = input.newFolder
          ? await folderNamed(writer, target.node.id, input.newFolder)
          : target.node.id;
        for (const item of items) await writer.move(item.id, { parentId });
        return items.length;
      },
    );
    return { moved: result, folder: target.path, ...(change ? { change } : {}) };
  },
});

const renameBookmark = defineAction({
  risk: 'write',
  labelKey: 'actionName_renameBookmark',
  targets: ['bookmark', 'folder'],
  input: z.object({
    ref: z.string().describe(agentText('rename_bookmark.ref')),
    title: z.string().trim().min(1).max(INPUT_LIMITS.chars.bookmark_title),
  }),
  output: z.object({ ref: z.string(), title: z.string(), ...changeOutput }),
  describe: (input) => t('askAI_toolRename', input.title ?? ''),
  plan(input, library) {
    const items = changeableItems(library, [input.ref]);
    if (isActionError(items)) return items;
    const [item] = items;
    return {
      preview: [{ kind: 'rename', title: titleOf(item), to: input.title }],
      expect: [expectOf((item.folder?.node ?? item.bookmark?.node) as BookmarkTreeNode)],
    };
  },
  async execute(input, context) {
    const library = await loadActionLibrary();
    const items = changeableItems(library, [input.ref]);
    if (isActionError(items)) return items;
    const [item] = items;
    const { change } = await writeChange(
      context,
      { action: 'edit', title: titleOf(item) },
      (writer) => writer.update(item.id, { title: input.title }),
    );
    return { ref: input.ref, title: input.title, ...(change ? { change } : {}) };
  },
});

const deleteBookmarks = defineAction({
  risk: 'destructive',
  labelKey: 'actionName_deleteBookmarks',
  targets: ['bookmark', 'folder'],
  input: z.object({ refs: refList('Bookmark refs (b:<id>) or folder refs (f:<id>) to delete') }),
  output: z.object({ deleted: z.number().int(), ...changeOutput }),
  describe: () => t('askAI_toolDelete'),
  plan(input, library) {
    const items = changeableItems(library, input.refs);
    if (isActionError(items)) return items;
    const nodes = items.map(
      (item) => (item.folder?.node ?? item.bookmark?.node) as BookmarkTreeNode,
    );
    return {
      preview: items.map((item, index) => ({
        kind: 'delete',
        title: titleOf(item),
        from: pathOf(item),
        ...(item.folder ? { contains: bookmarksInside(nodes[index]) } : {}),
      })),
      expect: nodes.map(expectOf),
      deletes: nodes.reduce((sum, node) => sum + Math.max(1, bookmarksInside(node)), 0),
    };
  },
  async execute(input, context) {
    const library = await loadActionLibrary();
    const items = changeableItems(library, input.refs);
    if (isActionError(items)) return items;
    const { change } = await writeChange(
      context,
      { action: 'delete', count: items.length },
      async (writer) => {
        for (const item of items) await writer.remove(item.id);
      },
    );
    return { deleted: items.length, ...(change ? { change } : {}) };
  },
});

const createFolder = defineAction({
  risk: 'write',
  labelKey: 'actionName_createFolder',
  targets: ['folder'],
  input: z.object({
    parent: folderSpecInput.describe(agentText('create_folder.parent')),
    title: z.string().trim().min(1).max(INPUT_LIMITS.chars.bookmark_title),
  }),
  output: z.object({ ref: z.string(), path: z.string(), ...changeOutput }),
  describe: (input) => t('askAI_toolCreateFolder', input.title ?? ''),
  plan(input, library) {
    const parent = targetFolder(library, input.parent);
    if (isActionError(parent)) return parent;
    return {
      preview: [{ kind: 'createFolder', title: input.title, to: parent.path }],
      expect: [],
    };
  },
  async execute(input, context) {
    const library = await loadActionLibrary();
    const parent = targetFolder(library, input.parent);
    if (isActionError(parent)) return parent;
    const { result, change } = await writeChange(
      context,
      { action: 'add', title: input.title },
      (writer) => writer.create({ parentId: parent.node.id, title: input.title }),
    );
    return {
      ref: toFolderRef(result.id),
      path: `${parent.path}${AI_FOLDER_PATH_SEPARATOR}${input.title}`,
      ...(change ? { change } : {}),
    };
  },
});

/** The folder a page is saved into, or why it cannot be saved there. */
function saveTarget(
  input: { url: string; folder: string },
  library: ActionLibrary,
): LibraryFolder | ActionError {
  if (!isWebUrl(input.url)) {
    return actionError('invalid_input', 'Only http and https pages can be saved.');
  }
  return targetFolder(library, input.folder);
}

const saveBookmark = defineAction({
  risk: 'write',
  labelKey: 'actionName_saveBookmark',
  targets: ['url', 'page'],
  agent: {
    description: agentText('save_bookmark.agent_description'),
  },
  input: z.object({
    url: z.string().describe(agentText('save_bookmark.url')),
    title: z
      .string()
      .trim()
      .max(INPUT_LIMITS.chars.bookmark_title)
      .optional()
      .describe(agentText('save_bookmark.title')),
    folder: folderSpecInput,
    newFolder: z.string().trim().min(1).optional().describe(agentText('save_bookmark.new_folder')),
  }),
  output: z.object({
    ref: z.string(),
    folder: z.string(),
    created: z.boolean().describe(agentText('save_bookmark.created')),
    ...changeOutput,
  }),
  describe: (input) => t('askAI_toolSave', input.title || input.url || ''),
  approvalPreview: {
    lines: (input) => {
      const folder = [input.folder, input.newFolder].filter(Boolean).join(AI_FOLDER_PATH_SEPARATOR);
      return [t('askAI_approvalSave', [String(input.title || input.url || ''), folder])];
    },
    url: (input) => (typeof input.url === 'string' ? input.url : undefined),
  },
  async precheck(input) {
    const target = saveTarget(input, await loadActionLibrary());
    return isActionError(target) ? target : undefined;
  },
  async execute(input, context) {
    const library = await loadActionLibrary();
    const target = saveTarget(input, library);
    if (isActionError(target)) return target;
    const folderPath = input.newFolder
      ? `${target.path}${AI_FOLDER_PATH_SEPARATOR}${input.newFolder}`
      : target.path;
    const sameUrl = (url: string | undefined) =>
      (safeNormalizeUrl(url ?? '') ?? url) === (safeNormalizeUrl(input.url) ?? input.url);
    const into = input.newFolder
      ? library.folders.find(
          (folder) => folder.parent === target && folder.node.title === input.newFolder,
        )
      : target;
    const existing = into?.node.children?.find((child) => child.url && sameUrl(child.url));
    if (existing) {
      return { ref: toBookmarkRef(existing.id), folder: folderPath, created: false };
    }
    const title = input.title?.trim() || input.url;
    const { result, change } = await writeChange(
      context,
      { action: 'add', title },
      async (writer) => {
        const parentId = input.newFolder
          ? await folderNamed(writer, target.node.id, input.newFolder)
          : target.node.id;
        return writer.create({ parentId, title, url: input.url });
      },
    );
    return {
      ref: toBookmarkRef(result.id),
      folder: folderPath,
      created: true,
      ...(change ? { change } : {}),
    };
  },
});

/** What an agent is told when the change it asks to undo is not in the undo history. */
function changeGone(change: string): ActionError {
  return actionError(
    'not_found',
    `Change ${change} does not exist or was already undone; there is nothing to undo.`,
    { hint: 'Use the change id a write returned in this browser session; it can be undone once.' },
  );
}

const undoChange = defineAction({
  risk: 'write',
  labelKey: 'actionName_undoChange',
  targets: ['library'],
  agent: {
    description: agentText('undo_change.agent_description'),
  },
  input: z.object({ change: z.string().min(1).describe(agentText('undo_change.change')) }),
  output: z.object({
    undone: z.number().int(),
    skipped: z.number().int().describe(agentText('undo_change.skipped')),
  }),
  describe: () => t('askAI_toolUndo'),
  approvalPreview: {
    stored: {
      id: (input) => (typeof input.change === 'string' && input.change ? input.change : undefined),
      async load(id) {
        const entry = await getUndoableBookmarkChange(id);
        return entry
          ? { lines: await describeBookmarkChangeUndo(entry), summary: t('askAI_approvalUndo') }
          : null;
      },
      missingKey: 'askAI_undoMissing',
    },
  },
  async precheck(input) {
    return (await getUndoableBookmarkChange(input.change)) ? undefined : changeGone(input.change);
  },
  async execute(input) {
    const outcome = await undoBookmarkChange(input.change);
    if (!outcome) return changeGone(input.change);
    return { undone: outcome.applied, skipped: outcome.skipped };
  },
});

/** The plannable changes, which agents make only through `proposeChanges`. */
export const PLANNABLE_ACTIONS = { moveBookmarks, renameBookmark, deleteBookmarks, createFolder };

export const WRITE_ACTIONS = { ...PLANNABLE_ACTIONS, saveBookmark, undoChange };
