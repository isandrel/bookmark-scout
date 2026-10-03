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
import type { BookmarkTreeNode } from '@/types';

export type ToolSectionId = 'ai' | 'maintenance' | 'metadata' | 'security' | 'analytics';

/** Sidebar sections in display order; the data section (export and import) follows them. */
export const TOOL_SECTIONS: ReadonlyArray<{ id: ToolSectionId; titleKey: string }> = [
  { id: 'ai', titleKey: 'tools_category_ai' },
  { id: 'maintenance', titleKey: 'tools_category_maintenance' },
  { id: 'metadata', titleKey: 'tools_category_metadata' },
  { id: 'security', titleKey: 'tools_category_security' },
  { id: 'analytics', titleKey: 'tools_category_analytics' },
];

/** What a run reports to the user, and how to revert it when the tool allows that. */
export type ToolOutcome = {
  title: string;
  description?: string;
  /** Left out for a neutral notice. */
  variant?: 'success' | 'destructive';
  /** Keep the review open, rescanned from the live tree, with this outcome shown above it. */
  keepOpen?: boolean;
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
  /** The default AI service; fails first when AI features are off. */
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
  /** Disabled, with a notice, while AI features are off. */
  requiresAI?: boolean;
  /** Applying changes bookmarks, so the page reloads its tree after apply and undo. */
  changesBookmarks?: boolean;
  /** The review opens when the scan starts and shows scan errors (reorganization). */
  reviewWhileScanning?: boolean;
  /** Apply right after the scan instead of waiting for a review. */
  autoApply?(settings: Settings): boolean;
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

/** The success or partial-success report for a batch of reviewed bookmark changes. */
function reportChanges(counts: ChangeCounts, keys: ChangeMessageKeys): ToolOutcome {
  return isComplete(counts)
    ? {
        title: t(keys.appliedTitle),
        description: tPlural(keys.appliedDescription, counts.applied),
        variant: 'success',
      }
    : {
        title: t(keys.partialTitle),
        description: t(keys.partialDescription, [
          String(counts.applied),
          String(counts.skipped),
          String(counts.failed),
        ]),
        variant: 'destructive',
      };
}

/** The report for saved AI suggestions, naming how many were skipped as stale. */
function reportMetadataSaved(
  { saved, skipped }: ReviewedMetadataSaveResult,
  descriptionKey: string,
): ToolOutcome {
  return skipped === 0
    ? { title: t('bookmarks_metadataSaved'), description: t(descriptionKey), variant: 'success' }
    : {
        title: t('bookmarks_metadataPartlySaved'),
        description: t('bookmarks_metadataPartlySavedDesc', [String(saved), String(skipped)]),
        variant: 'destructive',
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
    requiresAI: true,
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
    requiresAI: true,
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
    actionKey: (settings) =>
      settings.reorganizationDryRunFirst ? 'action_analyze' : 'action_applyChanges',
    requiresAI: true,
    changesBookmarks: true,
    reviewWhileScanning: true,
    autoApply: (settings) => !settings.reorganizationDryRunFirst,
    scanFailureKey: 'ai_reorgAnalyzeFailed',
    async scan({ nodes, options, aiSettings }) {
      return generateReorganizationPlan(nodes, await aiSettings(), options.reorganization);
    },
    async apply(plan, _selection, { reviewed }) {
      const result = await applyReorganizationPlan(plan, { previewConfirmed: reviewed });
      if (!result.success) return { title: t('error_generic'), errors: result.errors };
      return {
        title: t('toast_reorganizeSuccess'),
        description: t('toast_reorganizeSuccessDesc'),
        variant: 'success',
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
                const { restored, failed } = await removal.undo();
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
      const changes = await applyBookmarkChanges(getUrlCleanerChanges(result.previews));
      return reportChanges(changes, {
        appliedTitle: 'toast_urlCleanerApplied',
        appliedDescription: 'toast_urlCleanerAppliedDesc',
        partialTitle: 'toast_urlCleanerPartial',
        partialDescription: 'toast_urlCleanerPartialDesc',
      });
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
    scan: ({ nodes, options }) => scanDeadLinks(nodes, options.deadLinks),
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
      const changes = await applyBookmarkChanges(titleChanges);
      return reportChanges(
        // Picked items without a suggestion have nothing to apply.
        { ...changes, skipped: changes.skipped + selected.length - titleChanges.length },
        {
          appliedTitle: 'toast_metadataApplied',
          appliedDescription: 'toast_metadataAppliedDesc',
          partialTitle: 'toast_metadataPartial',
          partialDescription: 'toast_metadataPartialDesc',
        },
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

/** The scope the tool's card starts on. */
export function getToolDefaultScope(settings: Settings, tool: ToolDefinition): BookmarkToolScope {
  return settings[tool.scopeSetting];
}

/** The enabled tools in a section, in table order. */
export function getSectionTools(settings: Settings, section: ToolSectionId): ToolDefinition[] {
  return (Object.values(TOOL_DEFINITIONS) as ToolDefinition[]).filter(
    (tool) => tool.section === section && settings[tool.enabledSetting],
  );
}
