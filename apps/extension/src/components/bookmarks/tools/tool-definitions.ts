/**
 * Every Tools sidebar tool as one table entry: where it shows, how it looks, what it scans, and
 * how a reviewed result is applied and undone. `createToolRun` runs any entry the same way, so a
 * new tool is a new entry here plus, when it has a review, a view in `ToolViews.tsx`.
 */
import {
  BarChart3,
  Copy,
  Eraser,
  FileOutput,
  FileText,
  ImageIcon,
  Link2Off,
  type LucideIcon,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Tags,
  TextSearch,
  Wand2,
} from 'lucide-react';
import { z } from 'zod';
import type { BookmarkTreeNode } from '@/types';

/** Each sidebar section's title; their order is `sections` in config/ui/tools-sidebar.toml. */
const TOOL_SECTION_TITLES = {
  maintenance: 'tools_category_maintenance',
  metadata: 'tools_category_metadata',
  security: 'tools_category_security',
  analytics: 'tools_category_analytics',
  ai: 'tools_category_ai',
} as const;

export type ToolSectionId = keyof typeof TOOL_SECTION_TITLES;

/** One line under an outcome, keyed by the item it is about (a bookmark id). */
export type ToolOutcomeNote = { id: string; text: string };

/** What a run reports to the user, and how to revert it when the tool allows that. */
export type ToolOutcome = {
  title: string;
  description?: string;
  /** Left out for a neutral notice. */
  variant?: 'success' | 'destructive';
  /**
   * Keep the review open with this outcome shown above it, rescanned from the live tree unless
   * the tool keeps its result (`keepResultAfterApply`).
   */
  keepOpen?: boolean;
  /** Lines the review lists under the outcome while it stays open, such as skipped items. */
  notes?: ToolOutcomeNote[];
  /** Problems to show inside the review instead of announcing the outcome. */
  errors?: string[];
  /** Reverts the change and resolves with what to report about the revert. */
  undo?: () => Promise<ToolOutcome>;
  /** When `undo` stops working (epoch milliseconds); the bookmark undo window by default. */
  undoExpiresAt?: number;
  /** The change's Audit History record, for View in History. */
  historyId?: string;
};

/** A file to save after the export privacy review (see `useExportPrivacyReview`). */
export type ToolFileRequest = {
  nodes: BookmarkTreeNode[];
  /** The bookmarks that actually reach the file, when fewer than `nodes`. */
  reviewNodes?: BookmarkTreeNode[];
  includeUrls: boolean;
};

export type ToolContext = {
  settings: Settings;
  options: ToolOptions;
  scope: BookmarkToolScope;
  /** Bookmarks in the run's scope. */
  nodes: BookmarkTreeNode[];
  /** The AI service of the tool's `aiFeature`; fails first when AI features are off. */
  aiSettings(): Promise<AISettings>;
  /** Saves a file once the privacy review allows it; `write` gets the nodes to write. */
  saveFile(request: ToolFileRequest, write: (nodes: BookmarkTreeNode[]) => void): void;
  /** Reports an outcome that happens after the run, such as a file saved after the review. */
  notify(outcome: ToolOutcome): void;
};

export type ToolApplyContext = ToolContext & {
  /** False when the tool applies straight after the scan, without a review. */
  reviewed: boolean;
};

export type ToolDefinition<Result = unknown, Selection = void> = {
  id: ToolId;
  /** The setting that shows or hides the card. */
  enabledSetting: `${ToolId}Enabled`;
  /** The setting with the scope the card starts on. */
  scopeSetting: `${ToolId}DefaultScope`;
  section: ToolSectionId;
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
  /** The card's button label. */
  actionKey(settings: Settings): string;
  /** Network tools ask for optional website access before the first scan. */
  needsHostAccess?: boolean;
  /**
   * The scan runs as a background job of this kind (`services/job-coordinator.ts`): it keeps
   * going when the page closes, with pause, resume, and cancel; `scan` is then unused here.
   * `result` turns the job's saved results into what the review shows, and the review keeps
   * them after an apply instead of scanning again.
   */
  job?: { kind: ScanJobKind; result(job: JobRecord, results: unknown[]): Result };
  /**
   * The AI feature the tool is (`AI_FEATURES`), which picks its AI service. Disabled, with a
   * notice, while AI features are off or that service is not set up.
   */
  aiFeature?: AIFeature;
  /** Applying changes bookmarks, so the page reloads its tree after apply and undo. */
  changesBookmarks?: boolean;
  /** The review opens when the scan starts and shows scan errors (reorganization). */
  reviewWhileScanning?: boolean;
  /** Apply right after the scan instead of waiting for a review. */
  autoApply?(settings: Settings): boolean;
  /**
   * Keep showing the reviewed result after an apply or undo instead of scanning again, for a
   * scan that is costly (an AI request).
   */
  keepResultAfterApply?: boolean;
  /** Message when a scan fails without one of its own. */
  scanFailureKey?: string;
  /** Toast title when applying fails. */
  applyFailureTitleKey?: string;
  scan(context: ToolContext): Result | Promise<Result>;
  /** Resolves with the outcome to report, or nothing when the tool reports later itself. */
  apply?(
    result: Result,
    selection: Selection,
    context: ToolApplyContext,
  ): Promise<ToolOutcome | undefined>;
};

