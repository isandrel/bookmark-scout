/**
 * The Tools sidebar's cleaners as actions that only look: URL Cleaner's previews (the addresses
 * its settings would clean) and the Privacy Scanner's findings, on all bookmarks or a folder, with
 * the same options the sidebar uses (`getToolOptions`). Changing anything goes through a plan the
 * user approves: `changeUrl` for a cleaned address, `deleteBookmarks` for a flagged bookmark.
 */
import { z } from 'zod';

const scopeInput = {
  folder: z.string().min(1).optional().describe(agentText('cleaner_scope.folder')),
  cursor: z.string().optional().describe(agentText('cursor_input.self')),
};

/** The nodes a call covers: a folder's, or the whole library. */
async function scopedNodes(folder: string | undefined) {
  const library = await loadActionLibrary();
  if (!folder) return library.tree;
  const resolved = resolveActionFolder(library, folder);
  return isActionError(resolved) ? resolved : [resolved.node];
}

const findUrlCleanups = defineAction({
  risk: 'read',
  labelKey: 'actionName_findUrlCleanups',
  targets: ['library', 'folder'],
  agent: { description: agentText('find_url_cleanups.agent_description'), partOfChanges: true },
  input: z.object(scopeInput),
  output: z.object({
    items: z.array(
      z.object({
        ref: z.string(),
        title: z.string(),
        folder: z.string(),
        url: z.string(),
        cleanedUrl: z.string(),
        removedParams: z.array(z.string()),
      }),
    ),
    total: z.number().int(),
    nextCursor: z.string().optional(),
  }),
  describe: () => t('askAI_toolFindUrlCleanups'),
  async execute(input, context) {
    const nodes = await scopedNodes(input.folder);
    if (isActionError(nodes)) return nodes;
    const { previews } = previewCleanUrls(nodes, getToolOptions(context.settings).urlCleaner);
    const page = pageOf(previews, input.cursor, actionLimits.max_results);
    if (isActionError(page)) return page;
    return {
      items: page.items.map((preview) => ({
        ref: toBookmarkRef(preview.id),
        title: preview.title,
        folder: preview.folderPath,
        url: preview.originalUrl,
        cleanedUrl: preview.cleanedUrl,
        removedParams: preview.removedParams,
      })),
      total: page.total,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  },
});

const scanPrivacy = defineAction({
  risk: 'read',
  labelKey: 'actionName_scanPrivacy',
  targets: ['library', 'folder'],
  agent: { description: agentText('scan_privacy.agent_description') },
  input: z.object(scopeInput),
  output: z.object({
    items: z.array(
      z.object({
        ref: z.string(),
        title: z.string(),
        folder: z.string(),
        severity: z.string(),
        findings: z.array(z.string()).describe(agentText('scan_privacy.findings')),
      }),
    ),
    total: z.number().int(),
    nextCursor: z.string().optional(),
  }),
  describe: () => t('askAI_toolScanPrivacy'),
  async execute(input, context) {
    const nodes = await scopedNodes(input.folder);
    if (isActionError(nodes)) return nodes;
    const { items } = scanBookmarkPrivacy(nodes, getToolOptions(context.settings).privacyScanner);
    const page = pageOf(items, input.cursor, actionLimits.max_results);
    if (isActionError(page)) return page;
    return {
      // The address is left out: it is what holds the private values the scan found.
      items: page.items.map((item) => ({
        ref: toBookmarkRef(item.id),
        title: item.title,
        folder: item.folderPath,
        severity: item.severity,
        findings: item.findings.map((finding) =>
          'param' in finding ? `${finding.kind}:${finding.param}` : finding.kind,
        ),
      })),
      total: page.total,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  },
});

export const CLEANER_ACTIONS = { findUrlCleanups, scanPrivacy };
