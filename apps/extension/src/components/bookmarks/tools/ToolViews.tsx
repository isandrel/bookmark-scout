/**
 * How each tool in `TOOL_DEFINITIONS` shows its run: the review dialog, and extra card controls.
 * Tools without a review (the AI context pack downloads a file) have no entry.
 */
import { useState } from 'react';

export type ToolReviewProps<Id extends ToolId> = {
  tool: ToolDefinitions[Id];
  state: ToolRunState<ToolResults[Id]>;
  apply: (selection: ToolSelections[Id]) => Promise<void>;
  undo: () => void;
  close: () => void;
  /** The page's tree, and its reload for reviews that change bookmarks on their own. */
  environment: ToolEnvironment;
};

/** The results dialog every review but reorganization uses, titled after the tool. */
function ReviewDialog<Id extends ToolId>({
  tool,
  state,
  close,
  description,
  children,
}: Pick<ToolReviewProps<Id>, 'tool' | 'state' | 'close'> & {
  description: string;
  children: React.ReactNode;
}) {
  return (
    <ToolResultsDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t(tool.titleKey)}
      description={description}
    >
      {children}
    </ToolResultsDialog>
  );
}

function DeadLinksReview(props: ToolReviewProps<'deadLinks'>) {
  const [repair, setRepair] = useState<DeadLinkScanResult | null>(null);
  return (
    <>
      <ReviewDialog {...props} description={t('tools_deadLinksDialogDesc')}>
        <DeadLinkResultsView
          result={props.state.result}
          onReview={() => {
            setRepair(props.state.result);
            props.close();
          }}
        />
      </ReviewDialog>
      <DeadLinkRepairDialog
        result={repair}
        onClose={() => setRepair(null)}
        onChanged={props.environment.refresh}
      />
    </>
  );
}

export const TOOL_REVIEWS: {
  [Id in ToolId]?: (props: ToolReviewProps<Id>) => React.ReactNode;
} = {
  autoTagging: (props) => (
    <ReviewDialog {...props} description={t('tools_autoTaggingDialogDesc')}>
      <AIMetadataResultsView
        items={props.state.result ?? []}
        saveLabel={t('bookmarks_metadataSaveTags')}
        isSaving={props.state.phase === 'applying'}
        onSave={() => props.apply()}
      />
    </ReviewDialog>
  ),
  summarizer: (props) => (
    <ReviewDialog {...props} description={t('tools_summarizerDialogDesc')}>
      <AIMetadataResultsView
        items={props.state.result ?? []}
        saveLabel={t('bookmarks_metadataSaveSummaries')}
        isSaving={props.state.phase === 'applying'}
        onSave={() => props.apply()}
      />
    </ReviewDialog>
  ),
  reorganization: ({ state, apply, close, environment }) => (
    <ReorganizationDialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      plan={state.result}
      isLoading={state.phase === 'scanning'}
      errors={state.errors}
      onApply={() => apply()}
      onCancel={close}
      bookmarksBarTitle={findBookmarksBarFolder(environment.folders)?.title}
    />
  ),
  duplicates: (props) => {
    const { result, phase, notice } = props.state;
    return (
      <ReviewDialog
        {...props}
        description={tPlural('tools_duplicatesDialogDesc', result?.groups.length ?? 0, [
          String(result?.scannedBookmarks ?? 0),
        ])}
      >
        <DuplicateResultsView
          result={result}
          isRemoving={phase === 'applying'}
          onClose={props.close}
          onConfirm={() => props.apply()}
          notice={notice?.message}
          onUndo={notice?.canUndo ? props.undo : undefined}
        />
      </ReviewDialog>
    );
  },
  urlCleaner: (props) => (
    <ReviewDialog
      {...props}
      description={tPlural('tools_urlCleanerDialogDesc', props.state.result?.previews.length ?? 0)}
    >
      <UrlCleanerResultsView
        result={props.state.result}
        isApplying={props.state.phase === 'applying'}
        onClose={props.close}
        onConfirm={() => props.apply()}
      />
    </ReviewDialog>
  ),
  deadLinks: (props) => <DeadLinksReview {...props} />,
  metadataFetcher: (props) => (
    <ReviewDialog {...props} description={t('tools_metadataDialogDesc')}>
      <MetadataResultsView
        result={props.state.result}
        isApplying={props.state.phase === 'applying'}
        onApply={props.apply}
      />
    </ReviewDialog>
  ),
  siteIcons: (props) => (
    <ReviewDialog {...props} description={t('tools_siteIconsDialogDesc')}>
      <SiteIconResultsView
        result={props.state.result}
        isSaving={props.state.phase === 'applying'}
        onSave={() => props.apply()}
      />
    </ReviewDialog>
  ),
  privacyScanner: (props) => (
    <ReviewDialog {...props} description={t('tools_privacyDialogDesc')}>
      <PrivacyResultsView result={props.state.result} />
    </ReviewDialog>
  ),
  statistics: (props) => (
    <ReviewDialog {...props} description={t('tools_statisticsDialogDesc')}>
      <StatisticsResultsView result={props.state.result} />
    </ReviewDialog>
  ),
};

/** The saved site icon count and size, and a button that clears them. */
function SiteIconCacheControls() {
  const siteIconCache = useSiteIconCacheSummary();
  const [clearing, setClearing] = useState(false);
  const clear = async () => {
    setClearing(true);
    try {
      await clearSiteIconCache();
      toast({
        title: t('toast_siteIconsCleared'),
        description: t('toast_siteIconsClearedDesc'),
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: t('toast_toolFailed'),
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setClearing(false);
    }
  };
  return (
    <>
      <span className="flex-1 text-xs text-muted-foreground">
        {tPlural('tools_siteIconsCached', siteIconCache.count, [
          formatKilobytes(siteIconCache.bytes),
        ])}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs"
        onClick={clear}
        disabled={siteIconCache.count === 0 || clearing}
      >
        {t('tools_siteIconsClear')}
      </Button>
    </>
  );
}

/** Tool-specific controls shown on a card above its scope selector. */
export const TOOL_CONTROLS: Partial<Record<ToolId, () => React.ReactNode>> = {
  siteIcons: SiteIconCacheControls,
};