/** What each tool's scan produces. */
export type ToolResults = {
  aiContextPacker: { nodes: BookmarkTreeNode[]; metadata: StoredBookmarkMetadataById };
  autoTagging: AutoTaggingResultItem[];
  summarizer: SummarizerResultItem[];
  reorganization: ReorganizationPlan;
  duplicates: DuplicateScanResult;
  urlCleaner: UrlCleanerResult;
  deadLinks: DeadLinkScanResult;
  metadataFetcher: MetadataFetchResult;
  siteIcons: SiteIconRefreshResult;
  privacyScanner: PrivacyScanResult;
  statistics: BookmarkStatistics;
  bookmarkRules: RulePlanItem[];
  pageText: PageTextScanResult;
};

/** What a review passes to `apply` for the tools that let the user pick. */
type PickedItems = {
  metadataFetcher: MetadataFetchResultItem[];
  /** The groups to remove from, each with the bookmark to keep first and then the copies. */
  duplicates: DuplicateGroup[];
  /** The URLs to clean, left on Clean in the review. */
  urlCleaner: UrlCleanerPreview[];
  /** The sites whose icons to save, left on Save in the review. */
  siteIcons: SiteIconResultItem[];
  /** The suggestions to save, left on Save in the review. */
  autoTagging: AutoTaggingResultItem[];
  summarizer: SummarizerResultItem[];
  /** The flagged bookmarks to delete, left on Delete in the review. */
  privacyScanner: PrivacyScanItem[];
  /** The bookmarks to change as the rules say, left on Apply in the review. */
  bookmarkRules: RulePlanItem[];
  /** The pages whose text to keep, left on Save in the review. */
  pageText: PageTextScanItem[];
};

/** What the review passes to `apply`: the items the user picked, where a tool lets them pick. */
export type ToolSelections = {
  // biome-ignore lint/suspicious/noConfusingVoidType: tools without a pick call `apply()` bare.
  [Id in ToolId]: Id extends keyof PickedItems ? PickedItems[Id] : void;
};

export type ToolDefinitions = {
  [Id in ToolId]: ToolDefinition<ToolResults[Id], ToolSelections[Id]> & {
    id: Id;
    enabledSetting: `${Id}Enabled`;
    scopeSetting: `${Id}DefaultScope`;
  };
};

/** The files a context pack downloads as, by format. */
const AI_CONTEXT_PACK_FILES = {
  markdown: {
    name: `bookmark-context.${markdownFormat.extension}`,
    mimeType: markdownFormat.mimeType,
  },
  xml: { name: 'bookmark-context.xml', mimeType: MIME.xml },
} as const satisfies Record<AIContextFormat, { name: string; mimeType: string }>;

type ChangeCounts = { applied: number; skipped: number; failed: number };

type ChangeMessageKeys = {
  appliedTitle: string;
  /** Plural message; the count of applied changes is its first substitution. */
  appliedDescription: string;
  partialTitle: string;
  /** Takes the applied, skipped, and failed counts. */
  partialDescription: string;
};

function isComplete(counts: ChangeCounts): boolean {
  return counts.skipped === 0 && counts.failed === 0;
}

/** The note under a partial reorganization for a move left out, by why. */
const REORGANIZE_ISSUE_KEYS = {
  deleted: 'qaManager_reorgDeleted',
  changed: 'ai_reorgIssueChanged',
  failed: 'ai_reorgIssueFailed',
} as const satisfies Record<BookmarkChangeIssue['reason'], string>;

/**
 * What a tool's Undo reports when the change was undone already with Ctrl+Z, which shares its
 * undo history entry.
 */
export function alreadyUndoneOutcome(): ToolOutcome {
  return { title: t('qaManager_alreadyUndone') };
}

