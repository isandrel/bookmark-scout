/**
 * Exporting and importing bookmarks as actions, for agents and Bookmark Scout's own pages: an
 * export of all bookmarks or a folder as text in one of the export formats, with the export
 * settings the Tools sidebar uses (`exportOptionsFor`); and an import of a file's text into a
 * folder, planned and applied as the sidebar's import does (`planImport`, `applyImportPlan`), one
 * step in the undo history. HTML needs a page's DOM parser, so in the background (where agents'
 * calls run) only JSON imports.
 */
import { z } from 'zod';

const EXPORT_FORMAT_IDS = Object.keys(exportFormats) as [string, ...string[]];
const IMPORT_FORMAT_IDS = Object.keys(importFormats) as [string, ...string[]];
const DUPLICATE_STRATEGIES = ['skip-anywhere', 'skip-in-target', 'import-all'] as const;

const exportBookmarksAction = defineAction({
  risk: 'read',
  labelKey: 'actionName_exportBookmarkFile',
  targets: ['library', 'folder'],
  agent: { description: agentText('export_bookmarks.agent_description') },
  input: z.object({
    format: z.enum(EXPORT_FORMAT_IDS).describe(agentText('export_bookmarks.format')),
    folder: z.string().min(1).optional().describe(agentText('cleaner_scope.folder')),
  }),
  output: z.object({ bookmarks: z.number().int(), content: z.string() }),
  describe: () => t('askAI_toolExportBookmarkFile'),
  async execute(input, context) {
    const library = await loadActionLibrary();
    let nodes = library.tree;
    if (input.folder) {
      const folder = resolveActionFolder(library, input.folder);
      if (isActionError(folder)) return folder;
      nodes = [folder.node];
    }
    const format = exportFormats[input.format];
    const root = buildExportRoot(nodes);
    const metadata = format === jsonFormat ? await bookmarkMetadataValue.get() : undefined;
    return {
      bookmarks: countExportedBookmarks(root),
      content: exportBookmarks(root, format, exportOptionsFor(context.settings, metadata)),
    };
  },
});

/** The plan an import would carry out, or why it cannot: the format, the text, or the folder. */
async function importPlanFor(input: {
  format: string;
  content: string;
  folder: string;
  duplicates: (typeof DUPLICATE_STRATEGIES)[number];
}): Promise<ImportPlan | ActionError> {
  if (input.format === 'html' && typeof DOMParser === 'undefined') {
    return actionError('unavailable', 'HTML can only be imported from Bookmark Scout\x27s pages.', {
      hint: 'Pass the bookmarks as JSON, in the shape exportBookmarkFile writes.',
    });
  }
  const library = await loadActionLibrary();
  const folder = resolveActionFolder(library, input.folder);
  if (isActionError(folder)) return folder;
  let parsed: ImportResult;
  try {
    parsed = parseBookmarks(input.content, importFormats[input.format]);
  } catch (error) {
    return actionError(
      'invalid_input',
      `The ${input.format} could not be read: ${getErrorMessage(error)}`,
    );
  }
  if (parsed.bookmarkCount + parsed.folderCount === 0) {
    return actionError('invalid_input', 'The content holds no bookmarks.');
  }
  try {
    return planImport(parsed, library.tree, folder.node.id, input.duplicates);
  } catch (error) {
    return actionError('not_allowed', getErrorMessage(error));
  }
}

const importBookmarksAction = defineAction({
  risk: 'write',
  alwaysAsk: true,
  labelKey: 'actionName_importBookmarkFile',
  targets: ['folder'],
  agent: { description: agentText('import_bookmarks.agent_description') },
  input: z.object({
    format: z.enum(IMPORT_FORMAT_IDS).describe(agentText('import_bookmarks.format')),
    content: z
      .string()
      .min(1)
      .max(actionLimits.max_import_chars)
      .describe(agentText('import_bookmarks.content')),
    folder: z.string().min(1).describe(agentText('import_bookmarks.folder')),
    duplicates: z
      .enum(DUPLICATE_STRATEGIES)
      .default('skip-anywhere')
      .describe(agentText('import_bookmarks.duplicates')),
  }),
  output: z.object({
    bookmarksCreated: z.number().int(),
    foldersCreated: z.number().int(),
    skipped: z.number().int(),
    failed: z.number().int(),
  }),
  describe: () => t('askAI_toolImportBookmarkFile'),
  approvalPreview: {
    lines: (input) => [
      t('askAI_approvalImport', [String(input.format ?? ''), String(input.folder ?? '')]),
    ],
  },
  async precheck(input) {
    const plan = await importPlanFor(input);
    return isActionError(plan) ? plan : undefined;
  },
  async execute(input) {
    const plan = await importPlanFor(input);
    if (isActionError(plan)) return plan;
    const outcome = await applyImportPlan(plan);
    return {
      bookmarksCreated: outcome.bookmarksCreated,
      foldersCreated: outcome.foldersCreated,
      skipped: outcome.skipped,
      failed: outcome.failed,
    };
  },
});

export const DATA_ACTIONS = {
  exportBookmarkFile: exportBookmarksAction,
  importBookmarkFile: importBookmarksAction,
};
