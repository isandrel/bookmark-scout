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
};

/** What the review passes to `apply`: the items the user picked, where a tool lets them pick. */
export type ToolSelections = {
  // biome-ignore lint/suspicious/noConfusingVoidType: tools without a pick call `apply()` bare.
  [Id in ToolId]: Id extends 'metadataFetcher' ? MetadataFetchResultItem[] : void;
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
  xml: { name: 'bookmark-context.xml', mimeType: 'application/xml' },
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
  deleted: 'qaManager_reorgIssueDeleted',
  changed: 'ai_reorgIssueChanged',
  failed: 'ai_reorgIssueFailed',
} as const satisfies Record<BookmarkChangeIssue['reason'], string>;

/**
 * What a tool's Undo reports when the change was undone already with Ctrl+Z, which shares its
 * undo history entry.
 */
export function alreadyUndoneOutcome(): ToolOutcome {
  return { title: t('qaManager_alreadyUndone'), description: t('qaManager_alreadyUndoneDesc') };
}

/** What reverting a batch of reviewed changes reports. */
function reportUndone({ restored, failed, alreadyUndone }: BookmarkChangesUndoResult): ToolOutcome {
  if (alreadyUndone) return alreadyUndoneOutcome();
  return {
    title: failed ? t('toast_changesUndonePartial') : t('toast_changesUndone'),
    description: t('toast_changesUndoneDesc', [String(restored), String(failed)]),
    variant: failed ? 'destructive' : 'success',
  };
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
  result: Pick<BookmarkChangesResult, 'undo' | 'expiresAt'>,
): ToolOutcome {
  const undo = undoOffer(counts.applied, result.undo, result.expiresAt);
  return isComplete(counts)
    ? {
        title: t(keys.appliedTitle),
        description: tPlural(keys.appliedDescription, counts.applied),
        variant: 'success',
        ...undo,
      }
    : {
        title: t(keys.partialTitle),
        description: t(keys.partialDescription, [
          String(counts.applied),
          String(counts.skipped),
          String(counts.failed),
        ]),
        variant: 'destructive',
        ...undo,
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
    async apply(items, _selection, { settings }) {
      const saved = await saveReviewedBookmarkMetadata(items, (item) => ({ tags: item.tags }), {
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
    async apply(items, _selection, { settings }) {
      const saved = await saveReviewedBookmarkMetadata(
        items,
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
    async scan({ nodes, options, aiSettings }) {
      return generateReorganizationPlan(nodes, await aiSettings(), options.reorganization);
    },
    // A rescan would ask the AI again, so a partial outcome is shown with the reviewed plan.
    keepResultAfterApply: true,
    async apply(plan, _selection, { reviewed }) {
      const result = await applyReorganizationPlan(plan, { previewConfirmed: reviewed });
      if (result.status === 'blocked') return { title: t('error_generic'), errors: [result.error] };
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
        undo:
          applied > 0
            ? async () => {
                const undone = await result.undo();
                if (undone.alreadyUndone) return alreadyUndoneOutcome();
                return {
                  title: undone.failed
                    ? t('toast_reorganizeUndoPartial')
                    : t('toast_reorganizeUndone'),
                  description: t('toast_reorganizeUndoneDesc', [
                    String(undone.restored),
                    String(undone.failed),
                  ]),
                  variant: undone.failed ? 'destructive' : 'success',
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
    async apply(result) {
      const removal = await removeDuplicateExtras(result.groups, result.match);
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
    async apply(result) {
      const changes = await applyBookmarkChanges(getUrlCleanerChanges(result.previews), {
        tool: 'tools_cleanUrls',
      });
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
    scan: ({ nodes, options }) => fetchBookmarkMetadata(nodes, options.metadataFetcher),
    async apply(_result, selected) {
      const titleChanges = getMetadataTitleChanges(selected);
      const changes = await applyBookmarkChanges(titleChanges, { tool: 'tools_metadataFetcher' });
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
    async scan({ nodes, options }) {
      const cached = await getSiteIconCache();
      const cachedIcons = Object.fromEntries(
        Object.entries(cached).map(([origin, entry]) => [origin, entry.icon]),
      );
      return refreshSiteIcons(nodes, options.siteIcons, cachedIcons);
    },
    async apply(result, _selection, { settings }) {
      const { saved, evicted } = await saveSiteIcons(getSavableSiteIcons(result), {
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
  privacyScanner: {
    id: 'privacyScanner',
    enabledSetting: 'privacyScannerEnabled',
    scopeSetting: 'privacyScannerDefaultScope',
    section: 'security',
    icon: ShieldAlert,
    titleKey: 'tools_privacyScanner',
    descriptionKey: 'tools_privacyScannerDesc',
    actionKey: () => 'action_scan',
    scan: ({ nodes, options }) => scanBookmarkPrivacy(nodes, options.privacyScanner),
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
  }),
);

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