/** What reverting a batch of reviewed changes reports. */
function reportUndone({
  restored,
  failed,
  alreadyUndone,
  metadataNotRestored,
}: BookmarkChangesUndoResult): ToolOutcome {
  if (alreadyUndone) return alreadyUndoneOutcome();
  const partial = failed > 0 || Boolean(metadataNotRestored);
  return {
    title: partial ? t('toast_changesUndonePartial') : t('toast_changesUndone'),
    description: withMetadataGap(
      t('toast_changesUndoneDesc', [String(restored), String(failed)]),
      metadataNotRestored,
    ),
    variant: partial ? 'destructive' : 'success',
  };
}

/** `description` plus how many restored items lost their tags, when any did. */
function withMetadataGap(description: string, metadataNotRestored = 0): string {
  return metadataNotRestored > 0
    ? `${description} ${t('toast_metadataNotRestored', String(metadataNotRestored))}`
    : description;
}

/** The undo a reviewed batch offers, when it changed anything. */
function undoOffer(
  applied: number,
  undo: () => Promise<BookmarkChangesUndoResult>,
  expiresAt?: number,
): Pick<ToolOutcome, 'undo' | 'undoExpiresAt'> {
  if (applied === 0) return {};
  return {
    undo: async () => reportUndone(await undo()),
    ...(expiresAt !== undefined ? { undoExpiresAt: expiresAt } : {}),
  };
}

/**
 * The success or partial-success report for a batch of reviewed bookmark changes, with the undo
 * `applyBookmarkChanges` returned.
 */
function reportChanges(
  counts: ChangeCounts,
  keys: ChangeMessageKeys,
  result: Pick<BookmarkChangesResult, 'undo' | 'expiresAt' | 'recorded'>,
): ToolOutcome {
  const undo = undoOffer(counts.applied, result.undo, result.expiresAt);
  const historyId = result.recorded?.entry.operationId;
  return {
    ...(isComplete(counts)
      ? {
          title: t(keys.appliedTitle),
          description: tPlural(keys.appliedDescription, counts.applied),
          variant: 'success' as const,
        }
      : {
          title: t(keys.partialTitle),
          description: t(keys.partialDescription, [
            String(counts.applied),
            String(counts.skipped),
            String(counts.failed),
          ]),
          variant: 'destructive' as const,
        }),
    ...undo,
    ...(historyId ? { historyId } : {}),
  };
}

/**
 * The report for reviewed changes handed to a background task: no Undo here, since each part is
 * undone from the History.
 */
export function reportBackgroundApply({ count }: { count: number }): ToolOutcome {
  return {
    title: t('jobs_applyStarted'),
    description: tPlural('jobs_applyStartedDesc', count),
    variant: 'success',
  };
}

/** The report for saved AI suggestions, naming how many were skipped as stale. */
function reportMetadataSaved(
  { saved, skipped, undo }: ReviewedMetadataSaveResult,
  descriptionKey: string,
): ToolOutcome {
  const offer = undoOffer(saved, undo);
  return skipped === 0
    ? {
        title: t('bookmarks_metadataSaved'),
        description: t(descriptionKey),
        variant: 'success',
        ...offer,
      }
    : {
        title: t('bookmarks_metadataPartlySaved'),
        description: t('bookmarks_metadataPartlySavedDesc', [String(saved), String(skipped)]),
        variant: 'destructive',
        ...offer,
      };
}

/**
 * The moves of reviewed plan items as bookmark changes, each only while the bookmark is still
 * where the plan found it, with the same address.
 */
function getRuleMoveChanges(items: readonly RulePlanItem[]): BookmarkChange[] {
  return items.flatMap((item) =>
    item.move
      ? [
          {
            kind: 'move' as const,
            id: item.id,
            title: item.title,
            expect: { url: item.url, parentId: item.parentId },
            to: { parentId: item.move.folderId },
          },
        ]
      : [],
  );
}

/**
 * Applies the rule changes the review kept: the tags first, as one metadata save with its own
 * undo, then the moves, as one bookmark change in the history. The two cannot be written at once,
 * so the report counts each, and Undo puts back both.
 */
async function applyRulePlan(items: readonly RulePlanItem[]): Promise<ToolOutcome> {
  const tagged = items.filter((item) => item.addTags.length > 0);
  const tags = await saveReviewedBookmarkMetadata(
    tagged.map((item) => ({ bookmarkId: item.id, url: item.url, tags: item.addTags })),
    (item) => ({ tags: item.tags }),
    { tagMode: 'append', summaryMode: 'replace', dedupeTags: true },
  );
  const moves = getRuleMoveChanges(items);
  if (moves.length === 0) {
    return reportRuleChanges(
      { tagged: tags.saved, moved: 0, skipped: tags.skipped, failed: 0 },
      {
        undo: tags.undo,
      },
    );
  }
  const applied = await applyReviewedChanges(moves, { tool: 'tools_bookmarkRules' });
  if (applied.background) {
    return {
      ...reportBackgroundApply(applied),
      description: t('toast_rulesBackgroundDesc', [String(tags.saved), String(applied.count)]),
    };
  }
  const { result } = applied;
  return reportRuleChanges(
    {
      tagged: tags.saved,
      moved: result.applied,
      skipped: tags.skipped + result.skipped,
      failed: result.failed,
    },
    {
      undo: async () => {
        const undoneMoves = await result.undo();
        const undoneTags = await tags.undo();
        return {
          ...undoneMoves,
          restored: undoneMoves.restored + undoneTags.restored,
          failed: undoneMoves.failed + undoneTags.failed,
        };
      },
      ...(result.expiresAt !== undefined ? { expiresAt: result.expiresAt } : {}),
      ...(result.recorded ? { historyId: result.recorded.entry.operationId } : {}),
    },
  );
}

function reportRuleChanges(
  counts: { tagged: number; moved: number; skipped: number; failed: number },
  {
    undo,
    expiresAt,
    historyId,
  }: {
    undo: () => Promise<BookmarkChangesUndoResult>;
    expiresAt?: number;
    historyId?: string;
  },
): ToolOutcome {
  const complete = counts.skipped === 0 && counts.failed === 0;
  return {
    ...(complete
      ? {
          title: t('toast_rulesApplied'),
          description: t('toast_rulesAppliedDesc', [String(counts.tagged), String(counts.moved)]),
          variant: 'success' as const,
        }
      : {
          title: t('toast_rulesPartial'),
          description: t('toast_rulesPartialDesc', [
            String(counts.tagged),
            String(counts.moved),
            String(counts.skipped),
            String(counts.failed),
          ]),
          variant: 'destructive' as const,
        }),
    ...undoOffer(counts.tagged + counts.moved, undo, expiresAt),
    ...(historyId ? { historyId } : {}),
  };
}

/** What an export reports when its scope holds no bookmarks, instead of writing an empty file. */
export function nothingToExportOutcome(): ToolOutcome {
  return { title: t('toast_nothingToExport'), description: t('toast_nothingToExportDesc') };
}

export const TOOL_DEFINITIONS: ToolDefinitions = {
  aiContextPacker: {
    id: 'aiContextPacker',
    enabledSetting: 'aiContextPackerEnabled',
    scopeSetting: 'aiContextPackerDefaultScope',
    section: 'ai',
    icon: FileText,
    titleKey: 'tools_exportAI',
    descriptionKey: 'tools_exportAIDesc',
    actionKey: () => 'action_export',
    autoApply: () => true,
    async scan({ nodes }) {
      const ids = flattenBookmarks(nodes).map((bookmark) => bookmark.node.id);
      return { nodes, metadata: await getStoredBookmarkMetadata(ids) };
    },
    async apply({ nodes, metadata }, _selection, context) {
      const options = context.options.aiContextPacker;
      const reviewNodes = selectAIContextBookmarks(nodes, options).map((item) => item.node);
      if (reviewNodes.length === 0) {
        context.notify(nothingToExportOutcome());
        return undefined;
      }
      context.saveFile({ nodes, reviewNodes, includeUrls: true }, (reviewed) => {
        const packed = buildAIContextPack(reviewed, options, metadata);
        const file = AI_CONTEXT_PACK_FILES[packed.format];
        downloadExport(packed.content, file.name, file.mimeType);
        context.notify({
          title: t('toast_aiContextPacked'),
          description: tPlural('toast_aiContextPackedDesc', packed.itemCount),
          variant: 'success',
        });
      });
      return undefined;
    },
  },
  autoTagging: {
    id: 'autoTagging',
    enabledSetting: 'autoTaggingEnabled',
    scopeSetting: 'autoTaggingDefaultScope',
    section: 'ai',
    icon: Tags,
    titleKey: 'tools_autoTagging',
    descriptionKey: 'tools_autoTaggingDesc',
    actionKey: () => 'action_analyze',
    aiFeature: 'autoTagging',
    applyFailureTitleKey: 'bookmarks_metadataSaveFailed',
    async scan({ nodes, options, aiSettings }) {
      return suggestBookmarkTags(nodes, await aiSettings(), options.autoTagging);
    },
    async apply(_items, picked, { settings }) {
      const saved = await saveReviewedBookmarkMetadata(picked, (item) => ({ tags: item.tags }), {
        tagMode: settings.autoTaggingMergeMode,
        summaryMode: 'replace',
        dedupeTags: settings.autoTaggingDedupeTags,
      });
      return reportMetadataSaved(saved, 'bookmarks_metadataGeneratedTagsSaved');
    },
  },
  summarizer: {
    id: 'summarizer',
    enabledSetting: 'summarizerEnabled',
    scopeSetting: 'summarizerDefaultScope',
    section: 'ai',
    icon: FileOutput,
    titleKey: 'tools_summarizer',
    descriptionKey: 'tools_summarizerDesc',
    actionKey: () => 'action_analyze',
    aiFeature: 'summarizer',
    applyFailureTitleKey: 'bookmarks_metadataSaveFailed',
    async scan({ nodes, options, aiSettings }) {
      return summarizeBookmarksWithAI(nodes, await aiSettings(), options.summarizer);
    },
    async apply(_items, picked, { settings }) {
      const saved = await saveReviewedBookmarkMetadata(
        picked,
        (item) => ({ summary: item.summary }),
        { tagMode: 'replace', summaryMode: settings.summarizerMergeMode, dedupeTags: true },
      );
      return reportMetadataSaved(saved, 'bookmarks_metadataGeneratedSummariesSaved');
    },
  },
  reorganization: {
    id: 'reorganization',
    enabledSetting: 'reorganizationEnabled',
    scopeSetting: 'reorganizationDefaultScope',
    section: 'ai',
    icon: Sparkles,
    titleKey: 'tools_aiReorganize',
    descriptionKey: 'tools_aiReorganizeDesc',
    // An AI plan is always reviewed before it moves anything.
    actionKey: () => 'action_analyze',
    aiFeature: 'reorganization',
    changesBookmarks: true,
    reviewWhileScanning: true,
    scanFailureKey: 'ai_reorgAnalyzeFailed',
    // Each batch is one AI request; a batch whose answer did not fit adds nothing to the plan.
    job: {
      kind: 'reorganization',
      result: (job, results) =>
        buildReorganizationPlan(
          reorganizationJobOptionsSchema.parse(job.options).context,
          results.flatMap((result) => {
            const { bookmarks, response } = reorganizationBatchResultSchema.parse(result);
            return response ? [{ bookmarks, response }] : [];
          }),
        ),
    },
    async scan({ nodes, options, aiSettings }) {
      return generateReorganizationPlan(nodes, await aiSettings(), options.reorganization);
    },
    // A rescan would ask the AI again, so a partial outcome is shown with the reviewed plan.
    keepResultAfterApply: true,
    async apply(plan, _selection, { reviewed }) {
      const result = await applyReorganizationPlan(plan, { previewConfirmed: reviewed });
      if (result.status === 'blocked') return { title: t('error_generic'), errors: [result.error] };
      if (result.status === 'background') return reportBackgroundApply(result);
      const { applied, foldersCreated, skipped, failed } = result;
      const complete = isComplete({ applied, skipped, failed });
      const counts = [applied, foldersCreated, skipped, failed].map(String);
      return {
        title: complete ? t('toast_reorganizeSuccess') : t('toast_reorganizePartial'),
        description: complete
          ? t('toast_reorganizeAppliedDesc', counts.slice(0, 2))
          : t('toast_reorganizePartialDesc', counts),
        variant: complete ? 'success' : 'destructive',
        // A partial run stays open so the user sees which moves were left out.
        keepOpen: !complete,
        notes: result.issues.map((issue) => ({
          id: issue.id,
          text: t(REORGANIZE_ISSUE_KEYS[issue.reason], [getBookmarkDisplayTitle(issue.title)]),
        })),
        undoExpiresAt: result.expiresAt,
        ...(result.recorded?.entry.operationId
          ? { historyId: result.recorded.entry.operationId }
          : {}),
        undo:
          applied > 0
            ? async () => {
                const undone = await result.undo();
                if (undone.alreadyUndone) return alreadyUndoneOutcome();
                const partial = undone.failed > 0 || Boolean(undone.metadataNotRestored);
                return {
                  title: partial ? t('toast_reorganizeUndoPartial') : t('toast_reorganizeUndone'),
                  description: withMetadataGap(
                    t('toast_reorganizeUndoneDesc', [
                      String(undone.restored),
                      String(undone.failed),
                    ]),
                    undone.metadataNotRestored,
                  ),
                  variant: partial ? 'destructive' : 'success',
                };
              }
            : undefined,
      };
    },
  },
  duplicates: {
    id: 'duplicates',
    enabledSetting: 'duplicatesEnabled',
    scopeSetting: 'duplicatesDefaultScope',
    section: 'maintenance',
    icon: Copy,
    titleKey: 'tools_findDuplicates',
    descriptionKey: 'tools_findDuplicatesDesc',
    actionKey: () => 'action_scan',
    changesBookmarks: true,
    scan: ({ nodes, options }) => scanDuplicateBookmarks(nodes, options.duplicates),
    async apply(result, groups) {
      const removal = await removeDuplicateExtras(groups, result.match);
      const counts = { applied: removal.removed, skipped: removal.skipped, failed: removal.failed };
      const complete = isComplete(counts);
      const description = complete
        ? tPlural('toast_duplicatesRemovedDesc', removal.removed)
        : [
            t('toast_duplicatesPartialDesc', [
              String(removal.removed),
              String(removal.skipped),
              String(removal.failed),
            ]),
            removal.skippedGroups > 0
              ? tPlural('toast_duplicatesSkippedGroupsDesc', removal.skippedGroups)
              : '',
          ]
            .filter(Boolean)
            .join(' ');
      return {
        title: complete ? t('toast_duplicatesRemoved') : t('toast_duplicatesPartiallyRemoved'),
        description,
        ...(removal.historyId ? { historyId: removal.historyId } : {}),
        variant: complete ? 'success' : 'destructive',
        // A partial run stays open so the user sees what is left next to the counts.
        keepOpen: !complete,
        undoExpiresAt: removal.expiresAt,
        undo:
          removal.removed > 0
            ? async () => {
                const { restored, failed, alreadyUndone } = await removal.undo();
                if (alreadyUndone) return alreadyUndoneOutcome();
                return {
                  title: failed ? t('toast_errorRestoringDeletion') : t('toast_deleteRestored'),
                  description: [
                    t('toast_duplicatesRestoredDesc', [String(restored), String(failed)]),
                    // The browser recreates them with new ids and dates.
                    restored > 0 ? t('toast_duplicatesRestoredNote') : '',
                  ]
                    .filter(Boolean)
                    .join(' '),
                  variant: failed ? 'destructive' : 'success',
                };
              }
            : undefined,
      };
    },
  },
  urlCleaner: {
    id: 'urlCleaner',
    enabledSetting: 'urlCleanerEnabled',
    scopeSetting: 'urlCleanerDefaultScope',
    section: 'maintenance',
    icon: Eraser,
    titleKey: 'tools_cleanUrls',
    descriptionKey: 'tools_cleanUrlsDesc',
    actionKey: () => 'action_clean',
    changesBookmarks: true,
    scan: ({ nodes, options }) => previewCleanUrls(nodes, options.urlCleaner),
    async apply(_result, previews) {
      const applied = await applyReviewedChanges(getUrlCleanerChanges(previews), {
        tool: 'tools_cleanUrls',
      });
      if (applied.background) return reportBackgroundApply(applied);
      const changes = applied.result;
      return reportChanges(
        changes,
        {
          appliedTitle: 'toast_urlCleanerApplied',
          appliedDescription: 'toast_urlCleanerAppliedDesc',
          partialTitle: 'toast_urlCleanerPartial',
          partialDescription: 'toast_urlCleanerPartialDesc',
        },
        changes,
      );
    },
  },
  deadLinks: {
    id: 'deadLinks',
    enabledSetting: 'deadLinksEnabled',
    scopeSetting: 'deadLinksDefaultScope',
    section: 'maintenance',
    icon: Link2Off,
    titleKey: 'tools_checkDeadLinks',
    descriptionKey: 'tools_checkDeadLinksDesc',
    actionKey: () => 'action_scan',
    needsHostAccess: true,
    job: {
      kind: 'deadLinks',
      result: (job, results) => ({
        scannedBookmarks: job.total,
        items: results as DeadLinkResultItem[],
      }),
    },
    // Repairs are reviewed and applied in DeadLinkRepairDialog.
    scan: async ({ nodes, options }) =>
      scanDeadLinks(nodes, {
        ...options.deadLinks,
        // Granted only the bookmarks' own sites, a redirect elsewhere is not a confirmed loop.
        allSitesAccess: await hasPermission('webAccess'),
      }),
  },
  metadataFetcher: {
    id: 'metadataFetcher',
    enabledSetting: 'metadataFetcherEnabled',
    scopeSetting: 'metadataFetcherDefaultScope',
    section: 'metadata',
    icon: RefreshCw,
    titleKey: 'tools_metadataFetcher',
    descriptionKey: 'tools_metadataFetcherDesc',
    actionKey: () => 'action_scan',
    needsHostAccess: true,
    changesBookmarks: true,
    job: {
      kind: 'metadataFetcher',
      result: (job, results) => ({
        scannedBookmarks: job.total,
        items: results as MetadataFetchResultItem[],
      }),
    },
    scan: ({ nodes, options }) => fetchBookmarkMetadata(nodes, options.metadataFetcher),
    async apply(_result, selected) {
      const titleChanges = getMetadataTitleChanges(selected);
      const applied = await applyReviewedChanges(titleChanges, { tool: 'tools_metadataFetcher' });
      if (applied.background) return reportBackgroundApply(applied);
      const changes = applied.result;
      return reportChanges(
        // Picked items without a suggestion have nothing to apply.
        { ...changes, skipped: changes.skipped + selected.length - titleChanges.length },
        {
          appliedTitle: 'toast_metadataApplied',
          appliedDescription: 'toast_metadataAppliedDesc',
          partialTitle: 'toast_metadataPartial',
          partialDescription: 'toast_metadataPartialDesc',
        },
        changes,
      );
    },
  },
  siteIcons: {
    id: 'siteIcons',
    enabledSetting: 'siteIconsEnabled',
    scopeSetting: 'siteIconsDefaultScope',
    section: 'metadata',
    icon: ImageIcon,
    titleKey: 'tools_siteIcons',
    descriptionKey: 'tools_siteIconsDesc',
    actionKey: () => 'action_refresh',
    needsHostAccess: true,
    job: {
      kind: 'siteIcons',
      // The adapter stores both counts when it accepts the job.
      result: (job, results) => ({
        ...siteIconJobSummarySchema.parse(job.summary),
        items: results as SiteIconResultItem[],
      }),
    },
    async scan({ nodes, options }) {
      const cached = await getSiteIconCache();
      const cachedIcons = Object.fromEntries(
        Object.entries(cached).map(([origin, entry]) => [origin, entry.icon]),
      );
      return refreshSiteIcons(nodes, options.siteIcons, cachedIcons);
    },
    async apply(result, picked, { settings }) {
      const icons = getSavableSiteIcons({ ...result, items: picked });
      const { saved, evicted } = await saveSiteIcons(icons, {
        maxCacheBytes: settings.siteIconsMaxCacheKb * BYTES_PER_KB,
      });
      return {
        title: t('toast_siteIconsSaved'),
        description:
          evicted > 0
            ? t('toast_siteIconsSavedEvictedDesc', [String(saved), String(evicted)])
            : tPlural('toast_siteIconsSavedDesc', saved),
        variant: 'success',
      };
    },
  },
  pageText: {
    id: 'pageText',
    enabledSetting: 'pageTextEnabled',
    scopeSetting: 'pageTextDefaultScope',
    section: 'metadata',
    icon: TextSearch,
    titleKey: 'tools_pageText',
    descriptionKey: 'tools_pageTextDesc',
    actionKey: () => 'action_index',
    needsHostAccess: true,
    scan: ({ nodes, options }) => scanPageTexts(nodes, options.pageText),
    async apply(_result, picked) {
      const { saved } = await savePageTextResults(picked);
      return {
        title: t('toast_pageTextSaved'),
        description: tPlural('toast_pageTextSavedDesc', saved),
        variant: 'success',
      };
    },
  },
  privacyScanner: {
    id: 'privacyScanner',
    enabledSetting: 'privacyScannerEnabled',
    scopeSetting: 'privacyScannerDefaultScope',
    section: 'security',
    icon: ShieldAlert,
    titleKey: 'tools_privacyScanner',
    descriptionKey: 'tools_privacyScannerDesc',
    actionKey: () => 'action_scan',
    changesBookmarks: true,
    scan: ({ nodes, options }) => scanBookmarkPrivacy(nodes, options.privacyScanner),
    async apply(_result, picked) {
      const applied = await applyReviewedChanges(getPrivacyRemovals(picked), {
        tool: 'tools_privacyScanner',
      });
      if (applied.background) return reportBackgroundApply(applied);
      const changes = applied.result;
      return reportChanges(
        changes,
        {
          appliedTitle: 'toast_privacyDeleted',
          appliedDescription: 'toast_privacyDeletedDesc',
          partialTitle: 'toast_privacyPartial',
          partialDescription: 'toast_privacyPartialDesc',
        },
        changes,
      );
    },
  },
  bookmarkRules: {
    id: 'bookmarkRules',
    enabledSetting: 'bookmarkRulesEnabled',
    scopeSetting: 'bookmarkRulesDefaultScope',
    section: 'maintenance',
    icon: Wand2,
    titleKey: 'tools_bookmarkRules',
    descriptionKey: 'tools_bookmarkRulesDesc',
    actionKey: () => 'action_run',
    changesBookmarks: true,
    async scan({ nodes }) {
      const [rules, metadata] = await Promise.all([
        bookmarkRulesValue.get(),
        bookmarkMetadataValue.get(),
      ]);
      return planBookmarkRules(rules, nodes, metadata);
    },
    apply: (_items, picked) => applyRulePlan(picked),
  },
  statistics: {
    id: 'statistics',
    enabledSetting: 'statisticsEnabled',
    scopeSetting: 'statisticsDefaultScope',
    section: 'analytics',
    icon: BarChart3,
    titleKey: 'tools_statistics',
    descriptionKey: 'tools_statisticsDesc',
    actionKey: () => 'action_view',
    scan: ({ nodes, options }) => collectBookmarkStatistics(nodes, options.statistics),
  },
};

const siteIconJobSummarySchema = z.strictObject({
  scannedBookmarks: z.number().int().nonnegative(),
  skippedBookmarks: z.number().int().nonnegative(),
});

/** Lists every id of `ids` exactly once, in any order. */
const listsEachOnce = (ids: readonly string[]) => (list: readonly string[]) =>
  list.length === ids.length &&
  new Set(list).size === list.length &&
  ids.every((id) => list.includes(id));

const sidebarConfig = readConfig(
  'ui/tools-sidebar',
  z.strictObject({
    sections: z
      .array(z.string())
      .refine(listsEachOnce(Object.keys(TOOL_SECTION_TITLES)), 'must list every section once'),
    tools: z
      .array(z.string())
      .refine(listsEachOnce(Object.keys(TOOL_DEFINITIONS)), 'must list every tool once'),
    top_level_scope: z.enum(['folder', 'all']),
    export_scope: z.enum(['folder', 'all']),
    default_tab: z
      .string()
      .refine(
        (tab) => ['all', 'data', ...Object.keys(TOOL_SECTION_TITLES)].includes(tab),
        'must be "all", "data", or a section',
      ),
  }),
);

/** A tab of the sidebar: every section, one section, or the data section (export and import). */
export type ToolSidebarTab = 'all' | ToolSectionId | 'data';

/** The tab the sidebar opens on (`default_tab`). */
export const TOOL_SIDEBAR_DEFAULT_TAB = sidebarConfig.default_tab as ToolSidebarTab;

/** The scope the export card starts on in a folder (`export_scope`). */
export const EXPORT_DEFAULT_SCOPE: BookmarkToolScope = sidebarConfig.export_scope;

/** Sidebar sections in display order; the data section (export and import) follows them. */
export const TOOL_SECTIONS: ReadonlyArray<{ id: ToolSectionId; titleKey: string }> = (
  sidebarConfig.sections as ToolSectionId[]
).map((id) => ({ id, titleKey: TOOL_SECTION_TITLES[id] }));

/** Every tool in display order (config/ui/tools-sidebar.toml). */
const TOOL_ORDER = (sidebarConfig.tools as ToolId[]).map(
  (id) => TOOL_DEFINITIONS[id] as ToolDefinition,
);

/**
 * The scope a card starts on: at the manager's top level, where no folder is open, the configured
 * `top_level_scope` ("All bookmarks"); in a folder, the tool's own default (`configured`).
 */
export function getToolStartScope(
  configured: BookmarkToolScope,
  currentFolderId: string | null,
): BookmarkToolScope {
  return currentFolderId ? configured : sidebarConfig.top_level_scope;
}

/** The scope the tool's card starts on, from its Default Scope setting and the open folder. */
export function getToolDefaultScope(
  settings: Settings,
  tool: ToolDefinition,
  currentFolderId: string | null,
): BookmarkToolScope {
  return getToolStartScope(settings[tool.scopeSetting], currentFolderId);
}

/** The enabled tools in a section, in the configured order. */
export function getSectionTools(settings: Settings, section: ToolSectionId): ToolDefinition[] {
  return TOOL_ORDER.filter((tool) => tool.section === section && settings[tool.enabledSetting]);
}
